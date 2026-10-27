import { useEffect, useRef, useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "../lib/auth";
import { usePreferences } from "../lib/preferences";
import { registerForPush } from "../lib/notifications";
import { ensureWebPush, registerWebPush } from "../lib/webPush";
import { notificationRoute, subscribeNotifications } from "../lib/inbox";

const ROUTED_TYPES = new Set([
  "booking_request", "booking_accepted", "booking_confirmed", "booking_rejected", "booking_completed",
  "payment_confirmed", "open_request", "proposal_received", "proposal_updated", "proposal_selected",
  "marketing",
]);

// Registers this device for push once signed in, and opens the right screen when a push is tapped.
export default function NotificationBridge({ navigationRef }) {
  const { user } = useAuth();
  const { notificationsEnabled, ready } = usePreferences();
  const registeredFor = useRef(null);
  const [webNotice, setWebNotice] = useState(null);
  const [askWebPush, setAskWebPush] = useState(false);

  useEffect(() => {
    if (!ready || !user?.id || !notificationsEnabled) {
      if (!notificationsEnabled) {
        registeredFor.current = null;
        setAskWebPush(false);
      }
      return;
    }
    if (registeredFor.current === user.id) return;
    registeredFor.current = user.id;
    if (Platform.OS === "web") {
      ensureWebPush(user.id).then((result) => setAskWebPush(result.status === "default")).catch((error) => console.warn("Web push registration failed", error?.message || error));
      return;
    }
    registerForPush().catch((error) => console.warn("Push registration failed", error?.message || error));
  }, [notificationsEnabled, ready, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      registeredFor.current = null;
      setAskWebPush(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web" || !user?.id) return undefined;
    const openFromResponse = (response) => {
      const data = response?.notification?.request?.content?.data || {};
      if (!ROUTED_TYPES.has(data.type)) return;
      const route = notificationRoute(user.role, { type: data.type, request_id: data.requestId, data });
      const go = () => navigationRef.isReady() ? navigationRef.navigate(route.name, route.params) : setTimeout(go, 250);
      go();
    };
    Notifications.getLastNotificationResponseAsync().then((response) => { if (response) openFromResponse(response); }).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    return () => subscription.remove();
  }, [navigationRef, user?.id, user?.role]);

  useEffect(() => {
    if (Platform.OS !== "web" || !user?.id || !notificationsEnabled) return undefined;
    return subscribeNotifications(user.id, (event) => {
      if (event.eventType !== "INSERT" || !event.new) return;
      const item = event.new;
      if (item.type === "marketing" && item.data?.channel === "mobile") return;
      setWebNotice(item);
    });
  }, [notificationsEnabled, user?.id]);

  useEffect(() => {
    if (!webNotice) return undefined;
    const timeout = setTimeout(() => setWebNotice(null), 7000);
    return () => clearTimeout(timeout);
  }, [webNotice]);

  if (Platform.OS !== "web" || (!webNotice && !askWebPush)) return null;
  return <>
    {askWebPush ? <View style={promptStyle}>
      <Text style={promptKicker}>BROWSER NOTIFICATIONS</Text>
      <Text style={promptTitle}>Get updates in this browser</Text>
      <Text style={promptBody}>Booking, payment, and proposal alerts can arrive even when this tab is closed.</Text>
      <View style={promptActions}>
        <Pressable accessibilityRole="button" onPress={async () => {
          try {
            const result = await registerWebPush(user?.id);
            setAskWebPush(result.status === "default");
            if (result.status === "denied") Alert.alert("Notifications", "Notifications are blocked in this browser. Allow them in the site settings, then try again.");
            else if (result.status !== "registered") Alert.alert("Notifications", "Could not enable browser notifications");
          } catch (error) { Alert.alert("Notifications", error?.message || "Could not enable browser notifications"); }
        }} style={promptEnable}><Text style={promptEnableText}>Enable</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setAskWebPush(false)} style={promptLater}><Text style={promptLaterText}>Not now</Text></Pressable>
      </View>
    </View> : null}
    {webNotice ? <Pressable accessibilityRole="button" accessibilityLabel={`${webNotice.title}. Open notification`} onPress={() => {
      const route = notificationRoute(user?.role, webNotice);
      setWebNotice(null);
      if (navigationRef.isReady()) navigationRef.navigate(route.name, route.params);
    }} style={[noticeStyle, { top: askWebPush ? 188 : 20 }]}>
      <View><Text style={noticeKicker}>PUROHITH CONNECT · NOW</Text><Text style={noticeTitle}>{webNotice.title}</Text><Text style={noticeBody}>{webNotice.body}</Text></View>
    </Pressable> : null}
  </>;
}

const promptStyle = { position: "absolute", right: 20, top: 20, width: 320, maxWidth: "calc(100vw - 40px)", zIndex: 1000, padding: 16, borderRadius: 14, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5D4C9", boxShadow: "0 12px 36px rgba(44,28,18,.2)" };
const promptKicker = { fontSize: 10, fontWeight: "800", color: "#B84C20", marginBottom: 5 };
const promptTitle = { fontSize: 14, fontWeight: "800", color: "#27221F" };
const promptBody = { fontSize: 12, color: "#6C625C", marginTop: 4, lineHeight: 17 };
const promptActions = { flexDirection: "row", gap: 8, marginTop: 12 };
const promptEnable = { backgroundColor: "#8A3122", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 };
const promptEnableText = { color: "#FFF", fontSize: 12, fontWeight: "700" };
const promptLater = { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 };
const promptLaterText = { color: "#6C625C", fontSize: 12, fontWeight: "700" };
const noticeStyle = { position: "absolute", right: 20, width: 320, maxWidth: "calc(100vw - 40px)", zIndex: 1000, padding: 16, borderRadius: 14, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E5D4C9", boxShadow: "0 12px 36px rgba(44,28,18,.2)" };
const noticeKicker = { fontSize: 10, fontWeight: "800", color: "#B84C20", marginBottom: 5 };
const noticeTitle = { fontSize: 14, fontWeight: "800", color: "#27221F" };
const noticeBody = { fontSize: 12, color: "#6C625C", marginTop: 4 };
