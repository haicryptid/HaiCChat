// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAsF8ReLcLgQYCPzXAPdgaO44toP-Q08y0",
  authDomain: "haicchat.firebaseapp.com",
  databaseURL: "https://haicchat-default-rtdb.asia-southeast1.firebasedatabase.app", // 이 URL은 Realtime Database 만든 후에 나타날 거야
  projectId: "haicchat",
  storageBucket: "haicchat.firebasestorage.app",
  messagingSenderId: "16552722528",
  appId: "1:16552722528:web:a6df5b206254c383198305"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);