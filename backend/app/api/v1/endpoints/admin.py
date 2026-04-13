"""Admin endpoints for user management, statistics, and premium request handling."""

from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.models import User, PremiumRequest, UserTier, PremiumRequestStatus
from app.schemas.user import UserOut, PremiumRequestOut
from app.services.auth_service import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminStatsOut:
    """Admin dashboard statistics."""
    def __init__(self, total_users: int, premium_users: int, pending_requests: int):
        self.total_users = total_users
        self.premium_users = premium_users
        self.pending_requests = pending_requests


@router.get("/stats")
async def get_stats(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """
    Get admin dashboard statistics.

    Args:
        _: Admin user (just for auth check)
        db: Database session

    Returns:
        Dictionary with stats
    """
    # Total users
    total_result = await db.execute(select(func.count(User.id)))
    total_users = total_result.scalar() or 0

    # Premium users
    premium_result = await db.execute(
        select(func.count(User.id)).where(User.tier == UserTier.premium)
    )
    premium_users = premium_result.scalar() or 0

    # Pending premium requests
    pending_result = await db.execute(
        select(func.count(PremiumRequest.id)).where(
            PremiumRequest.status == PremiumRequestStatus.pending
        )
    )
    pending_requests = pending_result.scalar() or 0

    # Banned users count
    banned_result = await db.execute(
        select(func.count(User.id)).where(User.is_banned == True)
    )
    banned_users = banned_result.scalar() or 0

    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "free_users": total_users - premium_users,
        "pending_requests": pending_requests,
        "banned_users": banned_users,
    }


@router.get("/users", response_model=dict)
async def list_users(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    search: str = Query(""),
    tier: str | None = Query(None),
) -> dict:
    """
    List all users with pagination and filtering.

    Args:
        _: Admin user
        db: Database session
        page: Page number (1-indexed)
        limit: Items per page
        search: Search by email or name
        tier: Filter by tier ('free' or 'premium')

    Returns:
        Paginated user list
    """
    query = select(User)

    # Apply search filter
    if search:
        query = query.where(
            (User.email.ilike(f"%{search}%")) | (User.name.ilike(f"%{search}%"))
        )

    # Apply tier filter
    if tier in ["free", "premium"]:
        query = query.where(User.tier == tier)

    # Count total
    count_query = select(func.count()).select_from(User)
    if search:
        count_query = count_query.where(
            (User.email.ilike(f"%{search}%")) | (User.name.ilike(f"%{search}%"))
        )
    if tier in ["free", "premium"]:
        count_query = count_query.where(User.tier == tier)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Pagination
    offset = (page - 1) * limit
    query = query.order_by(desc(User.created_at)).offset(offset).limit(limit)

    result = await db.execute(query)
    users = result.scalars().all()

    return {
        "users": [UserOut.model_validate(u) for u in users],
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> User:
    """
    Get a specific user's details.

    Args:
        user_id: User ID
        _: Admin user
        db: Database session

    Returns:
        User object
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return user


@router.patch("/users/{user_id}/ban")
async def toggle_ban_user(
    user_id: int,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> UserOut:
    """
    Toggle ban status for a user.

    Args:
        user_id: User ID to ban/unban
        _: Admin user
        db: Database session

    Returns:
        Updated user
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent banning admins
    if user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot ban admin users"
        )

    user.is_banned = not user.is_banned
    user.updated_at = datetime.utcnow()
    await db.commit()

    return user


@router.patch("/users/{user_id}/tier")
async def update_user_tier(
    user_id: int,
    body: dict,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> UserOut:
    """
    Update user subscription tier.

    Args:
        user_id: User ID
        body: Dictionary with 'tier' field ('free' or 'premium')
        _: Admin user
        db: Database session

    Returns:
        Updated user
    """
    tier = body.get("tier")
    if tier not in ["free", "premium"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tier must be 'free' or 'premium'"
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    user.tier = tier
    user.updated_at = datetime.utcnow()
    await db.commit()

    return user


@router.get("/premium-requests", response_model=dict)
async def list_premium_requests(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
) -> dict:
    """
    List premium upgrade requests.

    Args:
        _: Admin user
        db: Database session
        status_filter: Filter by status ('pending', 'approved', 'rejected')
        page: Page number
        limit: Items per page

    Returns:
        Paginated premium requests with user info
    """
    query = select(PremiumRequest).order_by(desc(PremiumRequest.requested_at))

    # Apply status filter
    if status_filter in ["pending", "approved", "rejected"]:
        query = query.where(PremiumRequest.status == status_filter)

    # Count total
    count_query = select(func.count()).select_from(PremiumRequest)
    if status_filter in ["pending", "approved", "rejected"]:
        count_query = count_query.where(PremiumRequest.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Pagination
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    requests = result.scalars().all()

    # Fetch user info for each request
    requests_with_user = []
    for req in requests:
        user_result = await db.execute(select(User).where(User.id == req.user_id))
        user = user_result.scalar_one_or_none()
        requests_with_user.append({
            "request": PremiumRequestOut.model_validate(req),
            "user": UserOut.model_validate(user) if user else None,
        })

    return {
        "requests": requests_with_user,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.patch("/premium-requests/{request_id}/approve")
async def approve_premium_request(
    request_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """
    Approve a premium upgrade request and upgrade user to premium.

    Args:
        request_id: Premium request ID
        admin_user: Admin user
        db: Database session

    Returns:
        Updated request and upgraded user
    """
    result = await db.execute(select(PremiumRequest).where(PremiumRequest.id == request_id))
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found"
        )

    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve {req.status} request"
        )

    # Get user and upgrade them
    user_result = await db.execute(select(User).where(User.id == req.user_id))
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Update request
    req.status = "approved"
    req.processed_at = datetime.utcnow()
    req.processed_by = admin_user.id

    # Upgrade user
    user.tier = "premium"
    user.updated_at = datetime.utcnow()

    await db.commit()

    return {
        "request": PremiumRequestOut.model_validate(req),
        "user": UserOut.model_validate(user),
    }


@router.patch("/premium-requests/{request_id}/reject")
async def reject_premium_request(
    request_id: int,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """
    Reject a premium upgrade request.

    Args:
        request_id: Premium request ID
        admin_user: Admin user
        db: Database session

    Returns:
        Updated request
    """
    result = await db.execute(select(PremiumRequest).where(PremiumRequest.id == request_id))
    req = result.scalar_one_or_none()

    if not req:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found"
        )

    if req.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject {req.status} request"
        )

    req.status = "rejected"
    req.processed_at = datetime.utcnow()
    req.processed_by = admin_user.id

    await db.commit()

    return {
        "request": PremiumRequestOut.model_validate(req),
    }
