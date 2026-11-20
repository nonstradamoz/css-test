import pytest
import json
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.ai_receipt_scanner import AIReceiptScanner
from app.core.config import settings
from app.models import User, UserRole, Expense, ExpenseStatus


def test_sniff_mime_type():
    """Verify MIME type sniffing correctly identifies binary signatures and extensions"""
    pdf_bytes = b"%PDF-1.4 simulated pdf stream"
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    jpg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF"
    webp_bytes = b"RIFF\x20\x00\x00\x00WEBPVP8 "
    plain_bytes = b"hello text file"

    assert AIReceiptScanner._sniff_mime_type(pdf_bytes, "doc.bin") == "application/pdf"
    assert AIReceiptScanner._sniff_mime_type(png_bytes, "unknown") == "image/png"
    assert AIReceiptScanner._sniff_mime_type(jpg_bytes, "unknown") == "image/jpeg"
    assert AIReceiptScanner._sniff_mime_type(webp_bytes, "unknown") == "image/webp"
    assert AIReceiptScanner._sniff_mime_type(plain_bytes, "invoice.pdf") == "application/pdf"
    assert AIReceiptScanner._sniff_mime_type(plain_bytes, "receipt.png") == "image/png"
    assert AIReceiptScanner._sniff_mime_type(plain_bytes, "bill.jpg") == "image/jpeg"


@pytest.mark.asyncio
async def test_gemini_receipt_scanner_markdown_fences():
    """Verify Gemini Vision parser correctly strips markdown fences and maps all fields"""
    mock_gemini_json = {
        "merchant_name": "Taj Vivanta Hotel",
        "vendor_location": "Bangalore, India",
        "amount": 14250.00,
        "subtotal_amount": 12000.00,
        "currency": "INR",
        "expense_date": "2026-11-18",
        "suggested_category": "ACCOMMODATION",
        "tax_amount": 2250.00,
        "cgst_amount": 1125.00,
        "sgst_amount": 1125.00,
        "igst_amount": 0.00,
        "is_itc_eligible": True,
        "line_items": [
            {"description": "Deluxe Room (1 Night)", "amount": 12000.00, "flagged": False, "reason": None},
            {"description": "Room Service Dinner", "amount": 2250.00, "flagged": False, "reason": None}
        ],
        "category_logistics": {
            "hotel_name": "Taj Vivanta",
            "hotel_location": "MG Road, Bangalore",
            "check_in": "2026-11-18",
            "check_out": "2026-11-19"
        },
        "confidence_score": 0.98,
        "is_handwritten": False,
        "handwritten_notes": None,
        "invoice_number": "TAJ-BLR-2026-9921",
        "transaction_id": "UPI-883920194821",
        "mobile_number": "+91 80 6660 4444",
        "payment_mode": "CARD",
        "gstin": "29AABCT1332L1Z5"
    }

    # Simulate Gemini response wrapped inside ```json ... ``` code block
    fenced_content = f"```json\n{json.dumps(mock_gemini_json)}\n```"

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": fenced_content}]
                }
            }
        ]
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        result = await AIReceiptScanner._analyze_with_gemini(
            file_bytes=b"%PDF-1.4 fake pdf data",
            content_type="application/pdf",
            api_key="AIzaSy_fake_test_key",
            filename="taj_hotel_receipt.pdf"
        )

        assert result is not None
        assert result["merchant_name"] == "Taj Vivanta Hotel"
        assert result["vendor_location"] == "Bangalore, India"
        assert result["amount"] == 14250.00
        assert result["subtotal_amount"] == 12000.00
        assert result["tax_amount"] == 2250.00
        assert result["cgst_amount"] == 1125.00
        assert result["sgst_amount"] == 1125.00
        assert result["is_itc_eligible"] is True
        assert result["suggested_category"] == "ACCOMMODATION"
        assert result["is_synthetic_invoice"] is False
        assert result["verification_status"] == "VERIFIED"
        assert len(result["line_items"]) == 2
        assert result["transaction_id"] == "UPI-883920194821"
        assert result["gstin"] == "29AABCT1332L1Z5"
        assert result["math_check_passed"] is True
        assert result["math_discrepancy_amount"] == 0.0
        assert result["category_logistics"]["hotel_name"] == "Taj Vivanta"


@pytest.mark.asyncio
async def test_gemini_receipt_scanner_api_fallback_on_error():
    """Verify scanner logs error and gracefully falls back to in-house extractor on Gemini 400/500"""
    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = "Invalid argument: API key not valid"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        # Call analyze_receipt with test bytes
        result = await AIReceiptScanner.analyze_receipt(
            file_bytes=b"%PDF-1.4 test receipt bytes",
            filename="uber_cab_receipt.pdf",
            content_type="application/pdf"
        )

        # Must fall back to in-house extractor cleanly without raising unhandled exception
        assert result is not None
        assert "merchant_name" in result
        assert "amount" in result


@pytest.mark.asyncio
async def test_proxy_filing_attribution_and_draft_access(client):
    """
    Verify proxy filing by Admin on behalf of an employee:
    1. Stores proxy_filed_by metadata in category_details
    2. Allows the filing Admin to view the draft they created
    3. Blocks unrelated employees from viewing the private draft
    4. Persists extracted_metadata
    """
    # 1. Setup Admin
    await client.post("/api/v1/auth/register", json={
        "email": "gemini.proxy.admin@crs-corp.com",
        "full_name": "Proxy Admin",
        "password": "Password123!",
        "role": "ADMIN"
    })
    admin_login = await client.post("/api/v1/auth/login", json={
        "email": "gemini.proxy.admin@crs-corp.com",
        "password": "Password123!"
    })
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # 2. Setup target employee
    await client.post("/api/v1/auth/register", json={
        "email": "gemini.target.emp@crs-corp.com",
        "full_name": "Target Emp",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    emp_login = await client.post("/api/v1/auth/login", json={
        "email": "gemini.target.emp@crs-corp.com",
        "password": "Password123!"
    })
    target_emp_id = emp_login.json()["user"]["id"]
    emp_headers = {"Authorization": f"Bearer {emp_login.json()['access_token']}"}

    # 3. Setup unrelated employee
    await client.post("/api/v1/auth/register", json={
        "email": "gemini.unrelated.emp@crs-corp.com",
        "full_name": "Unrelated Emp",
        "password": "Password123!",
        "role": "EMPLOYEE"
    })
    unrelated_login = await client.post("/api/v1/auth/login", json={
        "email": "gemini.unrelated.emp@crs-corp.com",
        "password": "Password123!"
    })
    unrelated_headers = {"Authorization": f"Bearer {unrelated_login.json()['access_token']}"}

    # 4. Admin creates an expense draft on behalf of target employee
    payload = {
        "title": "Proxy Flight to Delhi Client Meeting",
        "description": "Filing flight expense on behalf of employee",
        "category": "TRAVEL",
        "amount": 8500.00,
        "currency": "INR",
        "expense_date": "2026-11-18T10:00:00Z",
        "on_behalf_of_user_id": target_emp_id,
        "extracted_metadata": {
            "merchant_name": "IndiGo Airlines",
            "amount": 8500.00,
            "currency": "INR",
            "expense_date": "2026-11-18",
            "suggested_category": "TRAVEL",
            "line_items": [
                {"description": "Seat 12A Fare", "amount": 8500.00, "flagged": False, "reason": None}
            ]
        },
        "category_details": {
            "travel_mode": "Flight",
            "boarding_point": "Mumbai",
            "arrival_point": "Delhi"
        }
    }

    resp = await client.post(
        "/api/v1/expenses?submit_now=false",
        json=payload,
        headers=admin_headers
    )
    assert resp.status_code == 201
    created_data = resp.json()
    expense_id = created_data["id"]

    # Verify submitted_by belongs to employee
    assert created_data["submitted_by"] == target_emp_id
    # Verify proxy attribution in category_details
    cat_details = created_data.get("category_details") or {}
    assert "proxy_filed_by_id" in cat_details
    assert "proxy_filed_by_name" in cat_details
    assert cat_details["proxy_filed_by_role"] == "ADMIN"

    # Verify extracted_metadata persisted
    assert created_data["extracted_metadata"] is not None
    assert created_data["extracted_metadata"]["merchant_name"] == "IndiGo Airlines"

    # 5. Verify Admin who created the proxy draft CAN view it
    admin_get_resp = await client.get(
        f"/api/v1/expenses/{expense_id}",
        headers=admin_headers
    )
    assert admin_get_resp.status_code == 200
    assert admin_get_resp.json()["id"] == expense_id

    # 6. Verify target employee CAN view their own draft
    emp_get_resp = await client.get(
        f"/api/v1/expenses/{expense_id}",
        headers=emp_headers
    )
    assert emp_get_resp.status_code == 200

    # 7. Verify unrelated employee CANNOT view this draft (403 Forbidden)
    unrelated_get_resp = await client.get(
        f"/api/v1/expenses/{expense_id}",
        headers=unrelated_headers
    )
    assert unrelated_get_resp.status_code == 403
