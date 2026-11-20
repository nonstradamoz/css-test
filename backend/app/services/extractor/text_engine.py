import io
import os
import re
import concurrent.futures
from typing import Tuple, Optional
from pypdf import PdfReader
from PIL import Image, ImageEnhance, ImageFilter

# Security: Sandboxing & Resource Limits for Document Processing (Findings 6 & 7)
Image.MAX_IMAGE_PIXELS = 25_000_000  # Decompression bomb defense
MAX_PDF_PAGES = 10                  # Prevent PDF bomb denial of service
MAX_PDF_SIZE = 5 * 1024 * 1024      # Finding 7: 5MB maximum file size for PDFs
MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024  # Finding 6: 10MB maximum file size for images
MAX_IMAGE_DIMENSION = 5000          # Maximum width/height in pixels
MAX_IMAGE_HARD_LIMIT = 8000         # Immediate rejection threshold to prevent memory allocation attacks
PDF_TIMEOUT_SECONDS = 5.0           # Finding 7: 5s timeout on PDF parsing
OCR_TIMEOUT_SECONDS = 10.0          # Finding 6: 10s timeout on image OCR

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
        """
        Extract digital text layers from a PDF document.
        Finding 7: Validates file size ceiling, enforces parser timeout, and safely handles malformed PDFs.
        """
        if not file_bytes:
            return "", "PDF_EMPTY", 0.0

        if len(file_bytes) > MAX_PDF_SIZE:
            return "", "PDF_ERROR_OVERSIZED", 0.0

        def _do_parse() -> str:
            reader = PdfReader(io.BytesIO(file_bytes))
            text_parts = []
            # Resource limit: only process first MAX_PDF_PAGES to prevent DoS
            pages_to_process = reader.pages[:MAX_PDF_PAGES]
            for page in pages_to_process:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
            return "\n".join(text_parts).strip()

        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_do_parse)
                full_text = future.result(timeout=PDF_TIMEOUT_SECONDS)

            if full_text and len(full_text) > 10:
                return full_text, "PDF_STREAM", 0.98

            return "", "PDF_SCANNED_NO_OCR", 0.50
        except concurrent.futures.TimeoutError:
            return "", "PDF_ERROR_TIMEOUT", 0.0
        except Exception as e:
            return "", f"PDF_ERROR_{type(e).__name__}", 0.30

    @classmethod
    def _extract_from_image(cls, file_bytes: bytes, filename: str) -> Tuple[str, str, float]:
        """
        Process image with Pillow and run Tesseract OCR.
        Finding 6: Validates file size, lazy dimension limits, pixel count limits,
        and thread execution timeout to prevent resource exhaustion attacks.
        """
        if not file_bytes:
            return "", "IMAGE_EMPTY", 0.0

        if len(file_bytes) > MAX_IMAGE_FILE_SIZE:
            return "", "IMAGE_ERROR_OVERSIZED", 0.0

        try:
            # Open lazily without decoding all pixel arrays immediately
            stream = io.BytesIO(file_bytes)
            with Image.open(stream) as img_probe:
                width, height = img_probe.size
                total_pixels = width * height

                # Finding 6: Pre-decode dimension and pixel limit checks
                if total_pixels > Image.MAX_IMAGE_PIXELS:
                    return "", "IMAGE_ERROR_DECOMPRESSION_BOMB", 0.0

                if width > MAX_IMAGE_HARD_LIMIT or height > MAX_IMAGE_HARD_LIMIT:
                    return "", "IMAGE_ERROR_DIMENSION_LIMIT", 0.0

                # Copy image buffer for manipulation
                image = img_probe.copy()

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
                    # Enforce timeout on OCR subprocess to prevent thread exhaustion
                    ocr_text = pytesseract.image_to_string(enhanced, config="--psm 6", timeout=int(OCR_TIMEOUT_SECONDS))
                    clean_text = ocr_text.strip()
                    if clean_text and len(clean_text) > 8:
                        return clean_text, "TESSERACT_OCR", 0.92
                except Exception as ocr_err:
                    pass

            return "", "IMAGE_NO_LOCAL_OCR", 0.60
        except Exception as img_err:
            return "", f"IMAGE_ERROR_{type(img_err).__name__}", 0.30
