from fastapi import APIRouter

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.stocks import router as stocks_router
from app.api.v1.endpoints.portfolio import router as portfolio_router


api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(admin_router)
api_router.include_router(stocks_router)
api_router.include_router(portfolio_router, prefix="/portfolio", tags=["portfolio"])
