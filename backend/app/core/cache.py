import json
import time
from typing import Any

# Completely removed redis dependency as requested. 
# Using a simple in-memory store as a placeholder until full Next.js migration.

class RedisCache:
    def __init__(self) -> None:
        self._memory_store: dict[str, tuple[float, Any]] = {}

    async def connect(self) -> None:
        # No Redis to connect to
        pass

    async def disconnect(self) -> None:
        # No Redis to disconnect from
        pass

    async def get_json(self, key: str) -> Any | None:
        return self._get_memory_json(key)

    async def set_json(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._set_memory_json(key, value, ttl_seconds=ttl_seconds)

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
