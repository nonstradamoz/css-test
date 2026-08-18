import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
initializeApp({ projectId: 'amrita-crs' });
getAuth().getUserByEmail('admin@acmecorp.com').then(u => console.log('Found:', u.uid)).catch(e => console.error(e));
