from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "Centralised Expense & Refund Management System"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/crs_db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security & Environment
    ENVIRONMENT: str = "development"
    ALLOW_SQLITE_FALLBACK: bool = False
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
        Findings 1, 2 & 5: Validate mandatory security configurations in production.
        Fails application startup if any required parameter is missing or uses insecure defaults.
        """
        if self.ENVIRONMENT != "production":
            return

        errors = []

        # 1. JWT Secret Key: must be strong and not use default/test placeholders
        secret = self.JWT_SECRET_KEY or ""
        insecure_patterns = ["change-this", "super-secret", "default", "test", "jwt-key", "placeholder"]
        if len(secret) < 32 or any(p in secret.lower() for p in insecure_patterns):
            errors.append(
                "JWT_SECRET_KEY must be a cryptographically strong random secret (min 32 characters) in production."
            )

        # 2. Redis URL: strictly mandatory for distributed revocation across workers
        redis_url = (self.REDIS_URL or "").strip()
        if not redis_url or "placeholder" in redis_url.lower():
            errors.append("REDIS_URL is mandatory in production for distributed JWT revocation across workers.")

        # 3. Database URL: default credentials prohibited
        db_url = self.DATABASE_URL or ""
        if "postgres:postgres@" in db_url:
            errors.append("Default database credentials detected. Custom strong credentials are required in production.")

        # 4. Google Client ID: mandatory in production for OAuth validation
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
