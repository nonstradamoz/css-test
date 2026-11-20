import os
import uuid
from typing import Dict, Any, Optional
import boto3
from botocore.config import Config
from app.core.config import settings

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")


class StorageService:
    """
    Cloudflare R2 Object Storage Service (S3-Compatible)
    with seamless local disk fallback for local development.
    """

    def __init__(self):
        self.bucket = settings.R2_BUCKET_NAME
        self.s3_client = None

        if settings.R2_ACCESS_KEY_ID and settings.R2_SECRET_ACCESS_KEY:
            endpoint_url = settings.R2_ENDPOINT_URL
            if not endpoint_url and settings.R2_ACCOUNT_ID:
                endpoint_url = f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

            try:
                self.s3_client = boto3.client(
                    "s3",
                    endpoint_url=endpoint_url,
                    aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
                    config=Config(signature_version="s3v4"),
                    region_name="auto"
                )
            except Exception as e:
                print(f"[WARN] Failed to initialize R2 S3 client: {e}. Falling back to local storage.")
                self.s3_client = None

    def is_configured(self) -> bool:
        if not self.s3_client:
            return False
        key = (settings.R2_ACCESS_KEY_ID or "").lower()
        if not key or "your_" in key or "placeholder" in key or "dummy" in key:
            return False
        return True

    def upload_file_bytes(self, filename: str, content: bytes, content_type: str = "image/jpeg") -> Dict[str, str]:
        """Upload file directly to R2 if configured, or save to local disk"""
        ext = os.path.splitext(filename)[1].lower()
        key = f"receipts/{uuid.uuid4().hex}{ext}"

        if self.is_configured():
            try:
                self.s3_client.put_object(
                    Bucket=self.bucket,
                    Key=key,
                    Body=content,
                    ContentType=content_type
                )
                # Security Finding 5: Receipts are confidential financial documents.
                # Restrict pre-signed download URLs to 15 minutes (900 seconds) max.
                signed_url = self.generate_presigned_download(key, expires_in=900)
                return {"url": signed_url, "key": key}
            except Exception as e:
                print(f"[WARN] Direct R2 upload failed ({e}). Falling back to local storage.")

        # Local storage fallback
        self.save_local_file(key, content)
        return {
            "url": f"/api/v1/receipts/download?key={key}",
            "key": key
        }

    def save_local_file(self, key: str, content: bytes) -> str:
        """Save raw bytes to local disk when R2 is not configured"""
        clean_key = os.path.basename(key)
        target_dir = os.path.join(UPLOAD_DIR, "receipts")
        os.makedirs(target_dir, exist_ok=True)
        target_path = os.path.join(target_dir, clean_key)
        with open(target_path, "wb") as f:
            f.write(content)
        return target_path

    def get_local_file_path(self, key: str) -> str:
        """Resolve absolute path of a locally stored receipt file"""
        clean_key = os.path.basename(key)
        return os.path.join(UPLOAD_DIR, "receipts", clean_key)

    def generate_presigned_upload(
        self,
        filename: str,
        content_type: str,
        file_size_bytes: int,
        base_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate secure pre-signed PUT URL for uploading receipts"""
        ext = os.path.splitext(filename)[1].lower()
        key = f"receipts/{uuid.uuid4().hex}{ext}"

        if not self.is_configured():
            # Local development fallback: direct upload to FastAPI endpoint
            prefix = base_url.rstrip("/") if base_url else ""
            return {
                "upload_url": f"{prefix}/api/v1/receipts/local-upload?key={key}",
                "key": key,
                "public_url": f"{prefix}/api/v1/receipts/download?key={key}",
                "fields": None
            }

        upload_url = self.s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ContentType": content_type
            },
            ExpiresIn=3600  # 1 hour
        )

        # Security Finding 5: Generate short-lived presigned download URLs (15 minutes / 900s)
        signed_download_url = self.generate_presigned_download(key, expires_in=900)

        return {
            "upload_url": upload_url,
            "key": key,
            "public_url": signed_download_url,
            "fields": None
        }

    def generate_presigned_download(self, key: str, expires_in: int = 900) -> str:
        """Generate pre-signed GET URL for downloading receipt (Finding 5: 15-minute default TTL)"""
        if not self.is_configured():
            return f"http://localhost:8000/api/v1/receipts/download?key={key}"

        return self.s3_client.generate_presigned_url(
            ClientMethod="get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key
            },
            ExpiresIn=expires_in
        )

    def extract_key_from_url(self, file_url_or_key: str) -> Optional[str]:
        """Extract object storage key from a download URL or direct key string"""
        if not file_url_or_key or not file_url_or_key.strip():
            return None
        url_str = file_url_or_key.strip()

        # 1. Check if URL contains query parameter key=
        if "key=" in url_str:
            key_part = url_str.split("key=")[-1]
            key_clean = key_part.split("&")[0]
            return key_clean.strip()

        # 2. Check if URL contains /receipts/
        if "/receipts/" in url_str:
            idx = url_str.find("/receipts/")
            key = url_str[idx + 1:].split("?")[0]
            return key.strip()

        # 3. Direct key format (e.g. receipts/xyz.jpg)
        if url_str.startswith("receipts/"):
            return url_str.split("?")[0].strip()

        # 4. Fallback URL path extraction
        from urllib.parse import urlparse
        parsed = urlparse(url_str)
        path = parsed.path.lstrip("/")
        if path:
            return path
        return None

    def delete_file(self, file_url_or_key: str) -> bool:
        """
        Delete a receipt file from Cloudflare R2 / S3 object storage bucket
        and local disk storage.
        """
        key = self.extract_key_from_url(file_url_or_key)
        if not key:
            return False

        deleted_somewhere = False

        # 1. Delete from R2 / S3 bucket if configured
        if self.is_configured():
            try:
                self.s3_client.delete_object(
                    Bucket=self.bucket,
                    Key=key
                )
                deleted_somewhere = True
            except Exception as e:
                print(f"[WARN] Failed to delete object '{key}' from R2 bucket '{self.bucket}': {e}")

        # 2. Delete from local storage (both resolved path and raw name)
        local_path = self.get_local_file_path(key)
        if os.path.exists(local_path):
            try:
                os.remove(local_path)
                deleted_somewhere = True
            except Exception as e:
                print(f"[WARN] Failed to remove local file '{local_path}': {e}")

        return deleted_somewhere


storage_service = StorageService()
