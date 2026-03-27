import logging
from typing import Any, Optional

try:
    import aioboto3
except ModuleNotFoundError:  # pragma: no cover - depends on optional environment setup
    aioboto3 = None

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

class S3Client:
    _instance: Optional['S3Client'] = None
    _session: Optional[Any] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(S3Client, cls).__new__(cls)
            if aioboto3 is not None:
                cls._session = aioboto3.Session()
        return cls._instance

    def _ensure_session(self) -> Any:
        if self._session is None:
            raise RuntimeError(
                "S3 support requires the 'aioboto3' package. Install backend requirements first."
            )
        return self._session

    def get_client(self):
        session = self._ensure_session()
        return session.client(
            's3',
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key
        )

    async def upload_file(self, file_path: str, object_name: Optional[str] = None):
        if object_name is None:
            object_name = file_path
        
        async with self.get_client() as s3:
            try:
                await s3.upload_file(file_path, settings.s3_bucket, object_name)
                logger.info(f"Successfully uploaded {file_path} to {settings.s3_bucket}/{object_name}")
                return True
            except Exception as e:
                logger.error(f"Error uploading to S3: {e}")
                return False

    async def upload_fileobj(self, fileobj, object_name: str):
        async with self.get_client() as s3:
            try:
                await s3.upload_fileobj(fileobj, settings.s3_bucket, object_name)
                logger.info(f"Successfully uploaded fileobj to {settings.s3_bucket}/{object_name}")
                return True
            except Exception as e:
                logger.error(f"Error uploading to S3: {e}")
                return False

    async def download_file(self, object_name: str, file_path: str):
        async with self.get_client() as s3:
            try:
                await s3.download_file(settings.s3_bucket, object_name, file_path)
                logger.info(f"Successfully downloaded {object_name} from {settings.s3_bucket} to {file_path}")
                return True
            except Exception as e:
                logger.error(f"Error downloading from S3: {e}")
                return False

s3_client = S3Client()
