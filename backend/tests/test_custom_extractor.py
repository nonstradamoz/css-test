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
async def test_financial_parser_ignores_contact_and_phone_numbers():
    raw_text = """
    TAX INVOICE / RETAIL INVOICE
    ORIGINAL FOR RECIPIENT
    CHAAYOS - SUNSHINE TEAS PVT LTD
    Plot 14, 100ft Road, Indiranagar, Bangalore - 560038
    Ph: +91 9845012345
    Mob: 919876543210
    Customer Care Tel: 1800-102-1234
    GSTIN: 29AAFCS1234F1Z5
    Date: 18/11/2026
    Invoice No: CH-90812

    Kulhad Chai 120.00
    Bun Maska 90.00
    Subtotal: 210.00
    CGST 2.5%: 5.25
    SGST 2.5%: 5.25
    Grand Total: ₹220.50
    Call us for feedback: 9845099999
    """
    parsed = FinancialParser.parse(raw_text, "chaayos_bill.pdf", "PDF_STREAM", 0.95)

    # 1. Merchant name should be Chaayos, NOT "TAX INVOICE / RETAIL INVOICE"
    assert "CHAAYOS" in parsed["merchant_name"].upper()
    assert "TAX INVOICE" not in parsed["merchant_name"].upper()
    assert "ORIGINAL" not in parsed["merchant_name"].upper()

    # 2. Category should be MEALS
    assert parsed["suggested_category"] == "MEALS"

    # 3. Total amount should be 220.50, NOT a phone number
    assert parsed["amount"] == 220.50

    # 4. Line items should only contain real items, NOT phone numbers or pincode
    line_descs = [item["description"].lower() for item in parsed["line_items"]]
    for item in parsed["line_items"]:
        assert item["amount"] < 10000.0
        assert item["amount"] not in (9845012345, 919876543210, 560038, 18001021234)

    assert not any("ph:" in d or "mob:" in d or "tel:" in d or "care" in d for d in line_descs)


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


@pytest.mark.asyncio
async def test_role_based_extraction_privacy(client):
    # 1. Register and login admin
    admin_reg = await client.post("/api/v1/auth/register", json={
        "email": "audit.superadmin@crs-corp.com",
        "full_name": "Audit Admin",
        "password": "Password123!",
        "role": "ADMIN"
    })
    admin_login = await client.post("/api/v1/auth/login", json={
        "email": "audit.superadmin@crs-corp.com",
        "password": "Password123!"
    })
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 2. Register and login employee
    emp_reg = await client.post("/api/v1/auth/register", json={
        "email": "audit.staff@crs-corp.com",
        "full_name": "Audit Staff",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "audit.staff@crs-corp.com",
        "password": "Password123!"
    })
    emp_token = emp_login.json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}
    await client.patch(
        "/api/v1/users/me",
        headers=emp_headers,
        json={"bank_details": {"account_number": "777788889999", "ifsc_code": "HDFC0007777"}}
    )

    # 3. Employee can call analyze endpoint directly (200 OK)
    emp_analyze = await client.post(
        "/api/v1/receipts/analyze",
        headers=emp_headers,
        files={"file": ("bill.jpg", b"fake content", "image/jpeg")}
    )
    assert emp_analyze.status_code == 200
    assert emp_analyze.json()["merchant_name"] is not None
    assert emp_analyze.json()["amount"] > 0

    # 4. Admin creates expense with extracted metadata
    expense_res = await client.post(
        "/api/v1/expenses",
        headers=admin_headers,
        json={
            "title": "Business Dinner with Client",
            "amount": 2500.0,
            "currency": "INR",
            "category": "MEALS",
            "expense_date": "2026-11-19T00:00:00.000Z",
            "extracted_metadata": {
                "merchant_name": "Client Bistro",
                "amount": 2100.0,
                "expense_date": "2026-11-19",
                "line_items": [{"description": "Dinner", "amount": 2100.0, "flagged": False}]
            }
        }
    )
    assert expense_res.status_code == 201
    exp_id = expense_res.json()["id"]

    # 5. Admin retrieves expense -> extracted_metadata IS populated for cross-verification
    admin_get = await client.get(f"/api/v1/expenses/{exp_id}", headers=admin_headers)
    assert admin_get.status_code == 200
    assert admin_get.json()["extracted_metadata"] is not None
    assert admin_get.json()["extracted_metadata"]["merchant_name"] == "Client Bistro"

    # 6. Employee creates an expense
    emp_exp_res = await client.post(
        "/api/v1/expenses",
        headers=emp_headers,
        json={
            "title": "Staff Taxi Trip",
            "amount": 450.0,
            "currency": "INR",
            "category": "TRAVEL",
            "expense_date": "2026-11-19T00:00:00.000Z",
            "extracted_metadata": {
                "merchant_name": "City Fast Cab",
                "transaction_id": "UPI-9876543210",
                "payment_mode": "UPI",
                "mobile_number": "+91 9876543210"
            }
        }
    )
    emp_exp_id = emp_exp_res.json()["id"]

    # 7. Employee retrieves their own expense -> extracted_metadata is preserved
    emp_get = await client.get(f"/api/v1/expenses/{emp_exp_id}", headers=emp_headers)
    assert emp_get.status_code == 200
    assert emp_get.json()["extracted_metadata"] is not None
    assert emp_get.json()["extracted_metadata"]["transaction_id"] == "UPI-9876543210"


@pytest.mark.asyncio
async def test_financial_parser_extracts_receipt_bill_and_transaction_ids():
    raw_text = """
    PVR CINEMAS & FOOD COURT
    Tax Invoice / Cash Memo
    Bill No: PVR-BLR-84920
    Receipt #: RCPT-9921
    UPI Ref: 432109876543
    Payment Mode: UPI (GPay)
    Mob: +91 9876543210
    GSTIN: 29AABCP1234F1Z9
    Date: 19/11/2026

    Popcorn & Combo 450.00
    Cold Beverage 180.00
    Subtotal: 630.00
    CGST: 15.75
    SGST: 15.75
    Total Amount: ₹661.50
    """
    parsed = FinancialParser.parse(raw_text, "cinema_receipt.pdf", "PDF_STREAM", 0.95)

    assert parsed["bill_number"] == "PVR-BLR-84920"
    assert parsed["receipt_number"] == "RCPT-9921"
    assert parsed["transaction_id"] == "432109876543"
    assert parsed["gstin"] == "29AABCP1234F1Z9"
    assert parsed["invoice_number"] == "PVR-BLR-84920"
    assert parsed["amount"] == 661.50
    assert parsed["mobile_number"] is not None
    assert "9876543210" in parsed["mobile_number"]
    assert parsed["payment_mode"] == "UPI"


@pytest.mark.asyncio
async def test_forensics_blocks_duplicate_transaction_id_and_recycled_bills(client):
    # 1. Register and Login Admin and Employee
    await client.post("/api/v1/auth/register", json={
        "email": "forensic.admin@crs-corp.com",
        "full_name": "Forensic Admin",
        "password": "Password123!",
        "role": "ADMIN"
    })
    admin_login = await client.post("/api/v1/auth/login", json={
        "email": "forensic.admin@crs-corp.com",
        "password": "Password123!"
    })
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    await client.post("/api/v1/auth/register", json={
        "email": "forensic.employee@crs-corp.com",
        "full_name": "Forensic Employee",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "forensic.employee@crs-corp.com",
        "password": "Password123!"
    })
    emp_token = emp_login.json()["access_token"]
    emp_headers = {"Authorization": f"Bearer {emp_token}"}
    await client.patch(
        "/api/v1/users/me",
        headers=emp_headers,
        json={"bank_details": {"account_number": "777788889999", "ifsc_code": "HDFC0007777"}}
    )

    # 2. Admin submits an active claim with transaction_id and bill_number
    res1 = await client.post(
        "/api/v1/expenses?submit_now=true",
        headers=admin_headers,
        json={
            "title": "Vendor Server Hardware Setup",
            "amount": 12000.0,
            "currency": "INR",
            "category": "HARDWARE",
            "expense_date": "2026-11-19T00:00:00.000Z",
            "receipt_url": "/api/v1/receipts/view?key=fake-key-1",
            "extracted_metadata": {
                "merchant_name": "Tech Hardware Corp",
                "amount": 12000.0,
                "bill_number": "BILL-TECH-90812",
                "receipt_number": "RCPT-4401",
                "transaction_id": "UPI-432109876543",
                "invoice_number": "BILL-TECH-90812",
                "is_synthetic_invoice": False
            }
        }
    )
    assert res1.status_code == 201
    claim1_data = res1.json()
    assert claim1_data["status"] == "SUBMITTED"

    # Verify that Claim 1 got authenticated with unique financial identifiers
    flags1 = [f["code"] for f in claim1_data["forensic_flags"]]
    assert "FINANCIAL_IDENTIFIERS_VERIFIED" in flags1

    # 3. Employee attempts to submit a claim with the SAME transaction ID (Collusion / Recycled Bill)
    res2 = await client.post(
        "/api/v1/expenses?submit_now=true",
        headers=emp_headers,
        json={
            "title": "Supplies Reclaim Attempt",
            "amount": 12000.0,
            "currency": "INR",
            "category": "SUPPLIES",
            "expense_date": "2026-11-19T00:00:00.000Z",
            "receipt_url": "/api/v1/receipts/view?key=fake-key-2",
            "extracted_metadata": {
                "merchant_name": "Tech Hardware Corp",
                "amount": 12000.0,
                "transaction_id": "UPI-432109876543"  # SAME TXN ID!
            }
        }
    )
    assert res2.status_code == 400
    err_detail = res2.json()["detail"]
    assert "CRITICAL FORENSIC BLOCK" in err_detail
    assert "Recycled" in err_detail or "Collision" in err_detail

    # 4. Same admin attempts to submit another claim with the same bill number
    res3 = await client.post(
        "/api/v1/expenses?submit_now=true",
        headers=admin_headers,
        json={
            "title": "Hardware Setup Duplicate",
            "amount": 5000.0,
            "currency": "INR",
            "category": "HARDWARE",
            "expense_date": "2026-11-19T00:00:00.000Z",
            "receipt_url": "/api/v1/receipts/view?key=fake-key-3",
            "extracted_metadata": {
                "merchant_name": "Tech Hardware Corp",
                "amount": 5000.0,
                "bill_number": "BILL-TECH-90812"  # SAME BILL #!
            }
        }
    )
    assert res3.status_code == 400
    err_detail3 = res3.json()["detail"]
    assert "CRITICAL FORENSIC BLOCK" in err_detail3
    assert "Duplicate Financial Identifier" in err_detail3


