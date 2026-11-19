# Centralised Expense & Refund Management System (CRS)

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Async%20REST%20API-009688.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7%20Idempotency%20%7C%20Queue-DC382D.svg)](https://redis.io/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20App%20Router-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare%20R2-F38020.svg)](https://developers.cloudflare.com/r2/)

A production-grade, bug-free, single-tenant enterprise Expense & Refund Management System. The platform enables organizations to manage employee expense claims, multi-tiered approval workflows, receipt document storage via Cloudflare R2, automated reimbursement disbursements with idempotency locks, duplicate claim detection, and immutable compliance audit trails.

---

## 1. Core Architecture Overview

- **Frontend**: Next.js 16 (App Router, React 19, TypeScript Strict Mode, Tailwind CSS, TanStack React Query v5).
- **Backend API**: Python FastAPI (Async ASGI, Pydantic v2 schemas, automated OpenAPI documentation).
- **Primary Database**: PostgreSQL 16 (ACID transactions, relational foreign keys, row-level locks `SELECT ... FOR UPDATE`).
- **Task Queue & Locks**: Redis 7 + Celery worker pool (Distributed idempotency locks, payout auto-retries with exponential backoff).
- **Receipt Storage**: Cloudflare R2 (S3-compatible, zero egress fees, pre-signed upload/download URLs).
- **Authentication**: Native Self-Hosted JWT with rotating refresh tokens stored in DB (Argon2 password hashing, revocation/blacklisting support).
- **Multi-Tiered Approvals**: Configurable threshold (e.g. ₹25,000). Standard claims require single-tier Reviewer approval; claims $\ge$ threshold require secondary Finance approval before payout.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Permission / Action | ADMIN | FINANCE | REVIEWER | EMPLOYEE |
| :--- | :---: | :---: | :---: | :---: |
| **Submit & Edit Own Expenses** | ✅ | ✅ | ✅ | ✅ |
| **View Own Expenses** | ✅ | ✅ | ✅ | ✅ |
| **View All Company Expenses** | ✅ | ✅ | ✅ | ❌ |
| **Tier-1 Approval (Claims < Threshold)** | ✅ | ❌ | ✅ | ❌ |
| **Tier-2 Approval (Claims $\ge$ Threshold)** | ✅ | ✅ | ❌ | ❌ |
| **Request Changes / Reject** | ✅ | ✅ (Tier 2) | ✅ (Tier 1) | ❌ |
| **Disburse Reimbursements** | ✅ | ✅ | ❌ | ❌ |
| **Retry Failed Payouts** | ✅ | ✅ | ❌ | ❌ |
| **User & Role Management** | ✅ | ❌ | ❌ | ❌ |
| **Configure System Settings & Thresholds** | ✅ | ❌ | ❌ | ❌ |
| **View Immutable Audit Logs** | ✅ | ✅ | ❌ | ❌ |

---

## 3. Quick Start & Local Development

### Option A: Full-Stack Docker Compose (Recommended)

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Start the entire system:
   ```bash
   docker compose up --build
   ```
   - **Frontend**: [http://localhost:3000](http://localhost:3000)
   - **Backend API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **PostgreSQL**: `localhost:5432`
   - **Redis**: `localhost:6379`

### Option B: Local Host Development

#### 1. Backend:
```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 2. Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## 4. Testing & Verification

- **Backend Pytest Suite** (unit & integration tests covering state machine, duplicate detector, idempotency locks, full API lifecycle):
  ```bash
  PYTHONPATH=backend pytest backend/tests -v
  ```
- **Frontend Typecheck & Build**:
  ```bash
  cd frontend
  npx tsc --noEmit
  npm run build
  ```
- **API TypeScript Generation**:
  ```bash
  npm run codegen:api
  ```
