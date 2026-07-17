/* ═══════════════════════════════════════════════════════
   DB.JS — Firebase init + data layer Firestore
   ═══════════════════════════════════════════════════════ */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch,
  query, limit
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js?v=9';

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

// Inserimento multiplo in batch (max 500 op/batch Firestore, usiamo 400)
export async function fsAddMany(coll, datas) {
  const ids = [];
  const CHUNK = 400;
  for (let i = 0; i < datas.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const d of datas.slice(i, i + CHUNK)) {
      const ref = doc(collection(db, coll));
      batch.set(ref, d);
      ids.push(ref.id);
    }
    await batch.commit();
  }
  return ids;
}

// Popup dove possibile; se l'ambiente non lo supporta
// (browser embedded, popup bloccati) ripiega sul redirect.
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  } catch (e) {
    const fallback = [
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported',
      'auth/internal-error',
    ].includes(e.code);
    if (!fallback) throw e;
    await signInWithRedirect(auth, provider); // naviga via, la pagina si ricarica dopo il login
  }
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

export { signInWithEmailAndPassword, signOut };
