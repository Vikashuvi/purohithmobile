import { supabase, supabaseConfig } from "./supabase";
import { tokens } from "./api";

async function invokePuroMitra(body, accessToken) {
  let invokeError = null;

  if (supabase) {
    const { data, error } = await supabase.functions.invoke("puromitra-ai", {
      body,
      headers: accessToken ? { "x-pc-access-token": accessToken } : undefined,
    });
    if (!error && data) return data;
    invokeError = error;
  }

  if (supabaseConfig.url && supabaseConfig.publishableKey) {
    const response = await fetch(`${supabaseConfig.url}/functions/v1/puromitra-ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseConfig.publishableKey,
        Authorization: `Bearer ${supabaseConfig.publishableKey}`,
        ...(accessToken ? { "x-pc-access-token": accessToken } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) return data;
    throw new Error(data.error || data.reply || `PuroMitra request failed with ${response.status}`);
  }

  throw new Error(invokeError?.message || "Supabase is not configured for PuroMitra.");
}

function userPayload(user) {
  return user ? {
    id: user.id,
    role: user.role,
    name: user.name || user.full_name,
    phone: user.phone,
    demo: Boolean(user.demo),
  } : null;
}

export async function askPuroMitra({ sessionId, message, language, user }) {
  const accessToken = await tokens.getAccess();
  const body = {
    agent_kind: "promitra",
    session_id: sessionId,
    message,
    language,
    user: userPayload(user),
  };

  return invokePuroMitra(body, accessToken);
}

export async function getPuroMitraHistory({ sessionId, language, user }) {
  const accessToken = await tokens.getAccess();
  const body = {
    agent_kind: "promitra",
    action: "history",
    session_id: sessionId,
    language,
    user: userPayload(user),
  };

  return invokePuroMitra(body, accessToken);
}

export async function listPuroMitraThreads({ language, user }) {
  const accessToken = await tokens.getAccess();
  return invokePuroMitra({
    agent_kind: "promitra",
    action: "list_threads",
    session_id: "promitra-thread-list",
    language,
    user: userPayload(user),
  }, accessToken);
}

export async function askDAPGuide({ sessionId, message, language, user, currentRoute }) {
  const accessToken = await tokens.getAccess();
  return invokePuroMitra({
    agent_kind: "dap",
    session_id: sessionId,
    message,
    language,
    current_route: currentRoute,
    user: userPayload(user),
  }, accessToken);
}

export async function getDAPHistory({ sessionId, language, user }) {
  const accessToken = await tokens.getAccess();
  return invokePuroMitra({
    agent_kind: "dap",
    action: "history",
    session_id: sessionId,
    language,
    user: userPayload(user),
  }, accessToken);
}
