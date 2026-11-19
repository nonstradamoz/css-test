import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense, ExpenseStatus, SystemSettings


class ForensicsEngine:
    """
    Automated Forensic Policy Compliance & Risk Scoring Engine.
    Evaluates multi-vector compliance signals:
    - Cross-Employee Collusion & Duplicate Detection
    - Threshold Smurfing & Velocity Evasion
    - Restricted / Prohibited Line-Item Inspection
    - Weekend & Off-Hours Anomalies
    """

    PROHIBITED_KEYWORDS = [
        "alcohol", "liquor", "wine", "beer", "whiskey", "vodka", "rum", "cocktail",
        "spa", "massage", "gift card", "casino", "tobacco", "cigarette", "vape"
    ]

    @classmethod
    async def evaluate_expense(
        cls,
        db: AsyncSession,
        submitter_id: str,
        amount: Decimal,
        expense_date: datetime,
        category: str,
        receipt_hash: Optional[str] = None,
        line_items: Optional[List[Dict[str, Any]]] = None,
        extracted_metadata: Optional[Dict[str, Any]] = None,
        exclude_expense_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Evaluate an expense claim against forensic compliance vectors.
        Returns risk_score (0-100), risk_level, flags list, will_escalate_tier2, and is_blocked.
        """
        if not line_items and extracted_metadata and isinstance(extracted_metadata, dict):
            line_items = extracted_metadata.get("line_items")

        # Fetch system settings for thresholds
        settings_res = await db.execute(select(SystemSettings).where(SystemSettings.id == 1))
        settings_obj = settings_res.scalars().first()
        tier2_threshold = Decimal(str(settings_obj.tier2_approval_threshold)) if settings_obj else Decimal("25000.00")

        risk_score = 0
        flags: List[Dict[str, Any]] = []
        is_blocked = False
        block_reason = None
        will_escalate_tier2 = False

        active_statuses = [
            ExpenseStatus.SUBMITTED,
            ExpenseStatus.UNDER_REVIEW,
            ExpenseStatus.APPROVED,
            ExpenseStatus.REIMBURSED
        ]

        # -------------------------------------------------------------
        # Vector 1: Cross-Employee Receipt Collusion Detection
        # -------------------------------------------------------------
        if receipt_hash:
            query = select(Expense).where(
                and_(
                    Expense.receipt_hash == receipt_hash,
                    Expense.submitted_by != submitter_id,
                    Expense.status.in_(active_statuses)
                )
            )
            if exclude_expense_id:
                query = query.where(Expense.id != exclude_expense_id)

            res = await db.execute(query)
            collusion_match = res.scalars().first()
            if collusion_match:
                is_blocked = True
                block_reason = (
                    f"CRITICAL FORENSIC BLOCK: Receipt image has already been claimed by another employee "
                    f"(Claim ID: {collusion_match.id[:8]}...). Cross-employee receipt reuse is prohibited."
                )
                flags.append({
                    "code": "CROSS_EMPLOYEE_COLLUSION",
                    "label": "Cross-Employee Collusion Detected",
                    "severity": "CRITICAL",
                    "description": block_reason
                })
                return {
                    "risk_score": 100,
                    "risk_level": "HIGH",
                    "flags": flags,
                    "will_escalate_tier2": True,
                    "is_blocked": True,
                    "block_reason": block_reason
                }

        # -------------------------------------------------------------
        # Vector 2: Threshold Smurfing & Velocity Evasion Check
        # (Submitting multiple claims within 48h to stay under Tier-2 threshold)
        # -------------------------------------------------------------
        window_start = datetime.now(timezone.utc) - timedelta(hours=48)
        smurf_query = select(Expense).where(
            and_(
                Expense.submitted_by == submitter_id,
                Expense.created_at >= window_start,
                Expense.status.in_(active_statuses)
            )
        )
        if exclude_expense_id:
            smurf_query = smurf_query.where(Expense.id != exclude_expense_id)

        smurf_res = await db.execute(smurf_query)
        recent_expenses = smurf_res.scalars().all()
        past_48h_sum = sum(Decimal(str(e.amount)) for e in recent_expenses)
        cumulative_48h = past_48h_sum + amount

        # Smurfing condition: single claim is below threshold, but cumulative 48h spend >= threshold
        if amount < tier2_threshold and cumulative_48h >= tier2_threshold and len(recent_expenses) > 0:
            risk_score += 35
            will_escalate_tier2 = True
            flags.append({
                "code": "THRESHOLD_SMURFING",
                "label": "Threshold Smurfing Evasion Alert",
                "severity": "HIGH",
                "description": (
                    f"Cumulative claims in past 48 hours (₹{cumulative_48h:,.2f} across {len(recent_expenses) + 1} claims) "
                    f"exceed the Tier-2 Finance threshold (₹{tier2_threshold:,.2f}). "
                    f"Automatically escalated to mandatory Tier-2 Finance approval."
                )
            })

        # -------------------------------------------------------------
        # Vector 3: Restricted Line-Item Inspection
        # -------------------------------------------------------------
        flagged_items = []
        if line_items:
            for item in line_items:
                desc = str(item.get("description", "")).lower()
                for kw in cls.PROHIBITED_KEYWORDS:
                    if kw in desc:
                        flagged_items.append((item.get("description", "Item"), kw))
                        break

        if flagged_items:
            risk_score += 30
            will_escalate_tier2 = True
            item_names = ", ".join([f"'{name}' (keyword: {kw})" for name, kw in flagged_items])
            flags.append({
                "code": "PROHIBITED_LINE_ITEM",
                "label": "Restricted Line Item Warning",
                "severity": "HIGH",
                "description": f"Receipt contains non-compliant item: {item_names}."
            })

        # -------------------------------------------------------------
        # Vector 4: Weekend / Off-Hours Transaction Check
        # -------------------------------------------------------------
        # 5 = Saturday, 6 = Sunday
        if expense_date.weekday() in (5, 6):
            risk_score += 15
            day_name = expense_date.strftime("%A")
            flags.append({
                "code": "WEEKEND_TRANSACTION",
                "label": "Weekend Spend Anomaly",
                "severity": "MEDIUM",
                "description": f"Transaction incurred on {day_name}. Reviewers must verify corporate business justification."
            })

        # -------------------------------------------------------------
        # Vector 5: High Value Outlier Check
        # -------------------------------------------------------------
        if amount >= (tier2_threshold * 2):
            risk_score += 15
            flags.append({
                "code": "HIGH_VALUE_OUTLIER",
                "label": "High-Value Transaction Outlier",
                "severity": "MEDIUM",
                "description": f"Claim amount (₹{amount:,.2f}) is more than 2x the standard Tier-2 threshold."
            })

        # -------------------------------------------------------------
        # Vector 6: Financial Identifier & Recycled Bill Collision Check
        # (Receipt Number, Bill Number, Transaction ID, UPI Ref, UTR)
        # -------------------------------------------------------------
        if extracted_metadata and isinstance(extracted_metadata, dict):
            identifiers_to_check: List[Tuple[str, str, str]] = []

            # 1. Transaction ID (UPI Ref, UTR, Bank RRN, Txn Ref)
            txn_id = extracted_metadata.get("transaction_id")
            if txn_id and isinstance(txn_id, str):
                clean_txn = txn_id.strip()
                if len(clean_txn) >= 4 and not clean_txn.upper().startswith("FALLBACK") and clean_txn.upper() not in ("UNKNOWN", "N/A", "NONE"):
                    identifiers_to_check.append(("Transaction ID / UPI Ref", "transaction_id", clean_txn))

            # 2. Bill Number
            bill_num = extracted_metadata.get("bill_number")
            if bill_num and isinstance(bill_num, str):
                clean_bill = bill_num.strip()
                if len(clean_bill) >= 3 and not clean_bill.upper().startswith("FALLBACK") and clean_bill.upper() not in ("UNKNOWN", "N/A", "NONE"):
                    identifiers_to_check.append(("Bill Number", "bill_number", clean_bill))

            # 3. Receipt Number
            rcpt_num = extracted_metadata.get("receipt_number")
            if rcpt_num and isinstance(rcpt_num, str):
                clean_rcpt = rcpt_num.strip()
                if len(clean_rcpt) >= 3 and not clean_rcpt.upper().startswith("FALLBACK") and clean_rcpt.upper() not in ("UNKNOWN", "N/A", "NONE"):
                    identifiers_to_check.append(("Receipt Number", "receipt_number", clean_rcpt))

            # 4. Invoice Number (only if not a synthetic fallback)
            is_synthetic_inv = extracted_metadata.get("is_synthetic_invoice", False)
            inv_num = extracted_metadata.get("invoice_number")
            if inv_num and isinstance(inv_num, str) and not is_synthetic_inv:
                clean_inv = inv_num.strip()
                if len(clean_inv) >= 4 and not clean_inv.upper().startswith("INV-") and clean_inv.upper() not in ("UNKNOWN", "N/A", "NONE"):
                    identifiers_to_check.append(("Invoice Number", "invoice_number", clean_inv))

            if identifiers_to_check:
                id_query = select(Expense).where(
                    and_(
                        Expense.status.in_(active_statuses),
                        Expense.extracted_metadata.is_not(None)
                    )
                )
                if exclude_expense_id:
                    id_query = id_query.where(Expense.id != exclude_expense_id)

                id_res = await db.execute(id_query)
                active_expenses = id_res.scalars().all()

                for existing in active_expenses:
                    ex_meta = existing.extracted_metadata or {}
                    if not isinstance(ex_meta, dict):
                        continue

                    for label, key_name, target_val in identifiers_to_check:
                        norm_target = re.sub(r"[\s\-_:/#]+", "", target_val).upper()

                        vals_to_test = []
                        if key_name == "transaction_id":
                            if ex_meta.get("transaction_id"):
                                vals_to_test.append(("Transaction ID", str(ex_meta.get("transaction_id"))))
                        else:
                            for test_k in ("receipt_number", "bill_number", "invoice_number"):
                                if ex_meta.get(test_k) and not (test_k == "invoice_number" and ex_meta.get("is_synthetic_invoice")):
                                    vals_to_test.append((label, str(ex_meta.get(test_k))))

                        for test_label, cand_val in vals_to_test:
                            clean_cand = re.sub(r"[\s\-_:/#]+", "", cand_val).upper()
                            if len(clean_cand) >= 3 and clean_cand == norm_target:
                                if existing.submitted_by != submitter_id:
                                    is_blocked = True
                                    block_reason = (
                                        f"CRITICAL FORENSIC BLOCK: Recycled Bill/Transaction Collision! Extracted {label} '{target_val}' "
                                        f"matches existing claim (Claim #{existing.id[:8]} - '{existing.title}') submitted by another employee. "
                                        f"Cross-employee bill recycling is strictly prohibited."
                                    )
                                    flags.append({
                                        "code": "RECYCLED_BILL_COLLUSION",
                                        "label": "Recycled Financial Identifier Collusion",
                                        "severity": "CRITICAL",
                                        "description": block_reason
                                    })
                                    return {
                                        "risk_score": 100,
                                        "risk_level": "HIGH",
                                        "flags": flags,
                                        "will_escalate_tier2": True,
                                        "is_blocked": True,
                                        "block_reason": block_reason
                                    }
                                else:
                                    is_blocked = True
                                    block_reason = (
                                        f"CRITICAL FORENSIC BLOCK: Duplicate Financial Identifier! Extracted {label} '{target_val}' "
                                        f"was already claimed by you in Claim #{existing.id[:8]} ('{existing.title}')."
                                    )
                                    flags.append({
                                        "code": "DUPLICATE_FINANCIAL_IDENTIFIER",
                                        "label": "Duplicate Bill / Transaction Submission",
                                        "severity": "CRITICAL",
                                        "description": block_reason
                                    })
                                    return {
                                        "risk_score": 100,
                                        "risk_level": "HIGH",
                                        "flags": flags,
                                        "will_escalate_tier2": True,
                                        "is_blocked": True,
                                        "block_reason": block_reason
                                    }

                # All identifiers verified unique across active records
                verified_summary = ", ".join([f"{lbl}: {val}" for lbl, _, val in identifiers_to_check])
                flags.append({
                    "code": "FINANCIAL_IDENTIFIERS_VERIFIED",
                    "label": "Financial Identifiers Authenticated",
                    "severity": "LOW",
                    "description": f"Verified unique across organization records ({verified_summary}). No duplicate receipt or recycled transaction collisions detected."
                })

        # Final Score Normalization
        final_risk_score = min(100, risk_score)
        if final_risk_score >= 60:
            risk_level = "HIGH"
            will_escalate_tier2 = True
        elif final_risk_score >= 30:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        return {
            "risk_score": final_risk_score,
            "risk_level": risk_level,
            "flags": flags,
            "will_escalate_tier2": will_escalate_tier2,
            "is_blocked": is_blocked,
            "block_reason": block_reason
        }
