import json
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings


class RedisCache:
    def __init__(self) -> None:
        self._client: Redis | None = None

    async def connect(self) -> None:
        if self._client is None:
            settings = get_settings()
            try:
                self._client = Redis.from_url(settings.redis_url, decode_responses=True)
                await self._client.ping() # Test connection immediately
            except Exception as e:
                print(f"Redis connection failed, caching disabled: {e}")
                self._client = None

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    async def get_json(self, key: str) -> Any | None:
        if self._client is None:
            return None
        try:
            raw = await self._client.get(key)
            return json.loads(raw) if raw else None
        except (RedisError, OSError, ValueError):
            return None

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        if self._client is None:
            return
        try:
            await self._client.set(key, json.dumps(value), ex=ttl_seconds)
        except (RedisError, OSError, TypeError, ValueError):
            return


redis_cache = RedisCache()
