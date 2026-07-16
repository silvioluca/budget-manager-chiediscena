/* ═══════════════════════════════════════════════════════
   DB.JS — Firebase init + data layer Firestore
   ═══════════════════════════════════════════════════════ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  GoogleAuthProvider, signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch,
  query, limit
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Cache locale persistente: letture istantanee da IndexedDB,
// sincronizzazione col server in background.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
});

// Attende lo stato auth; se non loggato → login.html
export function requireAuth() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      if (!user) { window.location.replace('login.html'); return; }
      resolve(user);
    });
  });
}

export async function fsLoad(coll) {
  const snap = await getDocs(collection(db, coll));
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}

export async function fsAdd(coll, data) {
  const ref = await addDoc(collection(db, coll), data);
  return ref.id;
}

export function fsUpdate(coll, id, data) {
  return updateDoc(doc(db, coll, id), data);
}

export function fsDelete(coll, id) {
  return deleteDoc(doc(db, coll, id));
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

// L'autorizzazione vera sta nelle regole Firestore (lista email).
// Qui solo un test di lettura per dare feedback subito dopo il login:
// permission-denied ⇒ account non in whitelist.
export async function checkAccess() {
  try {
    await getDocs(query(collection(db, 'corsi'), limit(1)));
    return true;
  } catch (e) {
    return e.code !== 'permission-denied';
  }
}

export { signInWithEmailAndPassword, signOut, writeBatch, collection, doc, getDocs };
