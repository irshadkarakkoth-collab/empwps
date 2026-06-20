import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyD2cHjy5-MQuD85S_FegWA0PNG3aXdBJxs",
  authDomain: "empwppconvert.firebaseapp.com",
  projectId: "empwppconvert",
  storageBucket: "wppempconvert-5d5ca.firebasestorage.app",
  messagingSenderId: "799152841324",
  appId: "1:799152841324:web:de016d8b6e83925a60ee49"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * Log in with email + password using Firebase Authentication.
 * Returns { status: 'ok' } or { status: 'invalid', message }.
 * No passwords ever touch Firestore directly -- Firebase Auth
 * handles verification on Google's servers.
 */
window._firebaseLogin = async function (email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { status: "ok", user: { uid: cred.user.uid, email: cred.user.email } };
  } catch (err) {
    // Firebase returns codes like auth/wrong-password, auth/user-not-found,
    // auth/too-many-requests (it has built-in throttling after repeated fails)
    let message = "Invalid email or password.";
    if (err.code === "auth/too-many-requests") {
      message = "Too many failed attempts. Please wait a few minutes and try again.";
    } else if (err.code === "auth/invalid-email") {
      message = "Please enter a valid email address.";
    }
    return { status: "invalid", message, code: err.code };
  }
};

/** Log the current user out. */
window._firebaseLogout = async function () {
  await signOut(auth);
};

/**
 * Keep the app in sync with login state (e.g. on page refresh).
 * Call this once when the page loads; pass a callback that receives
 * the Firebase user object (or null if logged out).
 */
window._firebaseOnAuthChange = function (callback) {
  onAuthStateChanged(auth, (user) => callback(user));
};
