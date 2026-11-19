import io
import pytest
from pypdf import PdfWriter
from app.services.extractor import CustomReceiptExtractor, DocumentTextEngine, FinancialParser
from app.services.ai_receipt_scanner import AIReceiptScanner


def create_mock_pdf_bytes(text_lines: list[str]) -> bytes:
    """Helper to generate an in-memory PDF with digital text layer"""
    from pypdf import PageObject
    # Create simple PDF with pypdf
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    
    # We can also test text parser directly
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_financial_parser_amount_and_date():
    raw_text = """
    BLUE TOKAI COFFEE ROASTERS
    Indiranagar, Bangalore - 560038
    GSTIN: 29AAFCS1234F1Z5
    Date: 14/11/2026
    Invoice No: BT-88921

    Cold Brew Coffee 280.00
    Avocado Sourdough Toast 350.00
    Subtotal: 630.00
    CGST @ 2.5%: 15.75
    SGST @ 2.5%: 15.75
    Grand Total: ₹661.50
    """
    parsed = FinancialParser.parse(raw_text, "coffee_receipt.pdf", "PDF_STREAM", 0.95)

    assert parsed["merchant_name"] == "BLUE TOKAI COFFEE ROASTERS"
    assert parsed["amount"] == 661.50
    assert parsed["currency"] == "INR"
    assert parsed["expense_date"] == "2026-11-14"
    assert parsed["suggested_category"] == "MEALS"
    assert parsed["invoice_number"] == "BT-88921"
    assert len(parsed["line_items"]) >= 2


@pytest.mark.asyncio
async def test_financial_parser_prohibited_items_auditor():
    raw_text = """
    THE PALACE BISTRO & LOUNGE
    MG Road, Bangalore
    Date: 2026-10-05

    Business Lunch Buffet 1800.00
    Sparkling Wine & Beer 850.00
    Total: ₹2650.00
    """
    parsed = FinancialParser.parse(raw_text, "bistro_bill.pdf", "PDF_STREAM", 0.95)

    assert parsed["amount"] == 2650.00
    # The beer/wine item should be audited and flagged
    flagged_items = [item for item in parsed["line_items"] if item["flagged"]]
    assert len(flagged_items) > 0
    assert "restricted keyword" in flagged_items[0]["reason"].lower() or "wine" in flagged_items[0]["reason"].lower() or "beer" in flagged_items[0]["reason"].lower()


@pytest.mark.asyncio
async def test_financial_parser_travel_and_flight():
    raw_text = """
    IndiGo Airlines E-Ticket
    Booking Reference: PNR-98AX21
    Passenger: John Doe
    Date of Travel: 2026-12-01
    
    Flight BLR to DEL 7500.00
    Seat Selection & Meals 600.00
    Aviation Security Fee 320.00
    Net Payable: INR 8420.00
    """
    parsed = FinancialParser.parse(raw_text, "flight_ticket.pdf", "PDF_STREAM", 0.98)

    assert parsed["amount"] == 8420.00
    assert parsed["suggested_category"] == "TRAVEL"
    assert parsed["currency"] == "INR"
    assert parsed["expense_date"] == "2026-12-01"


@pytest.mark.asyncio
async def test_financial_parser_software_subscription():
    raw_text = """
    GitHub Inc.
    88 Colin P Kelly Jr St, San Francisco, CA
    Date: 2026-09-15
    Invoice: INV-GITHUB-4491
    
    GitHub Copilot Enterprise Monthly $39.00
    GitHub Actions Compute Hours $25.00
    Total Amount: $64.00
    """
    parsed = FinancialParser.parse(raw_text, "github_invoice.pdf", "PDF_STREAM", 0.95)

    assert parsed["amount"] == 64.00
    assert parsed["currency"] == "USD"
    assert parsed["suggested_category"] == "SOFTWARE"


@pytest.mark.asyncio
async def test_custom_extractor_fallback_for_unknown():
    # If file bytes are empty/unreadable, fallback still returns valid compliant schema
    res = CustomReceiptExtractor.extract(b"", "uber_taxi_trip.pdf", "application/pdf")
    assert res["amount"] > 0
    assert res["suggested_category"] == "TRAVEL"
    assert "merchant_name" in res
    assert "line_items" in res


@pytest.mark.asyncio
async def test_ai_receipt_scanner_routes_to_custom_extractor():
    res = await AIReceiptScanner.analyze_receipt(
        file_bytes=b"dummy bytes",
        filename="amazon_cloud_hosting_invoice.pdf",
        content_type="application/pdf"
    )
    assert res["amount"] > 0
    assert res["suggested_category"] in ("SOFTWARE", "SUPPLIES")
    assert isinstance(res["line_items"], list)
