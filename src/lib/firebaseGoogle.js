import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import Constants from "expo-constants";

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || Constants.expoConfig?.extra?.googleWebClientId || "";

export const isFirebaseGoogleConfigured = Boolean(webClientId);

function configureGoogle() {
  if (!webClientId) {
    const error = new Error("Google sign-in is being configured. Please use email for now.");
    error.code = "auth/not-configured";
    throw error;
  }
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
    scopes: ["profile", "email"],
  });
}

export async function signInWithFirebaseGoogle() {
  configureGoogle();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type === "cancelled") {
      const error = new Error("Google sign-in was cancelled.");
      error.code = "auth/cancelled-popup-request";
      throw error;
    }
    const idToken = response.data?.idToken;
    if (!idToken) {
      throw new Error("Google did not return a sign-in token. Add this app's SHA-1 in Firebase, set the web client ID, and rebuild.");
    }
    const profile = response.data.user || {};
    return {
      idToken,
      accessToken: undefined,
      fullName: profile.name || "",
      photoUrl: profile.photo || "",
    };
  } catch (reason) {
    if (reason?.code === "auth/cancelled-popup-request" || reason?.code === statusCodes.SIGN_IN_CANCELLED) {
      const error = new Error("Google sign-in was cancelled.");
      error.code = "auth/cancelled-popup-request";
      throw error;
    }
    if (reason?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error("Google Play services are missing or out of date on this phone.");
    }
    if (reason?.code === "10" || reason?.code === "DEVELOPER_ERROR") {
      throw new Error("Google rejected this Android build. Add the app SHA-1 in Firebase for com.purohithconnect.app, then rebuild with the web client ID.");
    }
    throw reason;
  }
}

export async function signOutFirebaseGoogle() {
  if (!webClientId) return;
  try {
    GoogleSignin.configure({ webClientId });
    await GoogleSignin.signOut();
  } catch (_) {}
}
