import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.5";
import { sendWebPush } from "../_shared/webPush.ts";

function secretKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys);
    if (parsed.default) return parsed.default;
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
}

async function hookAuthorized(header: string) {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl || !header) return false;
  const sql = postgres(dbUrl, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    const rows = await sql<{ decrypted_secret: string }[]>`
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'WEB_PUSH_HOOK_SECRET'
      order by created_at desc
      limit 1
    `;
    const expected = rows[0]?.decrypted_secret || "";
    if (!expected || expected.length !== header.length) return false;
    let mismatch = 0;
    for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ header.charCodeAt(index);
    return mismatch === 0;
  } catch (error) {
    console.warn("Web push hook check failed", String((error as Error)?.message || error));
    return false;
  } finally {
    await sql.end();
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!(await hookAuthorized(req.headers.get("x-web-push-hook") || ""))) return new Response("Unauthorized", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const title = typeof body.title === "string" ? body.title : "";
  if (!userId || !title) return new Response("Bad request", { status: 400 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await sendWebPush(supabase, [userId], {
    title,
    body: typeof body.body === "string" ? body.body : "",
    data: body.data && typeof body.data === "object" ? body.data : {},
  });
  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
