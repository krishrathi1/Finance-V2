import json
import time
from typing import Any

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings


class RedisCache:
    def __init__(self) -> None:
        self._client: Redis | None = None
        self._memory_store: dict[str, tuple[float, Any]] = {}

    async def connect(self) -> None:
        if self._client is None:
            settings = get_settings()
            try:
                self._client = Redis.from_url(
                    settings.redis_url,
                    decode_responses=True,
                    socket_connect_timeout=1,
                    socket_timeout=1,
                    retry_on_timeout=False,
                    health_check_interval=0,
                )
                await self._client.ping()
            except Exception as e:
                print(f"Redis connection failed, caching disabled: {e}")
                self._client = None

    async def disconnect(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    async def get_json(self, key: str) -> Any | None:
        if self._client is None:
            return self._get_memory_json(key)
        try:
            raw = await self._client.get(key)
            if raw:
                parsed = json.loads(raw)
                self._set_memory_json(key, parsed, ttl_seconds=60)
                return parsed
            return self._get_memory_json(key)
        except (RedisError, OSError, ValueError):
            return self._get_memory_json(key)

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._set_memory_json(key, value, ttl_seconds=ttl_seconds)
        if self._client is None:
            return
        try:
            await self._client.set(key, json.dumps(value), ex=ttl_seconds)
        except (RedisError, OSError, TypeError, ValueError):
            return

    def _get_memory_json(self, key: str) -> Any | None:
        hit = self._memory_store.get(key)
        if not hit:
            return None
        expires_at, value = hit
        if expires_at < time.time():
            self._memory_store.pop(key, None)
            return None
        return value

    def _set_memory_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._memory_store[key] = (time.time() + max(1, ttl_seconds), value)


redis_cache = RedisCache()
