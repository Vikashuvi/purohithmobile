import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "../lib/auth";
import { usePreferences } from "../lib/preferences";
import { registerForPush } from "../lib/notifications";
import { notificationRoute } from "../lib/inbox";

const ROUTED_TYPES = new Set([
  "booking_request", "booking_accepted", "booking_confirmed", "booking_rejected", "booking_completed",
  "payment_confirmed", "open_request", "proposal_received", "proposal_updated", "proposal_selected",
]);

// Registers this device for push once signed in, and opens the right screen when a push is tapped.
export default function NotificationBridge({ navigationRef }) {
  const { user } = useAuth();
  const { notificationsEnabled, ready } = usePreferences();
  const registeredFor = useRef(null);

  useEffect(() => {
    if (Platform.OS === "web" || !ready || !user?.id || !notificationsEnabled) return;
    if (registeredFor.current === user.id) return;
    registeredFor.current = user.id;
    registerForPush().catch((error) => console.warn("Push registration failed", error?.message || error));
  }, [notificationsEnabled, ready, user?.id]);

  useEffect(() => {
    if (!user?.id) registeredFor.current = null;
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS === "web" || !user?.id) return undefined;
    const openFromResponse = (response) => {
      const data = response?.notification?.request?.content?.data || {};
      if (!ROUTED_TYPES.has(data.type)) return;
      const route = notificationRoute(user.role, { type: data.type, request_id: data.requestId });
      const go = () => navigationRef.isReady() ? navigationRef.navigate(route.name, route.params) : setTimeout(go, 250);
      go();
    };
    Notifications.getLastNotificationResponseAsync().then((response) => { if (response) openFromResponse(response); }).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(openFromResponse);
    return () => subscription.remove();
  }, [navigationRef, user?.id, user?.role]);

  return null;
}
