import argparse
import asyncio
import os
import sys
import getpass
from pathlib import Path

# Ensure backend root is in sys.path regardless of current working directory
_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models import User, UserRole


async def create_or_update_admin(email: str, password: str, full_name: str):
    import app.core.database as db_module

    try:
        async with db_module.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception:
        db_module.switch_to_sqlite_fallback()
        async with db_module.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async with db_module.AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email.lower().strip()))
        user = result.scalars().first()

        hashed_pwd = get_password_hash(password)

        if user:
            print(f"[INFO] User '{email}' already exists. Updating password and elevating role to ADMIN...")
            user.hashed_password = hashed_pwd
            user.role = UserRole.ADMIN
            user.is_active = True
            user.full_name = full_name or user.full_name
        else:
            print(f"[INFO] Creating new ADMIN user '{email}'...")
            user = User(
                email=email.lower().strip(),
                hashed_password=hashed_pwd,
                full_name=full_name or "Administrator",
                role=UserRole.ADMIN,
                is_active=True
            )
            session.add(user)

        await session.commit()
        print(f"\n✅ SUCCESS: Admin user '{user.email}' is ready!\n   Role: {user.role.value}\n")


def main():
    parser = argparse.ArgumentParser(description="Create or reset an enterprise ADMIN user.")
    parser.add_argument("--email", type=str, help="Admin email address")
    parser.add_argument("--password", type=str, help="Admin password (min 8 characters)")
    parser.add_argument("--name", type=str, default="System Administrator", help="Admin display name")
    args = parser.parse_args()

    email = args.email
    password = args.password
    name = args.name

    if not email:
        email = input("Enter Admin Email (e.g. admin@company.com): ").strip()
    if not password:
        password = getpass.getpass("Enter Admin Password (min 8 chars): ").strip()

    if len(password) < 8:
        print("❌ Error: Password must be at least 8 characters long.", file=sys.stderr)
        sys.exit(1)

    asyncio.run(create_or_update_admin(email, password, name))


if __name__ == "__main__":
    main()
