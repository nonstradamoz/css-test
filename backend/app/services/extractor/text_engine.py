import io
import os
import re
import multiprocessing
import concurrent.futures
from typing import Tuple, Optional
from pypdf import PdfReader
from PIL import Image, ImageEnhance, ImageFilter

# Security: Sandboxing & Resource Limits for Document Processing (Findings 3, 6, 7 & 9)
Image.MAX_IMAGE_PIXELS = 25_000_000  # Decompression bomb defense
MAX_PDF_PAGES = 10                  # Prevent PDF bomb denial of service
MAX_PDF_SIZE = 5 * 1024 * 1024      # 5MB maximum file size for PDFs
MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024  # 10MB maximum file size for images
MAX_IMAGE_DIMENSION = 5000          # Maximum width/height in pixels
MAX_IMAGE_HARD_LIMIT = 8000         # Immediate rejection threshold to prevent memory allocation attacks
PDF_TIMEOUT_SECONDS = 5.0           # Strict timeout on PDF parsing process
OCR_TIMEOUT_SECONDS = 10.0          # Strict timeout on image OCR subprocess


def _isolated_pdf_worker(data: bytes, max_pages: int, conn) -> None:
    """
    Isolated worker process for PDF parsing (Finding 3).
    Executes in a separate OS process so any infinite loops or memory spikes
    can be killed with proc.terminate() without destabilizing the server.
    """
    try:
        reader = PdfReader(io.BytesIO(data))
        text_parts = []
        pages_to_process = reader.pages[:max_pages]
        for page in pages_to_process:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        full_text = "\n".join(text_parts).strip()
        conn.send(("SUCCESS", full_text))
    except Exception as exc:
        conn.send(("ERROR", f"PDF_ERROR_{type(exc).__name__}"))
    finally:
        conn.close()

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
        Finding 3: Moves PDF parsing into an isolated worker process.
        Terminates and kills the process if timeout is exceeded, reclaiming memory and CPU.
        """
        if not file_bytes:
            return "", "PDF_EMPTY", 0.0

        if len(file_bytes) > MAX_PDF_SIZE:
            return "", "PDF_ERROR_OVERSIZED", 0.0

        try:
            ctx = multiprocessing.get_context("fork" if hasattr(os, "fork") else "spawn")
            parent_conn, child_conn = ctx.Pipe(duplex=False)
            proc = ctx.Process(
                target=_isolated_pdf_worker,
                args=(file_bytes, MAX_PDF_PAGES, child_conn)
            )
            proc.start()
            child_conn.close()

            proc.join(timeout=PDF_TIMEOUT_SECONDS)

            if proc.is_alive():
                # Finding 3: Forcibly kill worker process when timeout exceeded
                proc.terminate()
                proc.join(timeout=0.5)
                if proc.is_alive():
                    proc.kill()
                parent_conn.close()
                return "", "PDF_ERROR_TIMEOUT", 0.0

            if parent_conn.poll():
                status_code, payload = parent_conn.recv()
                parent_conn.close()
                if status_code == "SUCCESS":
                    if payload and len(payload) > 10:
                        return payload, "PDF_STREAM", 0.98
                    return "", "PDF_SCANNED_NO_OCR", 0.50
                return "", payload, 0.30

            parent_conn.close()
            return "", "PDF_ERROR_WORKER_DIED", 0.0
        except Exception as e:
            return "", f"PDF_ERROR_{type(e).__name__}", 0.30

    @classmethod
    def _extract_from_image(cls, file_bytes: bytes, filename: str) -> Tuple[str, str, float]:
        """
        Process image with Pillow and run Tesseract OCR.
        Findings 6 & 9: Validates file size, lazy dimensions, decompression bombs,
        and malformed byte streams with resource isolation.
        """
        if not file_bytes:
            return "", "IMAGE_EMPTY", 0.0

        if len(file_bytes) > MAX_IMAGE_FILE_SIZE:
            return "", "IMAGE_ERROR_OVERSIZED", 0.0

        try:
            # Open lazily without decoding all pixel arrays immediately
            stream = io.BytesIO(file_bytes)
            try:
                img_probe = Image.open(stream)
            except Image.DecompressionBombError:
                return "", "IMAGE_ERROR_DECOMPRESSION_BOMB", 0.0
            except Exception as probe_err:
                return "", f"IMAGE_ERROR_MALFORMED_{type(probe_err).__name__}", 0.0

            with img_probe:
                width, height = img_probe.size
                total_pixels = width * height

                # Finding 9: Pre-decode dimension and pixel limit checks
                if total_pixels > Image.MAX_IMAGE_PIXELS:
                    return "", "IMAGE_ERROR_DECOMPRESSION_BOMB", 0.0

                if width > MAX_IMAGE_HARD_LIMIT or height > MAX_IMAGE_HARD_LIMIT:
                    return "", "IMAGE_ERROR_DIMENSION_LIMIT", 0.0

                # Copy image buffer for manipulation
                image = img_probe.copy()
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
