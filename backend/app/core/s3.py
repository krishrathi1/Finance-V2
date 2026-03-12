import aioboto3
from app.core.config import get_settings
from typing import Optional
import logging

settings = get_settings()
logger = logging.getLogger(__name__)

class S3Client:
    _instance: Optional['S3Client'] = None
    _session: Optional[aioboto3.Session] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(S3Client, cls).__new__(cls)
            cls._session = aioboto3.Session()
        return cls._instance

    def get_client(self):
        return self._session.client(
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
