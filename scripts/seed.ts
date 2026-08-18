import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

if (!getApps().length) {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'amrita-crs'
  });
}

const auth = getAuth();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

interface DemoUser {
  uid: string;
  email: string;
  displayName: string;
  password: string;
  orgs: { orgId: string; role: 'ADMIN' | 'FINANCE' | 'REVIEWER' | 'MEMBER' }[];
}

const DEMO_USERS: DemoUser[] = [
  // Organisation A (Acme Corp)
  {
    uid: 'user-admin-acme',
    email: 'admin@acmecorp.com',
    displayName: 'Akshai Pillai (Admin)',
    password: 'password123',
    orgs: [{ orgId: 'org-acme-corp', role: 'ADMIN' }]
  },
  {
    uid: 'user-finance-acme',
    email: 'finance@acmecorp.com',
    displayName: 'Sophia Chen (Finance)',
    password: 'password123',
    orgs: [{ orgId: 'org-acme-corp', role: 'FINANCE' }]
  },
  {
    uid: 'user-reviewer-acme',
    email: 'reviewer@acmecorp.com',
    displayName: 'Marcus Vance (Reviewer)',
    password: 'password123',
    orgs: [{ orgId: 'org-acme-corp', role: 'REVIEWER' }]
  },
  {
    uid: 'user-member-acme',
    email: 'member@acmecorp.com',
    displayName: 'David Miller (Engineer)',
    password: 'password123',
    orgs: [{ orgId: 'org-acme-corp', role: 'MEMBER' }]
  },

  // Organisation B (Globex Inc - Tenant Isolation demonstration)
  {
    uid: 'user-admin-globex',
    email: 'admin@globex.com',
    displayName: 'Elena Rostova (Globex Admin)',
    password: 'password123',
    orgs: [{ orgId: 'org-globex-inc', role: 'ADMIN' }]
  },
  {
    uid: 'user-member-globex',
    email: 'member@globex.com',
    displayName: 'Jordan Lee (Globex Member)',
    password: 'password123',
    orgs: [{ orgId: 'org-globex-inc', role: 'MEMBER' }]
  }
];

const ORGANISATIONS = [
  {
    id: 'org-acme-corp',
    name: 'Acme Corporation',
    currency: 'USD',
    createdBy: 'user-admin-acme',
    settings: {
      duplicateWindowDays: 30,
      mockRefundOutcome: 'SUCCESS'
    }
  },
  {
    id: 'org-globex-inc',
    name: 'Globex Industries Inc.',
    currency: 'EUR',
    createdBy: 'user-admin-globex',
    settings: {
      duplicateWindowDays: 30,
      mockRefundOutcome: 'SUCCESS'
    }
  }
];

export async function seedDatabase() {
  console.log('🌱 [Seed] Starting database seed for CRS...');

  // 1. Create Auth Users and Firestore User Docs
  for (const user of DEMO_USERS) {
    try {
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        password: user.password
      });
      console.log(`✓ Auth user created: ${user.email}`);
    } catch (err: any) {
      console.log(`ℹ Auth user already exists or error: ${user.email}`, err.message || err);
    }

    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      organisations: user.orgs.map((o) => o.orgId),
      updatedAt: Timestamp.now()
    });
  }

  // 2. Create Organisations & Members
  for (const org of ORGANISATIONS) {
    const orgRef = db.collection('organisations').doc(org.id);
    await orgRef.set({
      id: org.id,
      name: org.name,
      currency: org.currency,
      createdBy: org.createdBy,
      settings: org.settings,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    console.log(`✓ Organisation created: ${org.name} (${org.id})`);

    // Assign members
    const orgMembers = DEMO_USERS.filter((u) => u.orgs.some((o) => o.orgId === org.id));
    for (const member of orgMembers) {
      const memberRole = member.orgs.find((o) => o.orgId === org.id)!.role;
      await orgRef.collection('members').doc(member.uid).set({
        id: member.uid,
        organisationId: org.id,
        email: member.email,
        displayName: member.displayName,
        role: memberRole,
        joinedAt: Timestamp.now()
      });
    }
  }

  // 3. Create Sample Expenses in ALL 8+ States for Acme Corp
  const now = Timestamp.now();
  const sampleExpenses = [
    {
      id: 'EXP-1001-DRAFT',
      organisationId: 'org-acme-corp',
      submittedBy: 'user-member-acme',
      submitterEmail: 'member@acmecorp.com',
      submitterName: 'David Miller',
      amount: 4500, // $45.00
      currency: 'USD',
      category: 'Meals & Entertainment',
      merchant: 'Starbucks Coffee',
      expenseDate: '2026-08-16',
      description: 'Client coffee and onboarding breakfast meeting.',
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'EXP-1002-SUBMITTED',
      organisationId: 'org-acme-corp',
      submittedBy: 'user-member-acme',
      submitterEmail: 'member@acmecorp.com',
      submitterName: 'David Miller',
      amount: 14200, // $142.00
      currency: 'USD',
      category: 'Travel & Lodging',
      merchant: 'Uber Technologies Inc',
      expenseDate: '2026-08-15',
      description: 'Rideshare from airport to client HQ.',
      status: 'SUBMITTED',
      receipt: {
        id: 'rec-1002',
        organisationId: 'org-acme-corp',
        expenseId: 'EXP-1002-SUBMITTED',
        storageProvider: 'cloudinary',
        storageKey: 'receipts/org-acme-corp/EXP-1002-SUBMITTED/rec-1002.pdf',
        fileName: 'uber-receipt-aug15.pdf',
        contentType: 'application/pdf',
        fileSize: 45200,
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        uploadedBy: 'user-member-acme',
        createdAt: now
      },
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'EXP-1003-UNDER-REVIEW',
      organisationId: 'org-acme-corp',
      submittedBy: 'user-member-acme',
      submitterEmail: 'member@acmecorp.com',
      submitterName: 'David Miller',
      amount: 89000, // $890.00
      currency: 'USD',
      category: 'Software & Subscriptions',
      merchant: 'Amazon Web Services (AWS)',
      expenseDate: '2026-08-14',
      description: 'Monthly staging environment cloud compute and database clusters.',
      status: 'UNDER_REVIEW',
      receipt: {
        id: 'rec-1003',
        organisationId: 'org-acme-corp',
        expenseId: 'EXP-1003-UNDER-REVIEW',
        storageProvider: 'cloudinary',
        storageKey: 'receipts/org-acme-corp/EXP-1003-UNDER-REVIEW/rec-1003.pdf',
        fileName: 'aws-invoice-inv39482.pdf',
        contentType: 'application/pdf',
        fileSize: 128400,
        checksum: 'fa820a1098fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        uploadedBy: 'user-member-acme',
        createdAt: now
      },
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'EXP-1004-CHANGES-REQUESTED',
      organisationId: 'org-acme-corp',
      submittedBy: 'user-member-acme',
      submitterEmail: 'member@acmecorp.com',
      submitterName: 'David Miller',
      amount: 32000, // $320.00
      currency: 'USD',
      category: 'Office Supplies',
      merchant: 'Apple Store NYC',
      expenseDate: '2026-08-10',
      description: 'Magic Keyboard and USB-C display hub for workstation.',
      status: 'CHANGES_REQUESTED',
      changeRequestReason: 'Please attach the itemized tax invoice showing serial numbers.',
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'EXP-1005-APPROVED',
      organisationId: 'org-acme-corp',
      submittedBy: 'user-member-acme',
      submitterEmail: 'member@acmecorp.com',
      submitterName: 'David Miller',
      amount: 45000, // $450.00
      currency: 'USD',
      category: 'Travel & Lodging',
      merchant: 'Hilton Hotels & Resorts',
      expenseDate: '2026-08-08',
      description: 'Lodging during Q3 Quarterly Engineering Summit.',
      status: 'APPROVED',
      approvedBy: 'user-reviewer-acme',
      approvedAt: now,
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'EXP-1006-REFUND-PENDING',
      organisationId: 'org-acme-corp',
      submittedBy: 'user-member-acme',
      submitterEmail: 'member@acmecorp.com',
      submitterName: 'David Miller',
      amount: 6200, // $62.00
      currency: 'USD',
      category: 'Telecom & Internet',
      merchant: 'Verizon Wireless',
      expenseDate: '2026-08-05',
      description: 'Business roaming and international data pass.',
      status: 'REFUND_PENDING',
      reimbursementId: 'reimb-exp-1006',
      approvedBy: 'user-reviewer-acme',
      approvedAt: now,
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'EXP-1007-REFUNDED',
      organisationId: 'org-acme-corp',
      submittedBy: 'user-member-acme',
      submitterEmail: 'member@acmecorp.com',
      submitterName: 'David Miller',
      amount: 18500, // $185.00
      currency: 'USD',
      category: 'Training & Certifications',
      merchant: 'Coursera Enterprise',
      expenseDate: '2026-07-28',
      description: 'Cloud Architecture Specialization certification voucher.',
      status: 'REFUNDED',
      reimbursementId: 'reimb-exp-1007',
      approvedBy: 'user-reviewer-acme',
      approvedAt: now,
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'EXP-1008-REFUND-FAILED',
      organisationId: 'org-acme-corp',
      submittedBy: 'user-member-acme',
      submitterEmail: 'member@acmecorp.com',
      submitterName: 'David Miller',
      amount: 27500, // $275.00
      currency: 'USD',
      category: 'Travel & Lodging',
      merchant: 'Delta Air Lines',
      expenseDate: '2026-07-20',
      description: 'Regional flight for emergency on-site customer outage.',
      status: 'REFUND_FAILED',
      reimbursementId: 'reimb-exp-1008',
      approvedBy: 'user-reviewer-acme',
      approvedAt: now,
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'EXP-1009-REJECTED',
      organisationId: 'org-acme-corp',
      submittedBy: 'user-member-acme',
      submitterEmail: 'member@acmecorp.com',
      submitterName: 'David Miller',
      amount: 9800, // $98.00
      currency: 'USD',
      category: 'Other',
      merchant: 'Gadgets & Games Hub',
      expenseDate: '2026-07-15',
      description: 'Noise canceling headphones (Non-approved vendor).',
      status: 'REJECTED',
      rejectionReason: 'Personal electronic accessories must be ordered through IT Procurement.',
      rejectedBy: 'user-reviewer-acme',
      rejectedAt: now,
      submittedAt: now,
      createdAt: now,
      updatedAt: now
    }
  ];

  for (const exp of sampleExpenses) {
    const expRef = db.collection('organisations').doc('org-acme-corp').collection('expenses').doc(exp.id);
    await expRef.set(exp);

    // If approved or rejected, create approval record
    if (exp.status === 'APPROVED' || exp.status === 'REFUND_PENDING' || exp.status === 'REFUNDED' || exp.status === 'REFUND_FAILED') {
      await expRef.collection('approvals').doc(`app-${exp.id}`).set({
        id: `app-${exp.id}`,
        organisationId: 'org-acme-corp',
        expenseId: exp.id,
        decision: 'APPROVED',
        reviewerId: 'user-reviewer-acme',
        reviewerEmail: 'reviewer@acmecorp.com',
        reason: 'Approved per corporate travel and expenses standard',
        timestamp: now
      });
    }

    // If reimbursement exists, create reimbursement document
    if (exp.reimbursementId) {
      const isFailed = exp.status === 'REFUND_FAILED';
      const isCompleted = exp.status === 'REFUNDED';
      const reimbRef = db.collection('organisations').doc('org-acme-corp').collection('reimbursements').doc(exp.reimbursementId);

      await reimbRef.set({
        id: exp.reimbursementId,
        organisationId: 'org-acme-corp',
        expenseId: exp.id,
        submittedBy: exp.submittedBy,
        amount: exp.amount,
        currency: exp.currency,
        status: isCompleted ? 'COMPLETED' : isFailed ? 'FAILED' : 'PENDING',
        provider: 'mock-refund-provider',
        providerReference: isCompleted ? 'MOCK_TXN_SETTLED_8819' : undefined,
        failureReason: isFailed ? 'Bank account routing code invalid (ERR_PAYMENT_REJECTED)' : undefined,
        attemptCount: isCompleted ? 1 : isFailed ? 3 : 0,
        maxAttempts: 3,
        createdAt: now,
        updatedAt: now,
        completedAt: isCompleted ? now : undefined,
        failedAt: isFailed ? now : undefined
      });
    }

    // Create Audit Log entry for the expense
    await db.collection('organisations').doc('org-acme-corp').collection('auditLogs').doc(`audit-${exp.id}`).set({
      id: `audit-${exp.id}`,
      organisationId: 'org-acme-corp',
      actorId: exp.submittedBy,
      actorEmail: exp.submitterEmail,
      action: 'EXPENSE_CREATED',
      entityType: 'EXPENSE',
      entityId: exp.id,
      after: { amount: exp.amount, currency: exp.currency, status: exp.status },
      timestamp: now,
      requestId: `req-${exp.id}`
    });
  }

  // 4. Create sample expense in Organisation B (Globex Inc) for tenant testing
  const globexExpense = {
    id: 'EXP-GLOBEX-2001',
    organisationId: 'org-globex-inc',
    submittedBy: 'user-member-globex',
    submitterEmail: 'member@globex.com',
    submitterName: 'Jordan Lee',
    amount: 12500, // €125.00
    currency: 'EUR',
    category: 'Travel & Lodging',
    merchant: 'Lufthansa Airline Berlin',
    expenseDate: '2026-08-12',
    description: 'European flight for customer partnership meetup.',
    status: 'SUBMITTED',
    createdAt: now,
    updatedAt: now
  };
  await db.collection('organisations').doc('org-globex-inc').collection('expenses').doc(globexExpense.id).set(globexExpense);

  console.log('✅ [Seed] Finished database seeding successfully!');
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seed error:', err);
      process.exit(1);
    });
}
