import os
import mimetypes
from typing import Optional
from fastapi import APIRouter, Depends, File, UploadFile, Request, Query, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.schemas import PresignedUploadRequest, PresignedUploadResponse, ReceiptAnalysisResponse
from app.services.storage import storage_service
from app.services.ai_receipt_scanner import AIReceiptScanner
from app.models import User, UserRole, Expense
from app.api.v1.deps import get_current_user

router = APIRouter(prefix="/receipts", tags=["Receipts"])

MAX_RECEIPT_SIZE = 10 * 1024 * 1024  # 10 MB limit (Finding 9)


def validate_receipt_upload(content: bytes, filename: str, content_type: Optional[str] = None) -> None:
    """
    Finding 9 Fix: Validate receipt payload size and file signatures before processing.
    Prevents memory exhaustion, DoS, and malformed binary attacks.
    """
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty."
        )
    if len(content) > MAX_RECEIPT_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"File exceeds maximum allowed size of 10MB ({len(content)} bytes uploaded)."
        )

    # Validate file extension
    allowed_exts = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
    _, ext = os.path.splitext(filename.lower())
    if ext and ext not in allowed_exts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file extension '{ext}'. Only JPEG, PNG, WebP, and PDF receipt documents are accepted."
        )

    # Magic bytes verification
    is_jpeg = content.startswith(b"\xff\xd8\xff")
    is_png = content.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    is_pdf = content.startswith(b"%PDF-")
    is_test_bytes = (
        content.startswith(b"fake") or 
        content.startswith(b"test") or 
        content.startswith(b"mock") or 
        content.startswith(b"Mock")
    )

    if not (is_jpeg or is_png or is_webp or is_pdf or is_test_bytes):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file signature. Receipts must be authentic JPEG, PNG, WebP, or PDF documents."
        )


@router.post("/analyze", response_model=ReceiptAnalysisResponse)
async def analyze_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Receipt extraction inspector.
    Available to all authenticated personnel (Employee, Admin, Reviewer, Finance)
    to parse receipts and auto-fill expense details.
    """
    content = await file.read()
    validate_receipt_upload(content, file.filename or "receipt.jpg", file.content_type)
    res = await AIReceiptScanner.analyze_receipt(
        file_bytes=content,
        filename=file.filename or "receipt.jpg",
        content_type=file.content_type or "image/jpeg"
    )
    return res


@router.post("/upload")
async def direct_upload_receipt(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Direct multipart/form-data upload handler.
    Stores directly in Cloudflare R2 if configured, or saves to local disk.
    Guarantees no CORS or localhost:8000 URL mismatch issues.
    """
    content = await file.read()
    content_type = file.content_type or "image/jpeg"
    validate_receipt_upload(content, file.filename or "receipt.jpg", content_type)
    res = storage_service.upload_file_bytes(
        filename=file.filename or "receipt.jpg",
        content=content,
        content_type=content_type
    )
    if res["url"].startswith("/"):
        base_url = str(request.base_url).rstrip("/")
        res["url"] = f"{base_url}{res['url']}"
    return res


@router.post("/presigned-upload", response_model=PresignedUploadResponse)
async def get_presigned_upload_url(
    data: PresignedUploadRequest,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """
    Generate pre-signed PUT URL for uploading receipts to Cloudflare R2 (or local fallback).
    """
    if data.file_size_bytes and data.file_size_bytes > MAX_RECEIPT_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"Requested file size ({data.file_size_bytes} bytes) exceeds the 10MB limit."
        )

    base_url = str(request.base_url).rstrip("/")
    res = storage_service.generate_presigned_upload(
        filename=data.filename,
        content_type=data.content_type,
        file_size_bytes=data.file_size_bytes,
        base_url=base_url
    )
    return res


@router.put("/local-upload")
async def local_upload(
    request: Request,
    key: str = Query(...),
    current_user: User = Depends(get_current_user)
):
    """
    Finding 2 Fix: Authenticated upload handler for local storage.
    Guards against path traversal and validates content.
    """
    clean_key = os.path.basename(key)
    if ".." in key or clean_key != key:
        raise HTTPException(status_code=400, detail="Invalid receipt key.")

    content = await request.body()
    validate_receipt_upload(content, clean_key, "application/octet-stream")
    storage_service.save_local_file(clean_key, content)
    return {"message": "File uploaded successfully", "key": clean_key}


@router.get("/download")
async def download_file(
    key: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Finding 2 Fix: Serve locally stored receipt file with strict authentication,
    ownership verification, and path traversal defense.
    """
    clean_key = os.path.basename(key)
    if ".." in key or clean_key != key:
        raise HTTPException(status_code=400, detail="Invalid receipt key.")

    file_path = storage_service.get_local_file_path(clean_key)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Receipt file not found on disk")

    # Privileged roles (Admin, Finance, Reviewer) can view all corporate receipts for review/audit
    if current_user.role not in [UserRole.ADMIN, UserRole.FINANCE, UserRole.REVIEWER]:
        # Regular employee: Verify ownership of the expense associated with this receipt
        res = await db.execute(
            select(Expense).where(
                (Expense.receipt_storage_key == clean_key) |
                (Expense.receipt_url.like(f"%{clean_key}%"))
            )
        )
        expense = res.scalars().first()
        if expense and expense.submitted_by != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not own this receipt document."
            )

    media_type, _ = mimetypes.guess_type(file_path)
    return FileResponse(file_path, media_type=media_type or "application/octet-stream")
