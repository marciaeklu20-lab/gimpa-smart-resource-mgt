
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyClbUffHpArzKIDlrW9W3VGFvg790NANqI",
  authDomain: "gimpa-resource-mgt.firebaseapp.com",
  projectId: "gimpa-resource-mgt",
  storageBucket: "gimpa-resource-mgt.firebasestorage.app",
  messagingSenderId: "901955286987",
  appId: "1:901955286987:web:ded9877de08269abcc684e",
  measurementId: "G-7WPVB8TY5C"
};

// Prevent duplicate Firebase initialization (fixes Next.js Fast Refresh issue)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Analytics safely (only in browser)
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      getAnalytics(app);
      console.log("Firebase Analytics initialized successfully");
    } else {
      console.log("Analytics not supported in this environment");
    }
  });
}

export default app;