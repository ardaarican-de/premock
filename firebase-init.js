import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";
import { getFirestore, doc, setDoc, getDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

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
  window.firebaseSaveShare = async function(data){
    const counterRef = doc(firestore, 'shareMeta', 'counter');
    const nextId = await runTransaction(firestore, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      let next = 1;
      if(counterSnap.exists()){
        next = Number(counterSnap.data().next || 1);
      }
      tx.set(counterRef, {next: next + 1}, {merge:true});
      return next;
    });
    const shareId = nextId.toString(36);
    const mappingRef = doc(firestore, 'shareMappings', shareId);
    await setDoc(mappingRef, {...data, createdAt: serverTimestamp()});
    return shareId;
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

window.uploadFileToFirebase = async function(file, type) {
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
      () => {},
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
