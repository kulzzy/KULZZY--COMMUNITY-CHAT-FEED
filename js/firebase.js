// ==========================================
// Kulzzy Radio Live Community
// firebase.js
// ==========================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getDatabase,
    ref,
    push,
    set,
    update,
    get,
    onValue,
    onChildAdded,
    query,
    limitToLast,
    onDisconnect,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";


const firebaseConfig = {

    apiKey:
        "AIzaSyBH85NGWsSAK5cubbPdnmunwYZFZpj_CB0",

    authDomain:
        "kulzzy-radio-chat.firebaseapp.com",

    databaseURL:
        "https://kulzzy-radio-chat-default-rtdb.europe-west1.firebasedatabase.app",

    projectId:
        "kulzzy-radio-chat",

    storageBucket:
        "kulzzy-radio-chat.firebasestorage.app",

    messagingSenderId:
        "510100635134",

    appId:
        "1:510100635134:web:9d3b2e983eb6e9a385d4af"
};


const app =
    initializeApp(firebaseConfig);


const db =
    getDatabase(app);


export {

    app,

    db,

    ref,
    push,
    set,
    update,
    get,

    query,
    limitToLast,

    onValue,
    onChildAdded,

    onDisconnect,
    serverTimestamp

};
