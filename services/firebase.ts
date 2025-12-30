
// This is a simplified setup for environments without module bundlers.
// In a real-world app, you'd use `import` statements.
declare const firebase: any;

const firebaseConfig = {
  apiKey: "AIzaSyDuRLsuANi2GcVaqWYagjsLUYEXfMvYAa8",
  authDomain: "plan-new.firebaseapp.com",
  projectId: "plan-new",
  storageBucket: "plan-new.appspot.com", 
  messagingSenderId: "813652883021",
  appId: "1:813652883021:web:5a6b60cc661a10cf7dce04",
  measurementId: "G-6VBFEY7X5G"
};


let firestore: any;

try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    firestore = firebase.firestore();
    
    // Enable offline persistence with multi-tab synchronization
    // Use a more robust check for persistence availability
    firestore.enablePersistence({ synchronizeTabs: true }).catch((err: any) => {
        if (err.code === 'failed-precondition') {
            // Multiple tabs open, persistence can only be enabled in one tab at a time.
            console.warn("Firestore Persistence: Failed (multiple tabs open). Continuing without offline support.");
        } else if (err.code === 'unimplemented') {
            // The current browser doesn't support all of the features required to enable persistence
            console.warn("Firestore Persistence: Browser not supported.");
        }
    });
} catch (e) {
    console.error("Firebase initialization error", e);
}

export { firestore };
