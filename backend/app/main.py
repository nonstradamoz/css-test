from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func

from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.security import get_password_hash
from app.models import User, UserRole, SystemSettings, ExpenseCategoryModel

# Import routers
from app.api.v1.auth import router as auth_router
from app.api.v1.expenses import router as expenses_router
from app.api.v1.approvals import router as approvals_router
from app.api.v1.reimbursements import router as reimbursements_router
from app.api.v1.users import router as users_router
from app.api.v1.settings import router as settings_router
from app.api.v1.audit_logs import router as audit_logs_router
from app.api.v1.receipts import router as receipts_router
from app.api.v1.categories import router as categories_router


def auto_migrate_schema(sync_conn):
    """
    Lightweight, dialect-agnostic schema migration.
    Automatically alters existing PostgreSQL / SQLite tables to add columns
    introduced in newer versions when Base.metadata.create_all does not alter existing tables.
    """
    from sqlalchemy import inspect, text

    inspector = inspect(sync_conn)
    tables = inspector.get_table_names()

    migrations = {
        "system_settings": [
            ("expense_submissions_enabled", "BOOLEAN DEFAULT TRUE"),
            ("multi_tier_approval_enabled", "BOOLEAN DEFAULT TRUE"),
            ("enforce_date_window", "BOOLEAN DEFAULT FALSE"),
            ("policy_allowed_start_date", "TIMESTAMP WITH TIME ZONE"),
            ("policy_allowed_end_date", "TIMESTAMP WITH TIME ZONE"),
        ],
        "reimbursements": [
            ("transaction_id", "VARCHAR(128)"),
        ],
        "users": [
            ("bank_details", "JSON"),
        ],
        "expenses": [
            ("extracted_metadata", "JSON"),
            ("risk_score", "INTEGER DEFAULT 0"),
            ("risk_level", "VARCHAR(20) DEFAULT 'LOW'"),
            ("forensic_flags", "JSON"),
            ("audit_exemption_reason", "TEXT"),
            ("receipt_hash", "VARCHAR(64)"),
        ],
    }

    for table_name, columns in migrations.items():
        if table_name in tables:
            existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
            for col_name, col_def in columns:
                if col_name not in existing_cols:
                    try:
                        sync_conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}"))
                        print(f"[MIGRATION] Added column {table_name}.{col_name}")
                    except Exception as err:
                        print(f"[MIGRATION WARN] Failed to add {table_name}.{col_name}: {err}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.core.database as db_module

    # Startup: Ensure database tables are created & updated (with graceful SQLite fallback if Postgres is down)
    try:
        async with db_module.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(auto_migrate_schema)
    except Exception as exc:
        print(f"[STARTUP WARN] Primary DB connection/migration failed: {exc}. Switching to SQLite fallback...")
        db_module.switch_to_sqlite_fallback()
        async with db_module.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(auto_migrate_schema)

    # Ensure SystemSettings and Initial Admin exist
    try:
        async with db_module.AsyncSessionLocal() as session:
            # 1. SystemSettings
            result = await session.execute(select(SystemSettings).where(SystemSettings.id == 1))
            if not result.scalars().first():
                default_settings = SystemSettings(
                    id=1,
                    company_name="Centralised Expense System",
                    default_currency="INR",
                    tier2_approval_threshold=25000.00,
                    allow_self_approval=False
                )
                session.add(default_settings)

            # 2. Seed initial admin & employee if they don't exist
            admin_res = await session.execute(select(User).where(User.email == settings.FIRST_SUPERADMIN_EMAIL.lower()))
            if not admin_res.scalars().first():
                admin_user = User(
                    email=settings.FIRST_SUPERADMIN_EMAIL.lower(),
                    hashed_password=get_password_hash(settings.FIRST_SUPERADMIN_PASSWORD),
                    full_name="Enterprise Administrator",
                    role=UserRole.ADMIN,
                    is_active=True
                )
                session.add(admin_user)

            emp_res = await session.execute(select(User).where(User.email == "employee.john@crs-corp.com"))
            if not emp_res.scalars().first():
                emp_user = User(
                    email="employee.john@crs-corp.com",
                    hashed_password=get_password_hash("Password123!"),
                    full_name="Johnathan Doe",
                    role=UserRole.EMPLOYEE,
                    is_active=True
                )
                session.add(emp_user)

            # 3. Seed default expense categories if none exist
            cat_count = await session.scalar(select(func.count(ExpenseCategoryModel.id)))
            if cat_count == 0:
                default_categories = [
                    ("TRAVEL", "Travel & Commute", "Flights, trains, taxis, mileage, toll & parking"),
                    ("MEALS", "Meals & Entertainment", "Business meals, team lunch & client entertainment"),
                    ("SUPPLIES", "Office Supplies & Equipment", "Stationery, office furniture, hardware peripherals"),
                    ("SOFTWARE", "Software & Cloud Services", "SaaS subscriptions, dev tools, cloud hosting"),
                    ("TRAINING", "Training & Certifications", "Professional courses, exam vouchers, books"),
                    ("ACCOMMODATION", "Hotel & Lodging", "Hotel stays, short-term accommodation for business trips"),
                    ("OTHER", "Miscellaneous & Other", "General expenses not covered by other categories"),
                ]
                for code, name, desc_text in default_categories:
                    session.add(
                        ExpenseCategoryModel(
                            code=code,
                            name=name,
                            description=desc_text,
                            is_active=True,
                            is_system=True
                        )
                    )

            await session.commit()
    except Exception as seed_err:
        print(f"[STARTUP WARN] Seeding initial data error: {seed_err}")

    yield

    # Shutdown
    await db_module.engine.dispose()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="2.0.0",
    description="Enterprise Centralised Expense & Refund Management System (CRS) API",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS Middleware
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000"
]
if settings.CORS_ORIGINS:
    origins.extend([o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.onrender\.com|http://localhost:\d+|http://127\.0\.0\.1:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import RedirectResponse

# Mount API Routers (Standard /api/v1)
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(expenses_router, prefix=settings.API_V1_STR)
app.include_router(approvals_router, prefix=settings.API_V1_STR)
app.include_router(reimbursements_router, prefix=settings.API_V1_STR)
app.include_router(users_router, prefix=settings.API_V1_STR)
app.include_router(settings_router, prefix=settings.API_V1_STR)
app.include_router(audit_logs_router, prefix=settings.API_V1_STR)
app.include_router(receipts_router, prefix=settings.API_V1_STR)
app.include_router(categories_router, prefix=settings.API_V1_STR)

# Resilient route aliases (/auth and /api/*) to avoid 404s when frontend or proxy omits /v1
app.include_router(auth_router, prefix="", include_in_schema=False)
app.include_router(auth_router, prefix="/api", include_in_schema=False)
app.include_router(expenses_router, prefix="/api", include_in_schema=False)
app.include_router(approvals_router, prefix="/api", include_in_schema=False)
app.include_router(reimbursements_router, prefix="/api", include_in_schema=False)
app.include_router(users_router, prefix="/api", include_in_schema=False)
app.include_router(settings_router, prefix="/api", include_in_schema=False)
app.include_router(receipts_router, prefix="/api", include_in_schema=False)
app.include_router(categories_router, prefix="/api", include_in_schema=False)


@app.get("/", include_in_schema=False)
async def root():
    """Redirect root path to interactive Swagger documentation."""
    return RedirectResponse(url="/docs")


@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "healthy",
        "version": "2.0.0",
        "system": "Centralised Expense & Refund System"
    }
