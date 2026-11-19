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
    Multimodal AI Receipt Scanner.
    Inspects uploaded receipt image or PDF, recognizes printed and handwritten text,
    and returns extracted financial details, line items, and compliance warnings.
    """
    content = await file.read()
    res = await AIReceiptScanner.analyze_receipt(
        file_bytes=content,
        filename=file.filename or "receipt.jpg",
        content_type=file.content_type or "image/jpeg"
    )
    return res


@router.post("/presigned-upload", response_model=PresignedUploadResponse)
async def get_presigned_upload_url(
    data: PresignedUploadRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Generate pre-signed PUT URL for uploading receipts to Cloudflare R2 (or local fallback).
    """
    res = storage_service.generate_presigned_upload(
        filename=data.filename,
        content_type=data.content_type,
        file_size_bytes=data.file_size_bytes
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
