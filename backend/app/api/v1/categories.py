from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import ExpenseCategoryModel, Expense, User, UserRole
from app.schemas import CategoryCreate, CategoryUpdate, CategoryOut
from app.api.v1.deps import get_current_user, require_role, log_audit_event

router = APIRouter(prefix="/categories", tags=["Categories"])


# Hard-coded standardized enterprise categories
HARDCODED_CATEGORIES = [
    {
        "code": "ACCOMMODATION",
        "name": "Hotel & Lodging",
        "description": "Hotel stays, room tariffs, and business trip lodging",
    },
    {
        "code": "TRAINING",
        "name": "Training & Certifications",
        "description": "Professional certifications, courses, workshops, and exam vouchers",
    },
    {
        "code": "TRAVEL",
        "name": "Travel & Commute",
        "description": "Flights, trains, buses, cabs, mileage, tolls, and official commute",
    },
    {
        "code": "MEALS",
        "name": "Meals & Entertainment",
        "description": "Business meals, client hospitality, and authorized team dinners",
    },
    {
        "code": "SUPPLIES",
        "name": "Office Supplies & Equipment",
        "description": "Stationery, peripherals, desk accessories, and office consumables",
    },
    {
        "code": "SOFTWARE",
        "name": "Software & Subscriptions",
        "description": "Cloud hosting, developer tool licenses, and authorized SaaS subscriptions",
    },
    {
        "code": "EVENT_PURCHASES",
        "name": "Event Purchases",
        "description": "Event banners, decorations, stage setup, props, kits, and event-specific purchases",
    },
    {
        "code": "OTHER",
        "name": "Miscellaneous & Other",
        "description": "Approved business expenses not falling into standard categories",
    },
]


async def ensure_hardcoded_categories(db: AsyncSession):
    for cat in HARDCODED_CATEGORIES:
        res = await db.execute(select(ExpenseCategoryModel).where(ExpenseCategoryModel.code == cat["code"]))
        existing = res.scalars().first()
        if not existing:
            new_cat = ExpenseCategoryModel(
                code=cat["code"],
                name=cat["name"],
                description=cat["description"],
                is_active=True,
                is_system=True
            )
            db.add(new_cat)
        else:
            # Keep name and description aligned with hard-coded standards
            existing.name = cat["name"]
            existing.description = cat["description"]
            existing.is_active = True
            existing.is_system = True
    await db.flush()


@router.get("", response_model=List[CategoryOut])
async def list_active_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all standard active expense claim categories.
    Available to all authenticated employees for claim submission dropdowns.
    """
    await ensure_hardcoded_categories(db)
    result = await db.execute(
        select(ExpenseCategoryModel)
        .where(ExpenseCategoryModel.is_active == True)
        .order_by(ExpenseCategoryModel.name)
    )
    return result.scalars().all()


@router.get("/all", response_model=List[CategoryOut])
async def list_all_categories(
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.FINANCE])),
    db: AsyncSession = Depends(get_db)
):
    """
    List all standardized categories (Admin and Finance).
    """
    await ensure_hardcoded_categories(db)
    result = await db.execute(
        select(ExpenseCategoryModel).order_by(ExpenseCategoryModel.name)
    )
    return result.scalars().all()


@router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreate,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """Category editing is disabled in favor of standardized categories."""
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Category modification is disabled. Standard categories (Hotel & Lodging, Training & Certifications, Travel & Commute, etc.) are strictly enforced."
    )


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: str,
    data: CategoryUpdate,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """Category editing is disabled in favor of standardized categories."""
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Category modification is disabled. Standard categories (Hotel & Lodging, Training & Certifications, Travel & Commute, etc.) are strictly enforced."
    )


@router.delete("/{category_id}", status_code=status.HTTP_200_OK)
async def delete_or_deactivate_category(
    category_id: str,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """Category editing is disabled in favor of standardized categories."""
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Category modification is disabled. Standard categories cannot be deleted."
    )
