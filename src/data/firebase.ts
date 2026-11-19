// Connects the browser to Firestore: the local emulator during development
// (npm run dev), the real project in the deployed site.

import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { firebaseConfig } from '../firebase-config';

export const USE_EMULATOR = import.meta.env.DEV;
export const NOT_CONFIGURED = !USE_EMULATOR && firebaseConfig.projectId.startsWith('demo-');

// During development everything runs against the offline demo project, so the
// emulator never mixes with (or reaches) the real one.
export const app = initializeApp(USE_EMULATOR ? { ...firebaseConfig, projectId: 'demo-econ-live' } : firebaseConfig);

// iPhones and iPads: Safari is known to stall the streaming connection that Firestore
// normally uses, so that updates arrive late or one step behind. Long polling is a
// little slower per update but does not stall.
const IOS = typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1));

// Memory cache only: nothing about the session is written to the phone's disk by
// Firebase. (Our own small identity record in localStorage is separate.)
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  ...(IOS && !USE_EMULATOR ? { experimentalForceLongPolling: true } : {}),
});

// location.hostname rather than "localhost", so a phone on the same Wi-Fi that
// opens http://<laptop-ip>:5173 reaches the emulator on the laptop too.
if (USE_EMULATOR) connectFirestoreEmulator(db, location.hostname, 8080);
