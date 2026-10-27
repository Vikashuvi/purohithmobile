// Delivers a notification to one or more users through every configured channel:
// 1. In-app inbox (public.app_notifications, always)
// 2. Expo push to registered devices (public.push_tokens)
// 3. Engagespot, when ENGAGESPOT_API_KEY and ENGAGESPOT_API_SECRET are set
// Delivery failures never throw: a booking action must not fail because a push did.
import { sendWebPush } from "./webPush.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const ENGAGESPOT_URL = "https://api.engagespot.co/v3";

export type NotificationInput = {
  userIds: (string | null | undefined)[];
  type: string;
  title: string;
  body?: string;
  bookingId?: string | null;
  requestId?: string | null;
  data?: Record<string, unknown>;
};

export async function notifyUsers(supabase: any, input: NotificationInput) {
  const userIds = [...new Set(input.userIds.filter((id): id is string => typeof id === "string" && id.length > 0))];
  if (!userIds.length) return { inApp: 0, push: 0, engagespot: false };
  const body = input.body || "";
  const data = {
    ...(input.data || {}),
    type: input.type,
    bookingId: input.bookingId || undefined,
    requestId: input.requestId || undefined,
  };

  let inApp = 0;
  try {
    const { error, count } = await supabase.from("app_notifications").insert(userIds.map((userId) => ({
      user_id: userId,
      type: input.type,
      title: input.title,
      body,
      data,
      booking_id: input.bookingId || null,
      request_id: input.requestId || null,
    })), { count: "exact" });
    if (error) console.warn("app_notifications insert failed", error.message);
    else inApp = count || userIds.length;
  } catch (error) {
    console.warn("app_notifications insert failed", String((error as Error)?.message || error));
  }

  const [push, webPush, engagespot] = await Promise.all([
    sendExpoPush(supabase, userIds, input.title, body, data),
    sendWebPush(supabase, userIds, { title: input.title, body, data }).catch((error) => {
      console.warn("Web push failed", String((error as Error)?.message || error));
      return { sent: 0, failed: 0, subscriptions: 0 };
    }),
    sendEngagespot(userIds, input.title, body, data),
  ]);
  await recordPushAnalytics(supabase, input.type, push, {
    bookingId: input.bookingId || null,
    requestId: input.requestId || null,
  });
  if (webPush.sent || webPush.failed) {
    await supabase.from("notification_delivery_events").insert([
      webPush.sent ? { notification_type: input.type, channel: "push", platform: "web", event: "sent", event_count: webPush.sent } : null,
      webPush.failed ? { notification_type: input.type, channel: "push", platform: "web", event: "failed", event_count: webPush.failed } : null,
    ].filter(Boolean));
  }
  return { inApp, push: push.sent, pushFailed: push.failed, webPush: webPush.sent, engagespot };
}

async function sendExpoPush(supabase: any, userIds: string[], title: string, body: string, data: Record<string, unknown>) {
  try {
    const { data: tokens } = await supabase.from("push_tokens").select("token,platform").in("user_id", userIds);
    if (!tokens?.length) return { sent: 0, failed: 0, byPlatform: {} as Record<string, { sent: number; failed: number }> };
    const messages = tokens.map(({ token, platform }: { token: string; platform?: string }) => ({
      to: token,
      platform: platform || "unknown",
      title,
      body,
      sound: "default",
      priority: "high",
      channelId: "default",
      data,
    }));
    let sent = 0;
    let failed = 0;
    const byPlatform: Record<string, { sent: number; failed: number }> = {};
    for (let index = 0; index < messages.length; index += 100) {
      const batch = messages.slice(index, index + 100);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch.map(({ platform: _platform, ...message }: any) => message)),
      });
      const result = await response.json().catch(() => ({}));
      const tickets = Array.isArray(result?.data) ? result.data : [];
      batch.forEach((message: any, ticketIndex: number) => {
        const platform = message.platform || "unknown";
        byPlatform[platform] ||= { sent: 0, failed: 0 };
        if (tickets[ticketIndex]?.status === "ok") {
          sent += 1;
          byPlatform[platform].sent += 1;
        } else {
          failed += 1;
          byPlatform[platform].failed += 1;
        }
      });
      const stale = tickets
        .map((ticket: any, ticketIndex: number) => ticket?.details?.error === "DeviceNotRegistered" ? batch[ticketIndex].to : null)
        .filter(Boolean);
      if (stale.length) await supabase.from("push_tokens").delete().in("token", stale);
    }
    return { sent, failed, byPlatform };
  } catch (error) {
    console.warn("Expo push failed", String((error as Error)?.message || error));
    return { sent: 0, failed: 0, byPlatform: {} as Record<string, { sent: number; failed: number }> };
  }
}

async function recordPushAnalytics(
  supabase: any,
  notificationType: string,
  delivery: { sent: number; failed: number; byPlatform: Record<string, { sent: number; failed: number }> },
  metadata: Record<string, unknown>,
) {
  try {
    const rows = Object.entries(delivery.byPlatform).flatMap(([platform, counts]) => [
      counts.sent ? { notification_type: notificationType, channel: "push", event: "sent", platform, event_count: counts.sent, metadata } : null,
      counts.failed ? { notification_type: notificationType, channel: "push", event: "failed", platform, event_count: counts.failed, metadata } : null,
    ]).filter(Boolean);
    if (rows.length) await supabase.from("notification_delivery_events").insert(rows);
  } catch (error) {
    console.warn("Notification analytics insert failed", String((error as Error)?.message || error));
  }
}

async function sendEngagespot(userIds: string[], title: string, body: string, data: Record<string, unknown>) {
  const apiKey = Deno.env.get("ENGAGESPOT_API_KEY");
  const apiSecret = Deno.env.get("ENGAGESPOT_API_SECRET");
  if (!apiKey || !apiSecret) return false;
  const baseUrl = Deno.env.get("ENGAGESPOT_BASE_URL") || ENGAGESPOT_URL;
  const workflow = Deno.env.get("ENGAGESPOT_WORKFLOW_ID");
  const headers = {
    "X-ENGAGESPOT-API-KEY": apiKey,
    "X-ENGAGESPOT-API-SECRET": apiSecret,
    "Content-Type": "application/json",
  };
  const notification = workflow
    ? { workflow: { identifier: workflow }, data: { title, message: body, ...data } }
    : { title, message: body, data };
  try {
    const response = await fetch(`${baseUrl}/notifications`, {
      method: "POST",
      headers,
      body: JSON.stringify({ notification, sendTo: { recipients: userIds } }),
    });
    if (!response.ok) console.warn("Engagespot send failed", response.status, await response.text().catch(() => ""));
    return response.ok;
  } catch (error) {
    console.warn("Engagespot send failed", String((error as Error)?.message || error));
    return false;
  }
}

export async function priestUserId(supabase: any, priestProfileId: string | null | undefined) {
  if (!priestProfileId) return null;
  const { data } = await supabase.from("priest_profiles").select("user_id").eq("id", priestProfileId).maybeSingle();
  return (data?.user_id as string) || null;
}

export function formatInr(amount: unknown) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}
