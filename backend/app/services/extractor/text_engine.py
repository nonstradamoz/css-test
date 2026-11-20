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
MAX_CONCURRENT_PDF_PROCESSES = 2    # Local worker concurrency limit
MAX_GLOBAL_PDF_CONCURRENCY = 4      # Finding 6: Distributed concurrency limit across instances
_pdf_semaphore = multiprocessing.Semaphore(MAX_CONCURRENT_PDF_PROCESSES)


def _acquire_pdf_concurrency_slot() -> Tuple[bool, Optional[object]]:
    """
    Finding 6: Acquire global and local concurrency limits for PDF parsing.
    Enforces a distributed limit across all app instances using Redis if configured,
    and bounds local worker process concurrency via OS semaphore.
    """
    from app.core.config import settings
    redis_client = None
    if settings.REDIS_URL and settings.REDIS_URL.strip():
        try:
            import redis
            r = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=1.0)
            lua_acquire = """
            local current = redis.call('GET', KEYS[1])
            if current and tonumber(current) >= tonumber(ARGV[1]) then
                return 0
            end
            redis.call('INCR', KEYS[1])
            redis.call('EXPIRE', KEYS[1], 30)
            return 1
            """
            allowed = r.eval(lua_acquire, 1, "global_concurrent_pdf_workers", MAX_GLOBAL_PDF_CONCURRENCY)
            if not allowed:
                return False, None
            redis_client = r
        except Exception:
            if settings.ENVIRONMENT == "production":
                return False, None

    acquired_local = _pdf_semaphore.acquire(timeout=PDF_TIMEOUT_SECONDS)
    if not acquired_local:
        if redis_client:
            try:
                redis_client.decr("global_concurrent_pdf_workers")
            except Exception:
                pass
        return False, None
    return True, redis_client


def _release_pdf_concurrency_slot(redis_client: Optional[object]) -> None:
    try:
        _pdf_semaphore.release()
    except Exception:
        pass
    if redis_client:
        try:
            redis_client.decr("global_concurrent_pdf_workers")
        except Exception:
            pass


def _isolated_pdf_worker(data: bytes, max_pages: int, conn) -> None:
    """
    Isolated worker process for PDF parsing (Findings 6 & 7).
    Executes in a separate OS process with OS-level CPU & memory limits.
    Verifies that CPU and memory restrictions are active and fails worker
    initialization in production if limits cannot be enforced.
    """
    try:
        from app.core.config import settings
        import sys
        is_prod = settings.ENVIRONMENT == "production"

        try:
            import resource
            # Limit child process CPU time to 8 seconds max
            resource.setrlimit(resource.RLIMIT_CPU, (8, 10))
            cur_cpu, _ = resource.getrlimit(resource.RLIMIT_CPU)
            if cur_cpu > 10:
                raise RuntimeError("RLIMIT_CPU verification failed")

            # Memory address space limit on supported environments (Linux/POSIX)
            if hasattr(resource, "RLIMIT_AS") and sys.platform.startswith("linux"):
                resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 512 * 1024 * 1024))
                cur_as, _ = resource.getrlimit(resource.RLIMIT_AS)
                if cur_as > 512 * 1024 * 1024:
                    raise RuntimeError("RLIMIT_AS verification failed")
        except Exception as res_err:
            if is_prod:
                conn.send(("ERROR", f"PDF_RESOURCE_LIMIT_FAILURE: {res_err}"))
                return
            print(f"[WARN] Non-fatal PDF resource limit warning in dev: {res_err}")

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

        acquired, redis_client = _acquire_pdf_concurrency_slot()
        if not acquired:
            return "", "PDF_ERROR_CONCURRENCY_LIMIT", 0.0

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
        finally:
            _release_pdf_concurrency_slot(redis_client)

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
