import os
import mimetypes
from fastapi import APIRouter, Depends, File, UploadFile, Request, Response, Query, HTTPException, status
from fastapi.responses import FileResponse
from app.schemas import PresignedUploadRequest, PresignedUploadResponse, ReceiptAnalysisResponse
from app.services.storage import storage_service
from app.services.ai_receipt_scanner import AIReceiptScanner
from app.models import User
from app.api.v1.deps import get_current_user

router = APIRouter(prefix="/receipts", tags=["Receipts"])


@router.post("/analyze", response_model=ReceiptAnalysisResponse)
async def analyze_receipt(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Receipt extraction inspector.
    Restricted to auditing personnel (Admin, Reviewer, Finance).
    Employees cannot view receipt extraction data.
    """
    from app.models import UserRole
    if current_user.role == UserRole.EMPLOYEE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Receipt extraction details are confidential to auditing and review personnel."
        )
    content = await file.read()
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
    base_url = str(request.base_url).rstrip("/")
    res = storage_service.generate_presigned_upload(
        filename=data.filename,
        content_type=data.content_type,
        file_size_bytes=data.file_size_bytes,
        base_url=base_url
    )
    return res


@router.put("/local-upload")
async def local_upload(request: Request, key: str = Query(...)):
    """Upload handler for local development, saves raw bytes to disk"""
    content = await request.body()
    storage_service.save_local_file(key, content)
    return {"message": "File uploaded successfully", "key": key}


@router.get("/download")
async def download_file(key: str = Query(...)):
    """Serve locally stored receipt file"""
    file_path = storage_service.get_local_file_path(key)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Receipt file not found on disk")
    media_type, _ = mimetypes.guess_type(file_path)
    return FileResponse(file_path, media_type=media_type or "application/octet-stream")


@router.put("/mock-upload")
async def mock_upload(request: Request, key: str = Query(None)):
    """Legacy mock upload handler, saves file if key is present"""
    content = await request.body()
    if key:
        storage_service.save_local_file(key, content)
    return {"message": "File mock-uploaded successfully"}


@router.get("/mock-download")
async def mock_download(key: str = Query(...)):
    """Legacy mock download handler, returns file if present"""
    file_path = storage_service.get_local_file_path(key)
    if os.path.exists(file_path):
        media_type, _ = mimetypes.guess_type(file_path)
        return FileResponse(file_path, media_type=media_type or "application/octet-stream")
    return {"message": f"Serving receipt mock for key: {key}"}
