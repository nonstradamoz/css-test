import io
import os
import re
from typing import Tuple, Optional
from pypdf import PdfReader
from PIL import Image, ImageEnhance, ImageFilter

# Security: Sandboxing & Resource Limits for Document Processing
Image.MAX_IMAGE_PIXELS = 25_000_000  # Decompression bomb defense
MAX_PDF_PAGES = 10                  # Prevent PDF bomb denial of service
MAX_IMAGE_DIMENSION = 5000          # Maximum width/height in pixels

try:
    import pytesseract
    HAS_PYTESSERACT = True
    for t_path in ["/opt/homebrew/bin/tesseract", "/usr/local/bin/tesseract", "/usr/bin/tesseract"]:
        if os.path.exists(t_path):
            pytesseract.pytesseract.tesseract_cmd = t_path
            break
except ImportError:
    HAS_PYTESSERACT = False


class DocumentTextEngine:
    """
    Acquires raw text from PDFs and images locally with zero external API calls.
    - PDFs: Direct digital stream parsing via pypdf.
    - Images: OCR parsing via Pillow preprocessing and local Tesseract OCR.
    """

    @classmethod
    def extract_text(
        cls,
        file_bytes: bytes,
        filename: str,
        content_type: str = "image/jpeg"
    ) -> Tuple[str, str, float]:
        """
        Extract text from file.
        Returns:
            (extracted_text, method_used, confidence_score)
        """
        fn_lower = filename.lower()
        is_pdf = fn_lower.endswith(".pdf") or "pdf" in content_type.lower()

        if is_pdf:
            return cls._extract_from_pdf(file_bytes)

        # Image parsing
        return cls._extract_from_image(file_bytes, filename)

    @classmethod
    def _extract_from_pdf(cls, file_bytes: bytes) -> Tuple[str, str, float]:
        """Extract digital text layers from a PDF document with page-limit protection"""
        try:
            reader = PdfReader(io.BytesIO(file_bytes))
            text_parts = []
            # Resource limit: only process first MAX_PDF_PAGES to prevent DoS
            pages_to_process = reader.pages[:MAX_PDF_PAGES]
            for page in pages_to_process:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

            full_text = "\n".join(text_parts).strip()
            if full_text and len(full_text) > 10:
                return full_text, "PDF_STREAM", 0.98

            return "", "PDF_SCANNED_NO_OCR", 0.50
        except Exception as e:
            return "", f"PDF_ERROR_{type(e).__name__}", 0.30

    @classmethod
    def _extract_from_image(cls, file_bytes: bytes, filename: str) -> Tuple[str, str, float]:
        """Process image with Pillow and run Tesseract OCR with dimension and timeout limits"""
        try:
            image = Image.open(io.BytesIO(file_bytes))

            # Enforce max dimension limits (downsample oversized images to prevent DoS)
            if image.width > MAX_IMAGE_DIMENSION or image.height > MAX_IMAGE_DIMENSION:
                image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

            # Convert to grayscale and enhance contrast for better OCR recognition
            if image.mode != "L":
                gray = image.convert("L")
            else:
                gray = image

            enhancer = ImageEnhance.Contrast(gray)
            enhanced = enhancer.enhance(1.8)

            if HAS_PYTESSERACT:
                try:
                    # Enforce 10-second timeout on OCR subprocess to prevent thread exhaustion
                    ocr_text = pytesseract.image_to_string(enhanced, config="--psm 6", timeout=10)
                    clean_text = ocr_text.strip()
                    if clean_text and len(clean_text) > 8:
                        return clean_text, "TESSERACT_OCR", 0.92
                except Exception as ocr_err:
                    pass

            return "", "IMAGE_NO_LOCAL_OCR", 0.60
        except Exception as img_err:
            return "", f"IMAGE_ERROR_{type(img_err).__name__}", 0.30
