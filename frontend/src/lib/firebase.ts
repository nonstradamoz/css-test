import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-crs-api-key',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'demo-crs-project.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'demo-crs-project',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'demo-crs-project.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:123456789012:web:abcdef123456'
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Connect to emulators if running in dev mode
if (typeof window !== 'undefined') {
  const useEmulator =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (useEmulator && !(window as any)._firebaseEmulatorsConnected) {
    try {
      const hostname = window.location.hostname;
      connectAuthEmulator(auth, `http://${hostname}:9099`, { disableWarnings: true });
      connectFirestoreEmulator(db, hostname, 8080);
      connectFunctionsEmulator(functions, hostname, 5001);
      (window as any)._firebaseEmulatorsConnected = true;
      console.log('[Firebase] Connected to local emulators');
    } catch {
      // Ignored if already connected in HMR
    }
  }
}

export { app, auth, db, functions };
