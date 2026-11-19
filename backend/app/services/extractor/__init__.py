from .text_engine import DocumentTextEngine
from .financial_parser import FinancialParser

class CustomReceiptExtractor:
    """
    Self-hosted, in-house receipt & invoice extractor.
    Zero external APIs, zero Gemini dependency, zero cloud subscription costs.
    """

    @classmethod
    def extract(cls, file_bytes: bytes, filename: str, content_type: str = "image/jpeg"):
        text, method, confidence = DocumentTextEngine.extract_text(file_bytes, filename, content_type)
        return FinancialParser.parse(text, filename, method, confidence)

__all__ = ["CustomReceiptExtractor", "DocumentTextEngine", "FinancialParser"]
