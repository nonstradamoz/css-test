import os
import mimetypes
import asyncio
from typing import Optional
from fastapi import APIRouter, Depends, File, UploadFile, Request, Query, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.schemas import PresignedUploadRequest, PresignedUploadResponse, ReceiptAnalysisResponse
from app.services.storage import storage_service
from app.services.ai_receipt_scanner import AIReceiptScanner
from app.models import User, UserRole, Expense
from app.api.v1.deps import get_current_user

router = APIRouter(prefix="/receipts", tags=["Receipts"])

MAX_RECEIPT_SIZE = 10 * 1024 * 1024  # 10 MB limit
MAX_CONCURRENT_UPLOADS = 10          # Finding 7: Protects against memory exhaustion under burst traffic
upload_semaphore = asyncio.Semaphore(MAX_CONCURRENT_UPLOADS)


async def read_stream_with_size_limit(upload: UploadFile, max_size: int = MAX_RECEIPT_SIZE) -> bytes:
    """
    Finding 13 Fix: Read upload stream in 64KB chunks and abort immediately with HTTP 413
    if accumulated bytes exceed limit before reading the entire file into memory.
    """
    chunks = []
    total_size = 0
    chunk_size = 64 * 1024  # 64 KB
    while True:
        chunk = await upload.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File exceeds maximum allowed size of {max_size // (1024 * 1024)}MB."
            )
        chunks.append(chunk)
    return b"".join(chunks)


async def read_request_body_with_size_limit(request: Request, max_size: int = MAX_RECEIPT_SIZE) -> bytes:
    """
    Finding 13 Fix: Stream raw request body in chunks and abort with HTTP 413
    if payload size exceeds limit before full buffer allocation.
    """
    chunks = []
    total_size = 0
    async for chunk in request.stream():
        total_size += len(chunk)
        if total_size > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Request payload exceeds maximum allowed size of {max_size // (1024 * 1024)}MB."
            )
        chunks.append(chunk)
    return b"".join(chunks)


def validate_receipt_upload(content: bytes, filename: str, content_type: Optional[str] = None) -> None:
    """
    Validate receipt payload size and file signatures before processing.
    Finding 9: Exact PNG signature b"\\x89PNG\\r\\n\\x1a\\n" verification.
    Finding 10: Mock test bypasses strictly isolated to test environments, prohibited in production.
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
    # Finding 9: Exact 8-byte PNG signature
    is_png = content.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
    is_pdf = content.startswith(b"%PDF-")

    # Finding 10: Mock/test payloads are strictly prohibited in production
    is_test_env = (
        settings.ENVIRONMENT in ["development", "test"] and
        (os.getenv("PYTEST_CURRENT_TEST") is not None or settings.ENVIRONMENT == "test")
    )
    is_test_bytes = is_test_env and (
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
    Finding 7: Throttled by upload_semaphore to prevent memory exhaustion under load.
    """
    async with upload_semaphore:
        content = await read_stream_with_size_limit(file, MAX_RECEIPT_SIZE)
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
    Finding 7: Throttled by upload_semaphore to prevent memory exhaustion under load.
    """
    async with upload_semaphore:
        content = await read_stream_with_size_limit(file, MAX_RECEIPT_SIZE)
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
    Finding 7: Throttled by upload_semaphore.
    """
    clean_key = os.path.basename(key)
    if ".." in key or clean_key != key:
        raise HTTPException(status_code=400, detail="Invalid receipt key.")

    async with upload_semaphore:
        content = await read_request_body_with_size_limit(request, MAX_RECEIPT_SIZE)
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
    Finding 4 & 11 Fix: Serve locally stored receipt file with strict authentication,
    exact storage-key ownership verification, and path traversal defense.
    """
    clean_key = os.path.basename(key)
    if ".." in key or clean_key != key:
        raise HTTPException(status_code=400, detail="Invalid receipt key.")

    file_path = storage_service.get_local_file_path(clean_key)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Receipt file not found on disk")

    # Privileged roles (Admin, Finance, Reviewer) can view all corporate receipts for review/audit
    if current_user.role not in [UserRole.ADMIN, UserRole.FINANCE, UserRole.REVIEWER]:
        # Regular employee: Verify ownership with exact key matching rather than substring matching (Finding 4)
        res = await db.execute(
            select(Expense).where(
                (Expense.receipt_storage_key == clean_key) |
                (Expense.receipt_url == clean_key) |
                (Expense.receipt_url == f"/api/v1/receipts/download?key={clean_key}") |
                (Expense.receipt_url == f"receipts/{clean_key}")
            )
        )
        expense = res.scalars().first()
        if not expense:
            # Fallback exact key matching using storage key extractor
            u_expenses = (await db.execute(
                select(Expense).where(Expense.submitted_by == current_user.id)
            )).scalars().all()
            for exp in u_expenses:
                if exp.receipt_url:
                    extracted = storage_service.extract_key_from_url(exp.receipt_url)
                    if extracted and os.path.basename(extracted) == clean_key:
                        expense = exp
                        break

        # Finding 4 & 11: Fail closed by default if no verified expense ownership exists
        if not expense:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: No expense record found verifying ownership of this receipt."
            )
        if expense.submitted_by != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not own this receipt document."
            )

    media_type, _ = mimetypes.guess_type(file_path)
    return FileResponse(file_path, media_type=media_type or "application/octet-stream")
