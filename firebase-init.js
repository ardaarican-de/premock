import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC_jn09EFvl45wP4oO1EKNKQ1VMxgkvgvs",
  authDomain: "premock-upload.firebaseapp.com",
  projectId: "premock-upload",
  storageBucket: "premock-upload.firebasestorage.app",
  messagingSenderId: "1005727299729",
  appId: "1:1005727299729:web:55bbb4eaadf181e0a56730",
  measurementId: "G-G29B4ZTVMV"
};

let app, storage, firestore;
try {
  app = initializeApp(firebaseConfig);
  storage = getStorage(app);
  firestore = getFirestore(app);
  window.firebaseReady = true;
  window.firebaseStorageBucket = firebaseConfig.storageBucket;
  window.firebaseStoragePublicUrl = function(path){
    return 'https://firebasestorage.googleapis.com/v0/b/' + encodeURIComponent(firebaseConfig.storageBucket) + '/o/' + encodeURIComponent(path) + '?alt=media';
  };
  // Random, non-sequential share ids so links can't be enumerated. 6 base36 chars
  // (~2 billion combos); on the rare collision we just roll a new id and retry.
  function randomShareId(len = 6){
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    let out = '';
    for(let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }
  window.firebaseSaveShare = async function(data){
    for(let attempt = 0; attempt < 5; attempt++){
      const shareId = randomShareId();
      const mappingRef = doc(firestore, 'shareMappings', shareId);
      const snap = await getDoc(mappingRef);
      if(snap.exists()) continue;                 // id already taken — try another
      await setDoc(mappingRef, {...data, createdAt: serverTimestamp()});
      return shareId;
    }
    throw new Error('Could not allocate a unique share id');
  };
  window.firebaseLoadShare = async function(shareId){
    const mappingRef = doc(firestore, 'shareMappings', shareId);
    const snap = await getDoc(mappingRef);
    if(!snap.exists()) throw new Error('Shared link not found');
    return snap.data();
  };
} catch (e) {
  console.error('Firebase init failed', e);
  window.firebaseReady = false;
}

window.uploadFileToFirebase = async function(file, type, onProgress) {
  const safeName = file.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
  const folder = type === 'image' ? 'uploads/images' : 'uploads/html';
  const path = `${folder}/${Date.now()}_${safeName}`;
  const storageRef = ref(storage, path);
  const metadata = {
    contentType: file.type || (type === 'html' ? 'text/html' : 'application/octet-stream')
  };

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, metadata);
    uploadTask.on('state_changed',
      (snap) => { if (typeof onProgress === 'function' && snap.totalBytes) onProgress(snap.bytesTransferred / snap.totalBytes * 100); },
      reject,
      async () => {
        try {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({downloadURL, path});
        } catch (err) {
          window.firebaseReady = false;
          reject(err);
        }
      }
    );
  });
};
