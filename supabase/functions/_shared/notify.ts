// Delivers a notification to one or more users through every configured channel:
// 1. In-app inbox (public.app_notifications, always)
// 2. Expo push to registered devices (public.push_tokens)
// 3. Engagespot, when ENGAGESPOT_API_KEY and ENGAGESPOT_API_SECRET are set
// Delivery failures never throw: a booking action must not fail because a push did.

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

  const [push, engagespot] = await Promise.all([
    sendExpoPush(supabase, userIds, input.title, body, data),
    sendEngagespot(userIds, input.title, body, data),
  ]);
  return { inApp, push, engagespot };
}

async function sendExpoPush(supabase: any, userIds: string[], title: string, body: string, data: Record<string, unknown>) {
  try {
    const { data: tokens } = await supabase.from("push_tokens").select("token").in("user_id", userIds);
    if (!tokens?.length) return 0;
    const messages = tokens.map(({ token }: { token: string }) => ({
      to: token,
      title,
      body,
      sound: "default",
      priority: "high",
      channelId: "default",
      data,
    }));
    let sent = 0;
    for (let index = 0; index < messages.length; index += 100) {
      const batch = messages.slice(index, index + 100);
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
      const result = await response.json().catch(() => ({}));
      const tickets = Array.isArray(result?.data) ? result.data : [];
      sent += tickets.filter((ticket: any) => ticket?.status === "ok").length;
      const stale = tickets
        .map((ticket: any, ticketIndex: number) => ticket?.details?.error === "DeviceNotRegistered" ? batch[ticketIndex].to : null)
        .filter(Boolean);
      if (stale.length) await supabase.from("push_tokens").delete().in("token", stale);
    }
    return sent;
  } catch (error) {
    console.warn("Expo push failed", String((error as Error)?.message || error));
    return 0;
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
