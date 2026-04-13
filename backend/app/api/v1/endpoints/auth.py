"""Authentication endpoints for user registration, login, and token management."""

import hashlib
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status, Cookie
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db_session
from app.models import User, RefreshToken
from app.schemas.user import (
    RegisterRequest,
    LoginRequest,
    UserOut,
    TokenOut,
    PremiumRequestCreate,
    PremiumRequestOut,
)
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
    create_verification_token,
    verify_email_token,
)
from app.services.email_service import send_verification_email

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """
    Register a new user account.

    Args:
        body: Registration request with email, name, password
        response: FastAPI response to set cookies
        db: Database session

    Returns:
        Newly created user

    Raises:
        HTTPException: If email already exists
    """
    settings = get_settings()

    # Check if email already exists
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        tier="free",
        is_admin=False,
        is_banned=False,
        verified_email=False,
    )
    db.add(user)
    await db.flush()  # Flush to get the ID

    # Generate verification token and send email
    v_token = create_verification_token(user.id)
    send_verification_email(user.email, v_token)
    
    await db.commit()

    # Create tokens
    access_token = create_access_token(user.id, user.is_admin, user.tier)
    raw_refresh, refresh_hash = create_refresh_token()

    # Store refresh token in database
    expires_at = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    refresh_token_obj = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=expires_at,
    )
    db.add(refresh_token_obj)
    await db.commit()

    # Set httpOnly cookies
    secure = settings.app_env != "development"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/v1/auth/refresh",
    )

    return user


@router.post("/login", response_model=UserOut)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """
    Authenticate user and create session.

    Args:
        body: Login request with email and password
        response: FastAPI response to set cookies
        db: Database session

    Returns:
        Authenticated user

    Raises:
        HTTPException: If credentials are invalid
    """
    settings = get_settings()

    # Find user by email
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    if user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been banned"
        )

    # Create tokens
    access_token = create_access_token(user.id, user.is_admin, user.tier)
    raw_refresh, refresh_hash = create_refresh_token()

    # Store refresh token
    expires_at = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    refresh_token_obj = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=expires_at,
    )
    db.add(refresh_token_obj)
    await db.commit()

    # Set httpOnly cookies
    secure = settings.app_env != "development"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/v1/auth/refresh",
    )

    return user


@router.post("/refresh", response_model=TokenOut)
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias="refresh_token"),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """
    Refresh access token using refresh token.

    Args:
        response: FastAPI response to set new cookies
        refresh_token: Refresh token from httpOnly cookie
        db: Database session

    Returns:
        New access token

    Raises:
        HTTPException: If refresh token is invalid or expired
    """
    settings = get_settings()

    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing"
        )

    # Hash the provided refresh token and look it up
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    result = await db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )
    refresh_obj = result.scalar_one_or_none()

    if not refresh_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    # Check if refresh token has expired
    if refresh_obj.expires_at < datetime.utcnow():
        await db.delete(refresh_obj)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired"
        )

    # Get user
    result = await db.execute(select(User).where(User.id == refresh_obj.user_id))
    user = result.scalar_one_or_none()

    if not user or user.is_banned:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or banned"
        )

    # Create new access token (sliding window: also create new refresh token)
    access_token = create_access_token(user.id, user.is_admin, user.tier)
    raw_refresh, refresh_hash = create_refresh_token()

    # Delete old refresh token and store new one
    await db.delete(refresh_obj)
    expires_at = datetime.utcnow() + timedelta(days=settings.refresh_token_expire_days)
    new_refresh_obj = RefreshToken(
        user_id=user.id,
        token_hash=refresh_hash,
        expires_at=expires_at,
    )
    db.add(new_refresh_obj)
    await db.commit()

    # Set new cookies
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=raw_refresh,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/v1/auth/refresh",
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    current_user: User = Depends(get_current_user),
    refresh_token: str | None = Cookie(default=None, alias="refresh_token"),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """
    Logout user and invalidate tokens.

    Args:
        response: FastAPI response to clear cookies
        current_user: Authenticated user
        refresh_token: Refresh token from cookie
        db: Database session
    """
    # Delete refresh token from database if it exists
    if refresh_token:
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        result = await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        refresh_obj = result.scalar_one_or_none()
        if refresh_obj:
            await db.delete(refresh_obj)
            await db.commit()

    # Clear cookies
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/v1/auth/refresh")


@router.get("/me", response_model=UserOut)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Get current authenticated user's profile.

    Args:
        current_user: Authenticated user

    Returns:
        Current user object
    """
    return current_user


@router.post("/premium-request", response_model=PremiumRequestOut, status_code=status.HTTP_201_CREATED)
async def create_premium_request(
    body: PremiumRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> "PremiumRequest":
    """
    Create a premium upgrade request.

    Args:
        body: Request with reason for upgrade
        current_user: Authenticated user
        db: Database session

    Returns:
        Created premium request

    Raises:
        HTTPException: If user already has pending request
    """
    from app.models import PremiumRequest

    # Check if user already has a pending request
    result = await db.execute(
        select(PremiumRequest).where(
            PremiumRequest.user_id == current_user.id,
            PremiumRequest.status == "pending"
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already have a pending premium request"
        )

    # Create premium request
    premium_req = PremiumRequest(
        user_id=current_user.id,
        reason=body.reason,
        status="pending",
    )
    db.add(premium_req)
    await db.commit()

    return premium_req


@router.get("/premium-request", response_model=PremiumRequestOut | None)
async def get_premium_request(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> "PremiumRequest | None":
    """
    Get the user's premium request status.

    Args:
        current_user: Authenticated user
        db: Database session

    Returns:
        User's premium request or None if none exists
    """
    from app.models import PremiumRequest

    result = await db.execute(
        select(PremiumRequest).where(
            PremiumRequest.user_id == current_user.id
        ).order_by(PremiumRequest.requested_at.desc())
    )
    return result.scalar_one_or_none()


@router.get("/verify-email")
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db_session),
):
    """Verify user's email address."""
    user_id = verify_email_token(token)
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    if user.verified_email:
        return {"msg": "Email already verified"}
    
    user.verified_email = True
    await db.commit()
    
    return {"msg": "Email successfully verified"}
