import pytest
from datetime import datetime, timezone


async def ensure_admin(client):
    await client.post("/api/v1/auth/register", json={
        "email": "v2.admin@crs-corp.com",
        "full_name": "Admin User",
        "password": "Password123!",
        "role": "ADMIN"
    })
    login_res = await client.post("/api/v1/auth/login", json={
        "email": "v2.admin@crs-corp.com",
        "password": "Password123!"
    })
    return login_res.json()["user"], {"Authorization": f"Bearer {login_res.json()['access_token']}"}


async def create_user_and_login(client, admin_headers, email: str, full_name: str, role: str):
    await client.post("/api/v1/users", headers=admin_headers, json={
        "email": email,
        "full_name": full_name,
        "password": "Password123!",
        "role": role
    })
    res = await client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "Password123!"
    })
    data = res.json()
    return data["user"], {"Authorization": f"Bearer {data['access_token']}"}


@pytest.mark.asyncio
async def test_two_tier_review_and_multi_actor_notifications(client):
    """
    End-to-end verification:
    1. Employee submits expense -> Reviewer is notified.
    2. Reviewer approves Tier 1 -> User is notified & Admin is notified.
    3. Reviewer cannot approve Tier 2 (403).
    4. Admin approves Tier 2 -> User is notified of final approval.
    5. Notification read/mark-all-read lifecycle works.
    """
    admin_user, admin_headers = await ensure_admin(client)
    _, reviewer_headers = await create_user_and_login(
        client, admin_headers, "reviewer.notif@crs.com", "Reviewer One", "REVIEWER"
    )
    _, emp_headers = await create_user_and_login(
        client, admin_headers, "emp.notif@crs.com", "Employee One", "EMPLOYEE"
    )
    await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {"account_number": "1122334455", "ifsc_code": "HDFC0001122"},
        "pan_number": "ABCDE1234F",
        "pan_document_url": "https://storage.crs-corp.com/pan/sample_pan.pdf"
    })

    # 1. Employee submits expense claim
    sub_res = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Team Offsite Supplies",
        "amount": 1200.00,
        "category": "SUPPLIES",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/supplies123.png"
    })
    assert sub_res.status_code == 201
    exp_id = sub_res.json()["id"]
    assert sub_res.json()["status"] == "SUBMITTED"
    assert sub_res.json()["approval_tier_required"] == 2

    # Verify Reviewer received notification
    rev_notifs = await client.get("/api/v1/notifications", headers=reviewer_headers)
    assert rev_notifs.status_code == 200
    rev_data = rev_notifs.json()
    assert rev_data["unread_count"] >= 1
    assert any(n["type"] == "REVIEW_REQUIRED" and "Team Offsite Supplies" in n["message"] for n in rev_data["items"])

    # Verify Reviewer sees it in Tier 1 queue
    rev_queue = await client.get("/api/v1/approvals/pending?tier=1", headers=reviewer_headers)
    assert rev_queue.status_code == 200
    assert any(e["id"] == exp_id for e in rev_queue.json())

    # 2. Reviewer submits Tier 1 approval
    t1_res = await client.post(f"/api/v1/approvals/{exp_id}/review", headers=reviewer_headers, json={
        "decision": "APPROVED",
        "comments": "Verified invoice matches claim."
    })
    assert t1_res.status_code == 200
    assert t1_res.json()["status"] == "UNDER_REVIEW"
    assert t1_res.json()["current_approval_tier"] == 1

    # Verify Employee received notification of Reviewer's review
    emp_notifs = await client.get("/api/v1/notifications", headers=emp_headers)
    assert emp_notifs.status_code == 200
    assert any(n["type"] == "REVIEW_PASSED" and "Verified invoice matches claim." in n["message"] for n in emp_notifs.json()["items"])

    # Verify Admin received notification for final approval
    admin_notifs = await client.get("/api/v1/notifications", headers=admin_headers)
    assert admin_notifs.status_code == 200
    assert any(n["type"] == "ADMIN_APPROVAL_REQUIRED" and "Team Offsite Supplies" in n["message"] for n in admin_notifs.json()["items"])

    # 3. Reviewer cannot perform Tier 2 final approval -> 403 Forbidden
    t2_rev_attempt = await client.post(f"/api/v1/approvals/{exp_id}/review", headers=reviewer_headers, json={
        "decision": "APPROVED",
        "comments": "Trying to self-finalize Tier 2"
    })
    assert t2_rev_attempt.status_code == 403

    # 4. Admin sees it in Tier 2 queue and grants final approval
    admin_queue = await client.get("/api/v1/approvals/pending?tier=2", headers=admin_headers)
    assert admin_queue.status_code == 200
    assert any(e["id"] == exp_id for e in admin_queue.json())

    t2_admin_res = await client.post(f"/api/v1/approvals/{exp_id}/review", headers=admin_headers, json={
        "decision": "APPROVED",
        "comments": "Final admin sign-off complete."
    })
    assert t2_admin_res.status_code == 200
    assert t2_admin_res.json()["status"] == "APPROVED"
    assert t2_admin_res.json()["current_approval_tier"] == 2

    # Verify Employee received final approval notification
    emp_notifs_after = await client.get("/api/v1/notifications", headers=emp_headers)
    assert any(n["type"] == "CLAIM_APPROVED" and "Final admin sign-off complete." in n["message"] for n in emp_notifs_after.json()["items"])

    # 5. Test mark single notification read and mark all read
    first_notif_id = emp_notifs_after.json()["items"][0]["id"]
    read_one = await client.patch(f"/api/v1/notifications/{first_notif_id}/read", headers=emp_headers)
    assert read_one.status_code == 200
    assert read_one.json()["is_read"] is True

    mark_all = await client.post("/api/v1/notifications/mark-all-read", headers=emp_headers)
    assert mark_all.status_code == 200
    assert mark_all.json()["unread_count"] == 0

    unread_check = await client.get("/api/v1/notifications/unread-count", headers=emp_headers)
    assert unread_check.json()["unread_count"] == 0


@pytest.mark.asyncio
async def test_reviewer_changes_requested_notifies_user(client):
    """When Reviewer requests changes, Employee is notified with feedback."""
    _, admin_headers = await ensure_admin(client)
    _, reviewer_headers = await create_user_and_login(
        client, admin_headers, "reviewer.chg@crs.com", "Reviewer Chg", "REVIEWER"
    )
    _, emp_headers = await create_user_and_login(
        client, admin_headers, "emp.chg@crs.com", "Employee Chg", "EMPLOYEE"
    )
    await client.patch("/api/v1/users/me", headers=emp_headers, json={
        "bank_details": {"account_number": "99887766", "ifsc_code": "SBIN0001122"},
        "pan_number": "ABCDE1234F",
        "pan_document_url": "https://storage.crs-corp.com/pan/sample_pan.pdf"
    })

    sub_res = await client.post("/api/v1/expenses?submit_now=true", headers=emp_headers, json={
        "title": "Blurred Receipt Lunch",
        "amount": 600.00,
        "category": "MEALS",
        "expense_date": datetime.now(timezone.utc).isoformat(),
        "receipt_url": "https://storage.crs-corp.com/receipts/blur.png"
    })
    assert sub_res.status_code == 201
    exp_id = sub_res.json()["id"]

    # Reviewer requests modifications
    chg_res = await client.post(f"/api/v1/approvals/{exp_id}/review", headers=reviewer_headers, json={
        "decision": "CHANGES_REQUESTED",
        "comments": "Please upload a clearer receipt."
    })
    assert chg_res.status_code == 200
    assert chg_res.json()["status"] == "CHANGES_REQUESTED"

    # Employee is notified
    emp_notifs = await client.get("/api/v1/notifications", headers=emp_headers)
    assert any(n["type"] == "CHANGES_REQUESTED" and "Please upload a clearer receipt." in n["message"] for n in emp_notifs.json()["items"])
