# ClearSpend — Enterprise Expense & Refund Management Platform
## Comprehensive Technical Project Report & Operational Documentation

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Async%20REST%20API-009688.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7%20Idempotency%20%7C%20Locks-DC382D.svg)](https://redis.io/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20App%20Router-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Cloudflare R2](https://img.shields.io/badge/Storage-Cloudflare%20R2-F38020.svg)](https://developers.cloudflare.com/r2/)
[![Tesseract OCR](https://img.shields.io/badge/OCR-Tesseract%205.5-blueviolet.svg)](https://github.com/tesseract-ocr/tesseract)

---

## 1. Executive Summary

**ClearSpend** is a production-grade, single-tenant corporate expense tracking, forensic compliance audit, and reimbursement settlement platform.

Traditional corporate reimbursement processes suffer from fragmented email approval chains, delayed payouts, fraudulent expense claims (threshold smurfing, recycled bills, cross-employee duplicate submissions, unapproved weekend expenditures), and lack of visibility into disbursement tracking. ClearSpend resolves these operational bottlenecks through a deterministic state machine, real-time forensic inspection, an in-house multimodal receipt extractor (zero external cloud API costs), and an idempotent financial settlement pipeline.

### Core Objectives
1. **Automated Receipt Extraction**: High-speed OCR and heuristic financial parsing extracting merchants, totals, line items, taxes, transaction IDs (UPI / UTR / RRN), contact numbers, and payment instruments without third-party vendor lock-in.
2. **AI Forensic Auditing**: Real-time multi-vector compliance scoring (0–100) detecting smurfing threshold evasion, cross-employee collusion, restricted goods (alcohol, tobacco, spa), and weekend expense anomalies.
3. **Deterministic Multi-Tier State Machine**: Automatic single-tier (< threshold) vs. two-tier ($\ge$ threshold) approval escalation with mandatory audit justification for high-risk claims.
4. **Disbursement Safety & Bank Profile Guard**: Prevents premature claim submission or payout locks unless employee banking or UPI details are verified, recording financial transaction IDs upon settlement.
5. **Zero-Egress Object Storage**: Cloudflare R2 integration for receipt storage with pre-signed direct browser uploads and cascading file deletion.
6. **Enterprise Authentication**: Self-hosted Argon2-hashed JWT with database-backed rotating refresh tokens combined with authentic Google OAuth 2.0 Sign-In.

---

## 2. System Architecture & Tech Stack

```mermaid
flowchart TD
    subgraph Clients["Clients & Devices"]
        Desktop["Desktop Browser"]
        Mobile["Mobile / Tablet Browser"]
    end

    subgraph Frontend["Frontend Layer (Next.js 16)"]
        AppRouter["Next.js App Router (17 Routes)"]
        AuthContext["AuthProvider (JWT + Google OAuth)"]
        QueryClient["TanStack React Query v5"]
        UI["Tailwind CSS + Lucide Icons"]
    end

    subgraph Backend["API Layer (FastAPI)"]
        API["FastAPI Async REST API"]
        Deps["Auth & RBAC Middleware"]
        Extractor["In-House OCR & Financial Parser"]
        Forensics["Forensics Compliance Engine"]
        StateMachine["Expense State Machine"]
    end

    subgraph Data["Persistence & Queue Layer"]
        Postgres[(PostgreSQL 16\nACID Relational Storage)]
        Redis[(Redis 7\nIdempotency & Locks)]
        R2[(Cloudflare R2\nS3-Compatible Object Storage)]
    end

    subgraph External["External Integrations"]
        GoogleAuth["Google Identity Services (OAuth 2.0)"]
    end

    Desktop --> AppRouter
    Mobile --> AppRouter
    AppRouter --> AuthContext
    AppRouter --> QueryClient
    AuthContext <--> GoogleAuth
    QueryClient <--> API
    API --> Deps
    Deps --> StateMachine
    Deps --> Forensics
    Deps --> Extractor
    API <--> Postgres
    API <--> Redis
    API <--> R2
```

### Technology Matrix

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | Next.js (React 19) | 16.4.6 | Server-rendered & client-optimized App Router SPA |
| **State & Data Fetching** | TanStack React Query | 5.62.0 | Cache synchronization, background polling, mutations |
| **Styling & Design** | Tailwind CSS | 3.4.1 | Responsive dark theme with emerald accents |
| **Icons** | Lucide React | 0.468.0 | Lightweight vector icons |
| **Backend Framework** | FastAPI | 0.164.0 | Asynchronous ASGI RESTful API with automated Swagger |
| **Validation** | Pydantic v2 | 2.14.3 | Strict request/response validation & serialization |
| **ORM & Database Driver** | SQLAlchemy + asyncpg | 2.1.9 / 0.32.0 | Async PostgreSQL querying with row-level locks |
| **Primary Database** | PostgreSQL | 16.x | ACID transactional storage with foreign key constraints |
| **Cache & Locks** | Redis | 7.x | Distributed locks, rate limiting, token blacklisting |
| **Receipt Storage** | Cloudflare R2 / S3 | boto3 1.44.5 | Pre-signed upload/download URLs, zero egress fees |
| **Local OCR Engine** | Tesseract OCR | 5.5.4 | Optical Character Recognition for receipts and invoices |
| **PDF Processing** | pypdf + Pillow | 7.1.1 / 13.0.0 | Digital text extraction & image contrast enhancement |
| **Export Engine** | openpyxl | 3.1.5 | Formatted `.xlsx` generation with active hyperlinks |
| **Authentication** | Argon2 + python-jose | 25.1.0 / 3.5.0 | Secure password hashing & signed JWT tokens |

---

## 3. Key Functional Modules

### 3.1 In-House OCR & Financial Extraction Engine
Built directly into the backend (`backend/app/services/extractor/`):
- **Zero API Dependency**: Eliminates external cloud billing; operates offline using `pypdf` for digital PDFs and `Pillow` + `pytesseract` for scanned images.
- **Accounting Field Extraction**:
  - Merchant / Establishment Name (category-aware heuristic filtering).
  - Claim Amount & Currency detection (supports INR ₹, USD $, EUR €).
  - Expense Date normalization (handles DD/MM/YYYY, YYYY-MM-DD, Month DD YYYY).
  - Tax & GSTIN Identification (15-character statutory GSTIN syntax matching).
  - Line Items parsing with prohibited compliance checks.
  - **Transaction ID / UPI Ref / Bank UTR / RRN** (extracts 12-digit numeric sequences, Google Pay, PhonePe, Paytm, and POS approval codes).
  - **Mode of Payment** (UPI, Credit Card, Debit Card, Cash, Net Banking).
  - **Mobile / Contact Number** (Indian 10-digit mobile `[6-9]\d{9}` and labeled phone numbers).
- **Auto-Fill Integration**: One-click form population in the submission UI for all authenticated users.

### 3.2 AI Forensics & Compliance Inspector
Every uploaded receipt and claim is evaluated by the `ForensicsEngine` across multiple risk vectors:
- **Risk Score (0–100)**: Categorized as `LOW`, `MEDIUM`, or `HIGH`.
- **Threshold Smurfing Evasion**: Detects multiple submissions within a 48-hour window deliberately kept just under the corporate approval threshold (e.g. ₹24,999 vs ₹25,000).
- **Cross-Employee Collusion**: Prohibits identical receipt hashes or identical transaction IDs uploaded by different employees.
- **Prohibited Items Detection**: Scans extracted line items for alcohol, tobacco, liquor, spa, and gift card expenditures.
- **Weekend Anomalies**: Flags expenses incurred on Saturdays or Sundays for corporate review.
- **Mandatory Audit Exemption**: Reviewers cannot approve a `HIGH` risk claim without entering an explicit compliance justification stored permanently in the audit trail.

### 3.3 Mandatory Category-Specific Details
Enforces statutory corporate compliance rules depending on the chosen category:
1. **Hotel & Lodging (`ACCOMMODATION`)**:
   - Hotel Name
   - Hotel Location / Address
   - Check-in Date & Time
   - Check-out Date & Time
   - Hotel Contact Number (auto-populated if extracted from receipt)
2. **Training & Certifications (`TRAINING`)**:
   - Certification Name
   - Platform / Institute
   - Enrollment Date
   - Certification Type (Professional Course, Technical Training, Executive Education, etc.)
3. **Travel & Commute (`TRAVEL`)**:
   - Mode of Travel (Flight, Train, Bus, Cab, etc.)
   - Start Date & End Date
   - Boarding Point & Arrival Point

### 3.4 Financial State Machine Lifecycle
```mermaid
stateDiagram-v2
    [*] --> DRAFT : User Creates Claim
    DRAFT --> DRAFT : Edit / Save Draft
    DRAFT --> SUBMITTED : User Submits (Bank Details Validated)
    
    state "Under Tier-1 Review" as T1
    SUBMITTED --> T1
    
    T1 --> CHANGES_REQUESTED : Reviewer Requests Info
    CHANGES_REQUESTED --> SUBMITTED : Employee Resubmits
    
    T1 --> REJECTED : Reviewer Rejects
    
    state if_threshold <<choice>>
    T1 --> if_threshold : Reviewer Approves
    
    if_threshold --> APPROVED : Amount < Threshold (Single-Tier)
    if_threshold --> UNDER_REVIEW : Amount >= Threshold (Multi-Tier)
    
    state "Under Tier-2 Finance Review" as T2
    UNDER_REVIEW --> T2
    T2 --> APPROVED : Finance Approves
    T2 --> CHANGES_REQUESTED : Finance Requests Info
    T2 --> REJECTED : Finance Rejects
    
    APPROVED --> REIMBURSED : Disbursed with Txn ID & Idempotency Lock
    REIMBURSED --> [*]
    REJECTED --> [*]
```

### 3.5 Disbursement Protection & Bank Verification
- **Submission Guard**: Submitting a claim is strictly gated on the user having configured valid bank details (Account Number + IFSC or UPI ID) in their profile. If missing, the claim is safely preserved as a private `DRAFT`.
- **Payout Settlement**: Payouts require entering the actual financial bank transfer reference (`transfer_txn_id` e.g., IMPS UTR or UPI Ref ID).
- **Idempotency Locks**: Redis atomic locking on claim IDs prevents duplicate bank disbursements during network retries.

### 3.6 File Lifecycle & Cascading Deletion
- Receipts uploaded to Cloudflare R2 are automatically tracked with their storage keys.
- When an expense is deleted (by its submitter prior to approval, or by an Admin override), the associated file in the storage bucket is automatically deleted, preventing orphaned storage accumulation.

---

## 4. Environment Variables Catalog

ClearSpend uses a unified configuration setup. The platform reads from `.env` in the root and respective `.env` files in `backend/` and `frontend/`.

### 4.1 Backend Environment Variables (`backend/.env`)

| Variable Name | Type | Default Value | Description |
| :--- | :---: | :--- | :--- |
| `PROJECT_NAME` | string | `ClearSpend Expense Management` | Human-readable application title |
| `API_V1_STR` | string | `/api/v1` | URL prefix for REST endpoints |
| `DATABASE_URL` | string | `postgresql+asyncpg://postgres:postgres@localhost:5432/crs_db` | Async PostgreSQL connection string |
| `REDIS_URL` | string | `redis://localhost:6379/0` | Redis connection URI for locks and Celery |
| `JWT_SECRET_KEY` | string | *(Required)* | 32+ character cryptographic secret for signing JWTs |
| `JWT_ALGORITHM` | string | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES`| int | `15` | Expiry duration for access tokens |
| `REFRESH_TOKEN_EXPIRE_DAYS` | int | `7` | Expiry duration for rotating database refresh tokens |
| `R2_ACCOUNT_ID` | string | *(Optional)* | Cloudflare Account ID for R2 storage |
| `R2_ACCESS_KEY_ID` | string | *(Optional)* | S3-compatible Access Key ID |
| `R2_SECRET_ACCESS_KEY` | string | *(Optional)* | S3-compatible Secret Access Key |
| `R2_BUCKET_NAME` | string | `crs-receipts` | Cloudflare R2 bucket name |
| `R2_ENDPOINT_URL` | string | *(Optional)* | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_PUBLIC_DOMAIN` | string | *(Optional)* | Public access CDN domain for receipts (if configured) |
| `MOCK_REFUND_OUTCOME` | string | `SUCCESS` | Payout simulator response (`SUCCESS`, `FAILURE`, `TIMEOUT`) |
| `CORS_ORIGINS` | string | `http://localhost:3000` | Comma-separated list of allowed CORS origins |
| `GOOGLE_CLIENT_ID` | string | *(Optional)* | Google OAuth Web Client ID for authentication |
| `GOOGLE_CLIENT_SECRET` | string | *(Optional)* | Google OAuth Web Client Secret (for code exchange) |
| `USE_GEMINI_API` | bool | `false` | Enable cloud Gemini vision (`true`/`false`) |
| `GEMINI_API_KEY` | string | *(Optional)* | Gemini API key (only if `USE_GEMINI_API=true`) |

### 4.2 Frontend Environment Variables (`frontend/.env.local`)

| Variable Name | Type | Default Value | Description |
| :--- | :---: | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | string | `http://localhost:8000/api/v1` | URL pointing to the FastAPI backend API |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`| string | *(Optional)* | Google Client ID exposed to the browser client |

---

## 5. Step-by-Step Execution & Deployment Guide

### Prerequisites
- **Python**: 3.11 or 3.12
- **Node.js**: 18.x or 20.x (with `npm`)
- **PostgreSQL**: 16.x (running locally or via Docker)
- **Redis**: 7.x (running locally or via Docker)
- **Tesseract OCR**:
  - macOS: `brew install tesseract`
  - Ubuntu/Debian: `sudo apt-get install -y tesseract-ocr`
  - Windows: Install via UB-Mannheim installer and add to `PATH`

---

### Method A: Native Host Execution (Development Mode)

#### Step 1: Clone and Configure Environment
```bash
git clone https://github.com/nonstradamoz/css-test.git
cd css-test

# Copy environment template
cp .env.example .env
cp .env.example backend/.env
cp .env.example frontend/.env.local
```

#### Step 2: Start PostgreSQL & Redis
If you have Docker installed, start databases with one command:
```bash
docker run -d --name crs-postgres -p 5432:5432 -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=crs_db postgres:16-alpine
docker run -d --name crs-redis -p 6379:6379 redis:7-alpine
```

#### Step 3: Setup & Run FastAPI Backend
```bash
# Navigate to backend directory
cd backend

# Create and activate Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations / table creation & start server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The backend API is now live:
- API Base: `http://localhost:8000/api/v1`
- Interactive OpenAPI / Swagger Docs: `http://localhost:8000/docs`

#### Step 4: Setup & Run Next.js Frontend
Open a new terminal window:
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```
The web dashboard is now accessible at `http://localhost:3000`.

---

### Method B: Full-Stack Docker Compose (Production / Containerized)

1. Ensure `.env` is populated with secure keys.
2. Build and start all services:
   ```bash
   docker compose up --build -d
   ```
3. Check running containers:
   ```bash
   docker compose ps
   ```
4. Access services:
   - Web Portal: `http://localhost:3000`
   - API Docs: `http://localhost:8000/docs`

---

### Step 5: Verification & Running Automated Tests

#### Backend Test Suite (Pytest)
From the project root directory:
```bash
PYTHONPATH=backend backend/.venv/bin/pytest backend/tests -v
```
*Expected Result*: **44 passed** (covering custom extractor, duplicate detection, state machine, multi-tier escalation, forensics, bank guards, and Google OAuth).

#### Frontend Production Build
```bash
npm --prefix frontend run build
```
*Expected Result*: Compiles all **17 routes** with zero TypeScript or styling errors.

---

## 6. REST API Endpoints Catalog

### Authentication (`/api/v1/auth`)
- `POST /register`: Create a new corporate user account.
- `POST /login`: OAuth2 password credentials login (returns access & refresh tokens).
- `POST /refresh`: Rotate refresh token and issue a fresh access token.
- `POST /logout`: Revoke active refresh token.
- `GET /google/config`: Public endpoint returning the active Google Client ID.
- `GET /google/login`: Backend OAuth initiation redirecting to Google Consent screen.
- `GET /google/callback`: OAuth code receiver and token issuer.
- `POST /google`: Direct Google access token verification endpoint.

### Expense Claims (`/api/v1/expenses`)
- `GET /`: List expenses with filtering (status, category, search, sorting).
- `POST /`: Create a new claim (optional immediate submission with bank verification).
- `GET /{id}`: Retrieve detailed claim information, approvals trail, and reconciliation data.
- `PATCH /{id}`: Update editable claim fields.
- `DELETE /{id}`: Delete an expense claim (purges database record and associated R2 storage file).
- `POST /{id}/submit`: Transition a draft claim to `SUBMITTED`.
- `POST /forensics-preview`: Real-time compliance and risk evaluation during form entry.
- `GET /export`: Download full corporate expense report as formatted Excel (`.xlsx`).

### Approvals (`/api/v1/approvals`)
- `GET /pending`: List claims awaiting review (filtered by user tier privileges).
- `POST /{expense_id}/review`: Submit a review decision (`APPROVED`, `CHANGES_REQUESTED`, `REJECTED`).

### Reimbursements (`/api/v1/reimbursements`)
- `GET /`: List all reimbursement transactions.
- `POST /{expense_id}/disburse`: Execute idempotent payout recording transfer transaction ID.
- `POST /{reimbursement_id}/retry`: Retry a failed reimbursement payout.

### Receipts & OCR (`/api/v1/receipts`)
- `POST /analyze`: Run in-house OCR extractor on uploaded image or PDF.
- `POST /upload`: Direct multipart upload to storage.
- `POST /presigned-upload`: Generate secure pre-signed PUT URL for Cloudflare R2.

### User Management (`/api/v1/users`)
- `GET /me`: Retrieve profile details of authenticated user.
- `PATCH /me`: Update personal profile, password, or reimbursement bank details.
- `GET /`: Admin list of all company users.
- `POST /`: Admin user creation with specific role assignment.
- `PATCH /{id}`: Admin update of user status or role.

### Corporate Settings (`/api/v1/settings`)
- `GET /`: Retrieve global policy configurations and approval thresholds.
- `PATCH /`: Update policy parameters (pause submissions, date window, threshold limits).

### System Audit Logs (`/api/v1/audit-logs`)
- `GET /`: Immutable audit trail of all financial, state, and authentication operations.

---

## 7. Admin User Provisioning

To prevent insecure default credentials from being committed or automatically seeded, initial admin users are provisioned via CLI, direct database SQL queries, or initial self-registration.

### Method 1: CLI Provisioning (Recommended)
Run the dedicated admin creation utility:
```bash
# Interactive mode (prompts for email & secure password):
python backend/create_admin.py

# Non-interactive CLI flag mode:
python backend/create_admin.py --email admin@yourcompany.com --password YourStrongPassword123 --name "Lead Administrator"
```
*Note*: If the user already exists, running this command will safely elevate their role to `ADMIN` and update their password.

### Method 2: Direct Database SQL Query
ClearSpend secures passwords using **Argon2id**. To insert an admin user directly into PostgreSQL or SQLite:

1. Generate the Argon2 password hash:
```bash
python -c "from app.core.security import get_password_hash; print(get_password_hash('YourStrongPassword123'))"
```
2. Execute the SQL insertion query:
```sql
INSERT INTO users (id, email, hashed_password, full_name, role, is_active, created_at, updated_at)
VALUES (
    'usr_' || substr(md5(random()::text), 1, 16),
    'admin@yourcompany.com',
    '$argon2id$v=19$m=65536,t=3,p=4$...YOUR_GENERATED_HASH...',
    'System Administrator',
    'ADMIN',
    true,
    NOW(),
    NOW()
);
```

### Method 3: First User Auto-Promotion (UI / API)
When the database contains 0 registered users, registering the very first account via `/signup` or `POST /api/v1/auth/register` automatically promotes that account to the `ADMIN` role. Subsequent signups default to `EMPLOYEE`.

---

## 8. Security & Compliance Highlights

1. **Password Hashing**: Utilizes **Argon2id**, the winner of the Password Hashing Competition, with high memory and time cost factors.
2. **Token Security**: Dual-token pattern with short-lived JWTs (15 min) and hashed refresh tokens stored in PostgreSQL with immediate revocation upon logout.
3. **Database Integrity**: Financial disbursements use `SELECT ... FOR UPDATE` row-level locks alongside Redis distributed locks to eliminate race conditions.
4. **Data Privacy**: Drafts are strictly confidential to the creator; file storage links are signed with time-limited expirations.
5. **Cascading File Cleanup**: Deleting an expense completely wipes the underlying receipt asset from Cloudflare R2, preventing orphaned data accumulation.
