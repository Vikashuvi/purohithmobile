import { getApp, getApps, initializeApp } from "firebase/app";
import { getAdditionalUserInfo, getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseGoogleConfigured = Object.values(config).every(Boolean);

function firebaseAuth() {
  if (!isFirebaseGoogleConfigured) throw new Error("Google sign-in is being configured. Please use email for now.");
  const app = getApps().length ? getApp() : initializeApp(config);
  return getAuth(app);
}

export async function signInWithFirebaseGoogle() {
  const provider = new GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");
  const result = await signInWithPopup(firebaseAuth(), provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.idToken) throw new Error("Google did not return a sign-in token. Please try again.");
  const googleProfile = result.user.providerData.find((profile) => profile.providerId === "google.com");
  const providerProfile = getAdditionalUserInfo(result)?.profile || {};
  return {
    idToken: credential.idToken,
    accessToken: credential.accessToken || undefined,
    fullName: googleProfile?.displayName || result.user.displayName || providerProfile.name || "",
    photoUrl: googleProfile?.photoURL || result.user.photoURL || providerProfile.picture || "",
  };
}

export async function signOutFirebaseGoogle() {
  if (isFirebaseGoogleConfigured && getApps().length) await signOut(firebaseAuth());
}
