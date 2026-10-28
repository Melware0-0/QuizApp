// Connects the quiz app to Firebase (Google sign-in + Firestore database).
// This config is meant to be public. Your data is protected by the Firestore security rules
// (see firestore.rules), which only let each signed-in user read and write their own quizzes.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, collection, doc, setDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyClZOoqV1eYJ5UBWZp9IuveiVyZMu1BIDM",
  authDomain: "quizapp-be389.firebaseapp.com",
  projectId: "quizapp-be389",
  storageBucket: "quizapp-be389.firebasestorage.app",
  messagingSenderId: "968353778066",
  appId: "1:968353778066:web:64ef49763cfb0bb5b0994b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
getRedirectResult(auth).catch(err => console.error('Redirect sign-in failed', err));

const quizzesOf = uid => collection(db, 'users', uid, 'quizzes');

window.Cloud = {
  onAuth(cb){
    return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, name: u.displayName || u.email || 'you', email: u.email } : null));
  },
  async signIn(){
    try { await signInWithPopup(auth, provider); }
    catch(e){
      if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') return signInWithRedirect(auth, provider);
      throw e;
    }
  },
  signOut: () => signOut(auth),
  // Live updates: calls onDocs with every quiz document whenever anything changes on any device.
  subscribe(uid, onDocs, onError){
    return onSnapshot(quizzesOf(uid), snap => onDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))), onError);
  },
  put: (uid, id, data) => setDoc(doc(quizzesOf(uid), id), data)
};

window.dispatchEvent(new Event('cloud-ready'));
