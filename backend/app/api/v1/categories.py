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


@router.get("", response_model=List[CategoryOut])
async def list_active_categories(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all active expense claim categories.
    Available to all authenticated employees for claim submission dropdowns.
    """
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
    List all categories including deactivated ones (Admin and Finance only).
    """
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
    """
    Create a new expense claim category (Admin only).
    """
    clean_code = data.code.strip().upper().replace(" ", "_")
    
    # Check if category code already exists
    existing = await db.execute(
        select(ExpenseCategoryModel).where(ExpenseCategoryModel.code == clean_code)
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=400,
            detail=f"Category with code '{clean_code}' already exists."
        )

    new_cat = ExpenseCategoryModel(
        code=clean_code,
        name=data.name.strip(),
        description=data.description.strip() if data.description else None,
        is_active=data.is_active,
        is_system=False
    )
    db.add(new_cat)
    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="CATEGORY",
        entity_id=new_cat.id,
        action="CREATE_CATEGORY",
        new_values={"code": new_cat.code, "name": new_cat.name},
        ip_address=request.client.host if request.client else None
    )

    return new_cat


@router.patch("/{category_id}", response_model=CategoryOut)
async def update_category(
    category_id: str,
    data: CategoryUpdate,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """
    Update category display name, description, or active status (Admin only).
    """
    result = await db.execute(
        select(ExpenseCategoryModel).where(ExpenseCategoryModel.id == category_id)
    )
    category = result.scalars().first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")

    old_values = {
        "name": category.name,
        "description": category.description,
        "is_active": category.is_active
    }

    if data.name is not None:
        category.name = data.name.strip()
    if data.description is not None:
        category.description = data.description.strip() if data.description else None
    if data.is_active is not None:
        category.is_active = data.is_active

    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="CATEGORY",
        entity_id=category.id,
        action="UPDATE_CATEGORY",
        old_values=old_values,
        new_values={
            "name": category.name,
            "description": category.description,
            "is_active": category.is_active
        },
        ip_address=request.client.host if request.client else None
    )

    return category


@router.delete("/{category_id}", status_code=status.HTTP_200_OK)
async def delete_or_deactivate_category(
    category_id: str,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete or deactivate category.
    If expenses are linked to this category code, it is safely soft-deactivated to preserve audit integrity.
    """
    result = await db.execute(
        select(ExpenseCategoryModel).where(ExpenseCategoryModel.id == category_id)
    )
    category = result.scalars().first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")

    if category.is_system:
        raise HTTPException(
            status_code=400,
            detail="System standard categories cannot be deleted. You may deactivate them instead."
        )

    # Check if any expenses reference this category code
    count_linked = await db.scalar(
        select(func.count(Expense.id)).where(Expense.category == category.code)
    )

    if count_linked and count_linked > 0:
        # Soft deactivate
        category.is_active = False
        await db.flush()
        return {
            "message": f"Category '{category.name}' is referenced by {count_linked} expense claims. It has been deactivated instead of deleted to protect historical records.",
            "is_active": False
        }
    else:
        # Safe hard delete
        await db.delete(category)
        await db.flush()
        return {"message": f"Category '{category.name}' has been deleted."}
