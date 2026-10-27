import postgres from "npm:postgres@3.4.5";
import webPush from "npm:web-push@3.6.7";

type Subscription = { endpoint: string; p256dh: string; auth: string };
type VapidKeys = { publicKey: string; privateKey: string };

let vaultKeys: VapidKeys | null = null;

async function vapidKeys(): Promise<VapidKeys | null> {
  const publicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY");
  if (publicKey && privateKey) return { publicKey, privateKey };
  if (vaultKeys) return vaultKeys;
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return null;
  const sql = postgres(dbUrl, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    const rows = await sql<{ name: string; decrypted_secret: string }[]>`
      select distinct on (name) name, decrypted_secret
      from vault.decrypted_secrets
      where name in ('WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY')
      order by name, created_at desc
    `;
    const nextPublic = rows.find((row) => row.name === "WEB_PUSH_VAPID_PUBLIC_KEY")?.decrypted_secret;
    const nextPrivate = rows.find((row) => row.name === "WEB_PUSH_VAPID_PRIVATE_KEY")?.decrypted_secret;
    if (!nextPublic || !nextPrivate) return null;
    vaultKeys = { publicKey: nextPublic, privateKey: nextPrivate };
    return vaultKeys;
  } catch (error) {
    console.warn("Web push VAPID keys unavailable", String((error as Error)?.message || error));
    return null;
  } finally {
    await sql.end();
  }
}

export async function sendWebPush(
  supabase: any,
  userIds: string[],
  message: { title: string; body: string; data: Record<string, unknown> },
) {
  const keys = await vapidKeys();
  if (!keys || !userIds.length) return { sent: 0, failed: 0, subscriptions: 0 };
  webPush.setVapidDetails("mailto:purohithconnect@gmail.com", keys.publicKey, keys.privateKey);

  const subscriptions: Subscription[] = [];
  for (let index = 0; index < userIds.length; index += 150) {
    const { data, error } = await supabase.from("web_push_subscriptions")
      .select("endpoint,p256dh,auth").in("user_id", userIds.slice(index, index + 150));
    if (error) {
      console.warn("Web push subscriptions unavailable", error.message);
      return { sent: 0, failed: 0, subscriptions: 0 };
    }
    subscriptions.push(...(data || []));
  }

  let sent = 0;
  let failed = 0;
  const payload = JSON.stringify(message);
  for (let index = 0; index < subscriptions.length; index += 20) {
    const batch = subscriptions.slice(index, index + 20);
    await Promise.all(batch.map(async (subscription) => {
      try {
        await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 3600 });
        sent += 1;
      } catch (error) {
        failed += 1;
        const status = (error as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("web_push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        } else console.warn("Web push delivery failed", status || String(error));
      }
    }));
  }
  return { sent, failed, subscriptions: subscriptions.length };
}
