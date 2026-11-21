import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyA1KxuQpd65nYDc643Ju541sfFTPRPuzbc",
  authDomain: "chatabi-49125.firebaseapp.com",
  projectId: "chatabi-49125",
  storageBucket: "chatabi-49125.firebasestorage.app",
  messagingSenderId: "1027469607601",
  appId: "1:1027469607601:web:6809becb7d462d01731890",
  measurementId: "G-0WBYEC3THD"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
