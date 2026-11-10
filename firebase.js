// ==========================================================
// NexaMatch — ponto único de acesso ao Firebase
// O SDK é carregado direto do CDN do Google (não precisa instalar nada).
// Para trocar a versão do SDK, mude só a constante abaixo.
// ==========================================================
import { firebaseConfig } from "./firebase-config.js";

export const SDK_VERSION = "13.2.0";
const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

// Enquanto o firebase-config.js tiver "COLE_AQUI", o app avisa em vez de quebrar
export const isConfigured = !Object.values(firebaseConfig).some(
    value => !value || String(value).startsWith("COLE_AQUI")
);

// carrega os três pedaços do SDK ao mesmo tempo
const [{ initializeApp }, authSdk, store] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`)
]);

export const app = isConfigured ? initializeApp(firebaseConfig) : null;
export const auth = app ? authSdk.getAuth(app) : null;
export const db = app ? store.getFirestore(app) : null;

// ----- Auth -----
export const {
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
    sendEmailVerification,
    deleteUser,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence
} = authSdk;

// ----- Firestore -----
export const {
    doc,
    collection,
    query,
    where,
    orderBy,
    limitToLast,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    writeBatch,
    runTransaction,
    serverTimestamp,
    increment
} = store;
