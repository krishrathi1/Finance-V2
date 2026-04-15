from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.cache import redis_cache
from app.core.config import get_settings


settings = get_settings()
cors_origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield


app = FastAPI(title=settings.app_name, debug=settings.app_debug, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.api_route("/", methods=["GET", "HEAD"])
async def root() -> dict:
    return {"status": "ok", "service": settings.app_name}


@app.head("/")
async def root_head() -> Response:
    return Response(status_code=200)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": settings.app_name, "env": settings.app_env}


app.include_router(api_router, prefix="/api/v1")
