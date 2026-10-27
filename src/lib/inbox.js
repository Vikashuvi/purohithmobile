// In-app notification inbox backed by public.app_notifications (RLS: own rows only).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Platform } from "react-native";

export async function listNotifications(limit = 50) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("app_notifications")
    .select("id,type,title,body,data,booking_id,request_id,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).filter(isVisibleOnPlatform);
}

function isVisibleOnPlatform(item) {
  return item.type !== "marketing" || !item.data?.channel || item.data.channel === "all" || item.data.channel === (Platform.OS === "web" ? "web" : "mobile");
}

export async function markNotificationRead(id) {
  if (!supabase || !id) return;
  await supabase.from("app_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
}

export async function markAllNotificationsRead() {
  if (!supabase) return;
  await supabase.from("app_notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
}

export function subscribeNotifications(userId, onChange) {
  if (!supabase || !userId) return () => {};
  const channel = supabase
    .channel(`app-notifications:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "app_notifications", filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export function useUnreadNotifications(userId) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    if (!supabase || !userId) return setCount(0);
    const { data } = await supabase
      .from("app_notifications")
      .select("id,type,data")
      .is("read_at", null)
      .limit(500);
    setCount((data || []).filter(isVisibleOnPlatform).length);
  }, [userId]);
  useEffect(() => {
    refresh().catch(() => {});
    return subscribeNotifications(userId, () => { refresh().catch(() => {}); });
  }, [refresh, userId]);
  return { count, refresh };
}

// Where a notification should take the user, by role and notification type.
export function notificationRoute(role, item) {
  const type = item?.type || item?.data?.type;
  const requestId = item?.request_id || item?.data?.requestId;
  if (type === "marketing") {
    const destination = item?.data?.deepLink || "notifications";
    if (destination === "notifications") return { name: "Notifications" };
    if (destination === "profile") return { name: "Tabs", params: { screen: "Profile" } };
    if (destination === "home") return { name: "Tabs", params: { screen: role === "priest" ? "Dashboard" : "Home" } };
    if (destination === "bookings") return { name: "Tabs", params: { screen: role === "priest" ? "Dashboard" : "Bookings" } };
    if (destination === "priests") return role === "priest" ? { name: "Tabs", params: { screen: "Marketplace" } } : { name: "PriestList" };
  }
  if (role === "priest") {
    if (type === "open_request" || type === "proposal_selected") return { name: "Tabs", params: { screen: "Marketplace" } };
    return { name: "Tabs", params: { screen: "Dashboard" } };
  }
  if ((type === "proposal_received" || type === "proposal_updated") && requestId) return { name: "RequestProposals", params: { requestId } };
  return { name: "Tabs", params: { screen: "Bookings" } };
}
