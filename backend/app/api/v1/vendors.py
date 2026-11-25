from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select, or_, func, asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models import Vendor, Expense, User, UserRole
from app.schemas import VendorCreate, VendorUpdate, VendorOut
from app.api.v1.deps import require_role, log_audit_event

router = APIRouter(prefix="/vendors", tags=["Vendors"])


@router.get("", response_model=List[VendorOut])
async def list_vendors(
    search: Optional[str] = Query(None),
    active_only: bool = Query(False),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.FINANCE, UserRole.REVIEWER])),
    db: AsyncSession = Depends(get_db)
):
    """List vendor profiles. Supports searching by name, GSTIN, email, or contact person."""
    query = select(Vendor)

    if active_only:
        query = query.where(Vendor.is_active == True)

    if search and search.strip():
        fmt = f"%{search.strip()}%"
        query = query.where(
            or_(
                Vendor.name.ilike(fmt),
                Vendor.gstin.ilike(fmt),
                Vendor.email.ilike(fmt),
                Vendor.contact_person.ilike(fmt)
            )
        )

    query = query.order_by(asc(Vendor.name))
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    data: VendorCreate,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """Admin-only: Create a new vendor profile with banking details."""
    vendor = Vendor(
        name=data.name.strip(),
        contact_person=data.contact_person.strip() if data.contact_person else None,
        email=data.email,
        phone=data.phone.strip() if data.phone else None,
        gstin=data.gstin.strip().upper() if data.gstin else None,
        pan=data.pan.strip().upper(),
        pan_document_url=data.pan_document_url.strip(),
        address=data.address.strip() if data.address else None,
        default_category=data.default_category.upper() if data.default_category else None,
        bank_details=data.bank_details.model_dump(exclude_none=True),
        is_active=True,
        created_by=current_user.id
    )
    db.add(vendor)
    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="VENDOR",
        entity_id=vendor.id,
        action="CREATE_VENDOR",
        new_values={"name": vendor.name, "gstin": vendor.gstin},
        ip_address=request.client.host if request.client else None
    )

    return vendor


@router.get("/{vendor_id}", response_model=VendorOut)
async def get_vendor(
    vendor_id: str,
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.FINANCE, UserRole.REVIEWER])),
    db: AsyncSession = Depends(get_db)
):
    """Retrieve a single vendor profile by ID."""
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalars().first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found.")
    return vendor


@router.patch("/{vendor_id}", response_model=VendorOut)
async def update_vendor(
    vendor_id: str,
    data: VendorUpdate,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """Admin-only: Update a vendor profile or its banking details."""
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalars().first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found.")

    update_data = data.model_dump(exclude_unset=True)
    if "bank_details" in update_data and update_data["bank_details"] is not None:
        update_data["bank_details"] = data.bank_details.model_dump(exclude_none=True)
    if "gstin" in update_data and update_data["gstin"]:
        update_data["gstin"] = update_data["gstin"].strip().upper()
    if "pan" in update_data and update_data["pan"]:
        update_data["pan"] = update_data["pan"].strip().upper()
    if "default_category" in update_data and update_data["default_category"]:
        update_data["default_category"] = update_data["default_category"].upper()

    for key, val in update_data.items():
        setattr(vendor, key, val)

    await db.flush()

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="VENDOR",
        entity_id=vendor.id,
        action="UPDATE_VENDOR",
        new_values={"name": vendor.name, "is_active": vendor.is_active},
        ip_address=request.client.host if request.client else None
    )

    return vendor


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor(
    vendor_id: str,
    request: Request,
    current_user: User = Depends(require_role([UserRole.ADMIN])),
    db: AsyncSession = Depends(get_db)
):
    """
    Admin-only: Deactivate a vendor if bills are attached, or permanently delete if unused.
    """
    result = await db.execute(select(Vendor).where(Vendor.id == vendor_id))
    vendor = result.scalars().first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found.")

    bill_count = await db.scalar(
        select(func.count(Expense.id)).where(Expense.vendor_id == vendor.id)
    ) or 0

    if bill_count > 0:
        vendor.is_active = False
        await db.flush()
        action = "DEACTIVATE_VENDOR"
    else:
        await db.delete(vendor)
        await db.flush()
        action = "DELETE_VENDOR"

    await log_audit_event(
        db=db,
        actor_id=current_user.id,
        entity_type="VENDOR",
        entity_id=vendor_id,
        action=action,
        new_values={"name": vendor.name},
        ip_address=request.client.host if request.client else None
    )
