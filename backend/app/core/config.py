import math
from collections import Counter
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


def calculate_entropy(s: str) -> float:
    """Calculate Shannon Entropy (bits per symbol) of a string"""
    if not s:
        return 0.0
    counts = Counter(s)
    n = len(s)
    return -sum((c / n) * math.log2(c / n) for c in counts.values())


class Settings(BaseSettings):
    PROJECT_NAME: str = "Centralised Expense & Refund Management System"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/crs_db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    ALLOW_INSECURE_LOCAL_REDIS: bool = False
    
    # Security & Environment (Finding 1: Default to production for fail-safe deployments)
    ENVIRONMENT: str = "production"
    ALLOW_SQLITE_FALLBACK: bool = False
    ALLOW_LOCAL_STORAGE_FALLBACK: bool = False
    ENABLE_API_DOCS: Optional[bool] = None
    JWT_SECRET_KEY: str = "super-secret-jwt-key-for-crs-system-enterprise-32-chars-min"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Cloudflare R2 / S3
    R2_ACCOUNT_ID: Optional[str] = None
    R2_ACCESS_KEY_ID: Optional[str] = None
    R2_SECRET_ACCESS_KEY: Optional[str] = None
    R2_BUCKET_NAME: str = "crs-receipts"
    R2_ENDPOINT_URL: Optional[str] = None
    R2_PUBLIC_DOMAIN: Optional[str] = None
    
    # Refund Provider Mock Outcome (SUCCESS | FAILURE | TIMEOUT)
    MOCK_REFUND_OUTCOME: str = "SUCCESS"

    # CORS Allowed Origins (Comma-separated for production deployments)
    CORS_ORIGINS: Optional[str] = None

    # Google OAuth Authentication
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    
    def validate_production_security(self) -> None:
        """
        Findings 1, 2, 5 & 8: Validate mandatory security configurations in production.
        Fails application startup if environment is production (or undeclared) and any
        required parameter is missing, weak, or uses insecure defaults.
        """
        # Finding 1: Enforce production security unless explicitly set to development or test
        if self.ENVIRONMENT in ("development", "test"):
            return

        errors = []

        # Finding 8: JWT Secret Key entropy and strength verification
        secret = self.JWT_SECRET_KEY or ""
        insecure_patterns = ["change-this", "super-secret", "default", "test", "jwt-key", "placeholder", "secret-key"]
        entropy = calculate_entropy(secret)
        unique_chars = len(set(secret))

        if (
            len(secret) < 32 or 
            unique_chars < 14 or 
            entropy < 3.5 or 
            any(p in secret.lower() for p in insecure_patterns)
        ):
            errors.append(
                f"JWT_SECRET_KEY lacks sufficient cryptographic randomness (length={len(secret)}, "
                f"unique_chars={unique_chars}, entropy={entropy:.2f} bits/symbol). "
                "Production requires a high-entropy secret (min 32 chars, entropy >= 3.5) generated via e.g. 'openssl rand -hex 32'."
            )

        # Finding 2: Redis URL verification (disallow unauthenticated localhost in production)
        redis_url = (self.REDIS_URL or "").strip()
        if not redis_url or "placeholder" in redis_url.lower():
            errors.append("REDIS_URL is mandatory in production for distributed JWT revocation across workers.")
        elif not self.ALLOW_INSECURE_LOCAL_REDIS:
            if "localhost" in redis_url or "127.0.0.1" in redis_url or "redis://redis:6379" in redis_url:
                errors.append(
                    "Default localhost Redis ('redis://localhost:6379') is prohibited in production. "
                    "A shared Redis service with authentication/TLS is required, or explicitly set ALLOW_INSECURE_LOCAL_REDIS=True."
                )

        # Database URL: default credentials prohibited
        db_url = self.DATABASE_URL or ""
        if "postgres:postgres@" in db_url:
            errors.append("Default database credentials detected. Custom strong credentials are required in production.")

        # Google Client ID: mandatory in production for OAuth validation
        google_id = (self.GOOGLE_CLIENT_ID or "").strip()
        if not google_id or "placeholder" in google_id.lower() or "your_" in google_id.lower():
            errors.append("GOOGLE_CLIENT_ID is mandatory in production for secure federated authentication.")

        if errors:
            raise RuntimeError("Production security configuration validation failed:\n - " + "\n - ".join(errors))

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
