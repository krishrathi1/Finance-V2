
import asyncio
import os
import sys
from pathlib import Path

# Add the backend root to sys.path
backend_path = Path(__file__).resolve().parent
if str(backend_path) not in sys.path:
    sys.path.append(str(backend_path))

from app.core.s3 import s3_client
from app.core.config import get_settings

async def test_s3_connection():
    settings = get_settings()
    if not settings.s3_access_key:
        print("Error: S3 credentials not found in .env")
        return

    print(f"--- Testing S3 Connection to {settings.s3_endpoint} ---")
    print(f"Bucket: {settings.s3_bucket}")
    
    # Try to list objects in the bucket
    async with s3_client.get_client() as s3:
        try:
            response = await s3.list_objects_v2(Bucket=settings.s3_bucket)
            print("Successfully connected to S3!")
            if 'Contents' in response:
                print(f"Found {len(response['Contents'])} objects in bucket.")
            else:
                print("Bucket is empty.")
            
            # Try to upload a small test file
            test_content = b"Hello from Financial Forensics AI"
            test_filename = "test_connection.txt"
            await s3.put_object(Bucket=settings.s3_bucket, Key=test_filename, Body=test_content)
            print(f"Successfully uploaded {test_filename} to bucket.")
            
            # Clean up
            await s3.delete_object(Bucket=settings.s3_bucket, Key=test_filename)
            print(f"Successfully cleaned up {test_filename}.")
            
        except Exception as e:
            print(f"Error connecting to S3: {e}")

if __name__ == "__main__":
    asyncio.run(test_s3_connection())
