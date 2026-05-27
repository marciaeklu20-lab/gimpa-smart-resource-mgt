// src/firebaseConfig.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";



// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyClbUffHpArzKIDlrW9W3VGFvg790NANqI",
  authDomain: "gimpa-resource-mgt.firebaseapp.com",
  projectId: "gimpa-resource-mgt",
  storageBucket: "gimpa-resource-mgt.firebasestorage.app",
  messagingSenderId: "901955286987",
  appId: "1:901955286987:web:ded9877de08269abcc684e",
};

// Initialize Firebase app only once
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

// Firebase services
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };