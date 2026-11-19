from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    PROJECT_NAME: str = "Centralised Expense & Refund Management System"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/crs_db"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security
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
    
    # Initial Admin Seed
    FIRST_SUPERADMIN_EMAIL: str = "admin@crs-corp.com"
    FIRST_SUPERADMIN_PASSWORD: str = "Admin@123456"

    # CORS Allowed Origins (Comma-separated for production deployments)
    CORS_ORIGINS: Optional[str] = None

    # Google OAuth Authentication
    GOOGLE_CLIENT_ID: Optional[str] = "649525935317-nav17ordgvaprqafpuglnn8ibvs0djgf.apps.googleusercontent.com"
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
