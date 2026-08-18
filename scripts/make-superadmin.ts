import * as admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'amrita-crs'
  });
}

const db = admin.firestore();
const auth = admin.auth();

async function makeSuperAdmin(email: string) {
  try {
    const userRecord = await auth.getUserByEmail(email);
    console.log(`Found user: ${userRecord.uid}`);

    // Update global users collection document
    await db.collection('users').doc(userRecord.uid).set(
      {
        email: userRecord.email,
        isSuperAdmin: true,
        updatedAt: admin.firestore.Timestamp.now()
      },
      { merge: true }
    );

    console.log(`Successfully promoted ${email} to Super Admin.`);
  } catch (error) {
    console.error(`Error promoting user:`, error);
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx ts-node scripts/make-superadmin.ts <email>');
  process.exit(1);
}

makeSuperAdmin(email).then(() => process.exit(0));
