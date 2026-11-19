import os
import sys
from pathlib import Path
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# Absolute path to canonical local SQLite database
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
SQLITE_DB_PATH = BACKEND_DIR / "crs_dev.db"


class Base(DeclarativeBase):
    pass


# Global engine and sessionmaker
engine: AsyncEngine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False
)


def switch_to_sqlite_fallback():
    """Fallback to local SQLite database when PostgreSQL is not running locally"""
    global engine, AsyncSessionLocal
    sqlite_url = f"sqlite+aiosqlite:///{SQLITE_DB_PATH}"
    print(f"\n[INFO] PostgreSQL not reachable at localhost:5432.\n[INFO] Seamlessly falling back to local SQLite ({sqlite_url}) for local development.\n", file=sys.stderr)
    engine = create_async_engine(
        sqlite_url,
        echo=False,
        future=True,
        connect_args={"check_same_thread": False}
    )
    AsyncSessionLocal = async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for yielding async db session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
