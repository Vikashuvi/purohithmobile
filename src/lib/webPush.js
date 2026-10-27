import { Platform } from "react-native";
import { supabase } from "./supabase";

// Public half of the Web Push VAPID key. The private half lives only in Supabase Edge Function secrets.
const vapidKey = process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_KEY || "BB-Nv8AOaqSWe6mxOiwrRnj7xP-buAT1ojq3LCj6uVn2RLcbkquANBYU8fqD-qKO5XIxR5HG4Htfyslxbbyci2U";

function decodeBase64Url(value) {
  const padded = `${value}${"=".repeat((4 - value.length % 4) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export function webPushSupported() {
  if (Platform.OS !== "web" || typeof window === "undefined" || typeof navigator === "undefined") return false;
  return Boolean(window.isSecureContext && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window);
}

export function webPushPermission() {
  if (Platform.OS !== "web" || typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

async function saveSubscription(userId, subscription) {
  const serialized = subscription.toJSON();
  const { error } = await supabase.from("web_push_subscriptions").upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    p256dh: serialized.keys?.p256dh,
    auth: serialized.keys?.auth,
    user_agent: navigator.userAgent.slice(0, 500),
    updated_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw error;
}

// prompt must stay false unless this runs inside a click or tap. Browsers ignore
// Notification.requestPermission when it is not tied to a user gesture.
export async function ensureWebPush(userId, { prompt = false } = {}) {
  if (!webPushSupported()) return { status: "unsupported" };
  if (!vapidKey) return { status: "unconfigured" };
  if (!userId || !supabase) return { status: "signed_out" };
  let permission = Notification.permission;
  if (permission === "default") {
    if (!prompt) return { status: "default" };
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return { status: permission };
  const registration = await navigator.serviceWorker.register("/web-notifications-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(vapidKey),
  });
  await saveSubscription(userId, subscription);
  return { status: "registered" };
}

export function registerWebPush(userId) {
  return ensureWebPush(userId, { prompt: true });
}

export async function unregisterWebPush() {
  if (!webPushSupported() || !supabase) return;
  const registration = await navigator.serviceWorker.getRegistration("/web-notifications-sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await supabase.from("web_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe();
}
