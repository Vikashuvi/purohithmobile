import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-pc-access-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_CUSTOMER_ID = "10000000-0000-4000-8000-000000000001";
const FALLBACK_AREA = "Bengaluru";
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
const AGENT_PROMITRA = "promitra";
const AGENT_DAP = "dap";

type Pooja = {
  slug: string;
  name: string;
  description: string;
  duration_minutes: number;
  base_price_inr: number;
};

type Priest = {
  id: string;
  display_name: string;
  bio: string;
  years_experience: number;
  languages: string[];
  service_areas: string[];
  pooja_slugs: string[];
  rating: number;
  review_count: number;
  tradition: string;
};

type AgentPlan = {
  intent: string;
  pooja_slug: string | null;
  should_create_request: boolean;
  ceremony_date: string | null;
  ceremony_time: string | null;
  address: string | null;
  landmark: string | null;
  budget_min_inr: number | null;
  budget_max_inr: number | null;
  notes: string | null;
  reply: string;
  ai_provider?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getSupabaseSecretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const sessionId = String(body.session_id || crypto.randomUUID()).slice(0, 120);
    const agentKind = normalizeAgentKind(body.agent_kind || body.agent || AGENT_PROMITRA);
    const user = body.user || {};
    const customerId = await resolveCustomerId(supabase, user?.id);
    if (body.action === "list_threads") {
      const threads = await listThreads(supabase, customerId, agentKind);
      return json({ agent_kind: agentKind, threads });
    }

    const thread = await upsertThread(supabase, sessionId, customerId, user?.role || "customer", agentKind, body.title);

    if (body.action === "history") {
      const messages = await loadHistory(supabase, thread.id, 40);
      return json({ session_id: sessionId, thread_id: thread.id, title: thread.title, agent_kind: agentKind, messages });
    }

    const message = String(body.message || "").trim();
    if (!message) return json({ error: "Message is required" }, 400);

    const [poojas, priests, history] = await Promise.all([
      loadPoojas(supabase),
      loadPriests(supabase),
      loadHistory(supabase, thread.id),
    ]);

    await supabase.from("ai_agent_messages").insert({
      thread_id: thread.id,
      role: "user",
      content: message,
      metadata: { user },
    });

    const openAIKey = Deno.env.get("OPENAI_API_KEY") || await loadOpenAIKeyFromSupabase(supabase);
    const plan = agentKind === AGENT_DAP
      ? await buildDAPPlanWithOpenAI({ message, history, language: body.language || "en", apiKey: openAIKey, userRole: user?.role || body.user_role || "customer", currentRoute: body.current_route || "" })
      : await buildPlanWithOpenAI({ message, poojas, priests, history, language: body.language || "en", apiKey: openAIKey });
    const normalizedPlan = normalizePlan(plan, message, poojas);
    const matchedPooja = poojas.find((pooja) => pooja.slug === normalizedPlan.pooja_slug) || null;
    const matchedPriests = matchedPooja
      ? priests.filter((priest) => priest.pooja_slugs?.includes(matchedPooja.slug)).slice(0, 8)
      : [];

    const actions = [];
    let reply = normalizedPlan.reply || composeFallbackReply(normalizedPlan, matchedPooja, matchedPriests);

    const wantsProposalRequest = /\b(request|proposal|proposals|bid|bids|quote|quotes)\b/i.test(message);
    const wantsProfiles = /\b(book|booking|hire|find|profile|profiles|purohit|priest|pandit|promitra|prohit)\b/i.test(message);

    if (agentKind === AGENT_DAP) {
      reply = normalizedPlan.reply || "I can guide you around Purohith Connect. Tell me what you want to do next.";
      actions.push(...dapActionsForMessage(message, user?.role || body.user_role || "customer"));
    } else if (normalizedPlan.should_create_request && wantsProposalRequest) {
      if (!matchedPooja) {
        actions.push({ type: "start_request", label: "Choose ceremony", pooja_slug: null });
      } else if (!normalizedPlan.address || normalizedPlan.address.length < 8) {
        reply = `${reply}\n\nShare the ceremony street address or area and I can post this request for matching purohits.`;
        actions.push({ type: "start_request", label: "Add request details", pooja_slug: matchedPooja.slug });
      } else {
        const created = await createCeremonyRequest(supabase, {
          customerId,
          pooja: matchedPooja,
          plan: normalizedPlan,
        });
        await supabase.from("ai_agent_actions").insert({
          thread_id: thread.id,
          action_type: "created_ceremony_request",
          request_id: created.id,
          metadata: { matched_priest_count: matchedPriests.length, pooja_slug: matchedPooja.slug },
        });
        reply = `Done. I created a ${matchedPooja.name} proposal request and matched it to ${matchedPriests.length} verified purohits who serve this ceremony tag. You can now compare bids as they arrive.`;
        actions.push({
          id: created.id,
          type: "view_proposals",
          label: "View matching proposals",
          request_id: created.id,
          pooja_name: matchedPooja.name,
          ceremony_date: created.ceremony_date,
          ceremony_time: created.ceremony_time,
          address: created.address,
          landmark: created.landmark,
          lat: created.lat,
          lng: created.lng,
        });
      }
    } else if (matchedPooja) {
      if (wantsProfiles) {
        reply = `I found ${matchedPriests.length} verified purohit profiles for ${matchedPooja.name}. You can compare their languages, service areas, experience, and starting price before sending a proposal request.`;
        actions.push({ type: "view_profiles", label: `View ${matchedPooja.name} profiles`, pooja_slug: matchedPooja.slug, pooja_name: matchedPooja.name });
      }
      actions.push({ type: "start_request", label: `Request ${matchedPooja.name}`, pooja_slug: matchedPooja.slug });
    }

    await supabase.from("ai_agent_messages").insert({
      thread_id: thread.id,
      role: "assistant",
      content: reply,
      metadata: { plan: normalizedPlan, actions, matched_priest_count: matchedPriests.length, ai_provider: normalizedPlan.ai_provider },
    });

    await supabase.from("ai_agent_threads").update({
      title: titleForThread(thread.title, message, matchedPooja?.name || normalizedPlan.intent),
      last_intent: normalizedPlan.intent || "general_help",
      last_pooja_slug: matchedPooja?.slug || null,
      updated_at: new Date().toISOString(),
    }).eq("id", thread.id);

    return json({
      session_id: sessionId,
      thread_id: thread.id,
      title: titleForThread(thread.title, message, matchedPooja?.name || normalizedPlan.intent),
      agent_kind: agentKind,
      reply,
      actions,
      ai_provider: normalizedPlan.ai_provider,
      matches: matchedPriests.map((priest) => ({
        id: priest.id,
        name: priest.display_name,
        rating: priest.rating,
        reviews: priest.review_count,
        languages: priest.languages,
        areas: priest.service_areas,
      })),
    });
  } catch (error) {
    return json({ reply: "I could not complete that request right now. Please try again in a moment.", error: String(error?.message || error) }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseSecretKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    const parsed = JSON.parse(secretKeys);
    if (parsed.default) return parsed.default;
  }
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRole) return serviceRole;
  throw new Error("Supabase secret key is not configured for this function.");
}

async function resolveCustomerId(supabase: ReturnType<typeof createClient>, userId: string | undefined) {
  if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    const { data } = await supabase.from("app_users").select("id,role").eq("id", userId).eq("role", "customer").maybeSingle();
    if (data?.id) return data.id;
  }
  return DEFAULT_CUSTOMER_ID;
}

function normalizeAgentKind(value: unknown) {
  return String(value || AGENT_PROMITRA).toLowerCase() === AGENT_DAP ? AGENT_DAP : AGENT_PROMITRA;
}

async function upsertThread(supabase: ReturnType<typeof createClient>, sessionId: string, customerId: string, userRole: string, agentKind: string, title: string | undefined) {
  const { data: existing, error: existingError } = await supabase.from("ai_agent_threads")
    .select("id,title")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    const { data, error } = await supabase.from("ai_agent_threads")
      .update({ customer_id: customerId, user_role: userRole || "customer", agent_kind: agentKind, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id,title")
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from("ai_agent_threads")
    .insert({ session_id: sessionId, customer_id: customerId, user_role: userRole || "customer", agent_kind: agentKind, title: clean(title) || "New chat", updated_at: new Date().toISOString() })
    .select("id,title")
    .single();
  if (error) throw error;
  return data;
}

async function listThreads(supabase: ReturnType<typeof createClient>, customerId: string, agentKind: string) {
  const { data, error } = await supabase.from("ai_agent_threads")
    .select("id,session_id,title,last_intent,last_pooja_slug,updated_at,created_at")
    .eq("customer_id", customerId)
    .eq("agent_kind", agentKind)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data || [];
}

async function loadPoojas(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.from("poojas")
    .select("slug,name,description,duration_minutes,base_price_inr")
    .eq("is_active", true)
    .order("base_price_inr", { ascending: true });
  if (error) throw error;
  return (data || []) as Pooja[];
}

async function loadPriests(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.from("priest_profiles")
    .select("id,display_name,bio,years_experience,languages,service_areas,pooja_slugs,rating,review_count,tradition")
    .eq("verification_status", "verified")
    .order("rating", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []) as Priest[];
}

async function loadHistory(supabase: ReturnType<typeof createClient>, threadId: string, limit = 8) {
  const { data } = await supabase.from("ai_agent_messages")
    .select("role,content,metadata,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data || []).reverse().map((message) => ({
    role: message.role,
    content: message.content,
    actions: message.metadata?.actions || [],
    created_at: message.created_at,
  }));
}

async function loadOpenAIKeyFromSupabase(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase.rpc("get_openai_api_key_for_edge");
  if (error || !data) return "";
  return String(data);
}

async function buildPlanWithOpenAI(input: { message: string; poojas: Pooja[]; priests: Priest[]; history: { role: string; content: string }[]; language: string; apiKey: string }) {
  if (!input.apiKey) return { ...deterministicPlan(input.message, input.poojas), ai_provider: "deterministic_missing_openai_key" };

  const prompt = {
    available_poojas: input.poojas.map(({ slug, name, duration_minutes, base_price_inr }) => ({ slug, name, duration_minutes, base_price_inr })),
    priest_supply_by_tag: input.poojas.map((pooja) => ({
      slug: pooja.slug,
      priests: input.priests.filter((priest) => priest.pooja_slugs?.includes(pooja.slug)).slice(0, 6).map((priest) => ({
        name: priest.display_name,
        rating: priest.rating,
        years_experience: priest.years_experience,
        languages: priest.languages,
        areas: priest.service_areas,
      })),
    })),
    recent_chat: input.history,
    user_message: input.message,
    language: input.language,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are PuroMitra AI for Purohith Connect. Classify user intent, identify the pooja slug, extract request details, and reply warmly. Return only JSON with keys: intent, pooja_slug, should_create_request, ceremony_date, ceremony_time, address, landmark, budget_min_inr, budget_max_inr, notes, reply. Use ISO date YYYY-MM-DD and 24h HH:MM. Do not create or promise a direct booking. If the user says book/hire/find, help them find matching purohit profiles. Set should_create_request true only when the user asks for proposals, bids, quotes, or request-for-proposals and has supplied an address or area.",
        },
        { role: "user", content: JSON.stringify(prompt) },
      ],
    }),
  });
  if (!response.ok) return { ...deterministicPlan(input.message, input.poojas), ai_provider: `deterministic_openai_http_${response.status}` };
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  return { ...(JSON.parse(text) as AgentPlan), ai_provider: "openai" };
}

async function buildDAPPlanWithOpenAI(input: { message: string; history: { role: string; content: string }[]; language: string; apiKey: string; userRole: string; currentRoute: string }) {
  if (!input.apiKey) return { ...deterministicDAPPlan(input.message, input.userRole), ai_provider: "deterministic_missing_openai_key" };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are Purohith Connect DAP, a digital adoption assistant. Help customers and purohits understand the app, find the right screen, and complete tasks. Return only JSON with keys: intent, pooja_slug, should_create_request, ceremony_date, ceremony_time, address, landmark, budget_min_inr, budget_max_inr, notes, reply. Keep reply short, instructional, and mention one next step. Do not perform payments or direct bookings.",
        },
        { role: "user", content: JSON.stringify({ user_role: input.userRole, current_route: input.currentRoute, recent_chat: input.history, user_message: input.message, language: input.language }) },
      ],
    }),
  });
  if (!response.ok) return { ...deterministicDAPPlan(input.message, input.userRole), ai_provider: `deterministic_openai_http_${response.status}` };
  const data = await response.json();
  return { ...(JSON.parse(data.choices?.[0]?.message?.content || "{}") as AgentPlan), ai_provider: "openai" };
}

function deterministicDAPPlan(message: string, userRole: string): AgentPlan {
  const lower = message.toLowerCase();
  const intent = lower.includes("message") || lower.includes("chat")
    ? "go_messages"
    : lower.includes("booking") || lower.includes("proposal") || lower.includes("request")
      ? "go_bookings"
      : lower.includes("profile")
        ? "go_profile"
        : lower.includes("availability")
          ? "go_availability"
          : "platform_help";
  return {
    intent,
    pooja_slug: null,
    should_create_request: false,
    ceremony_date: null,
    ceremony_time: null,
    address: null,
    landmark: "",
    budget_min_inr: null,
    budget_max_inr: null,
    notes: message,
    reply: userRole === "priest"
      ? "I can guide you through requests, messages, availability, and profile setup. Tell me what you want to complete."
      : "I can guide you through finding poojas, comparing purohits, requesting proposals, messages, and profile settings.",
  };
}

function dapActionsForMessage(message: string, userRole: string) {
  const lower = message.toLowerCase();
  const actions = [];
  if (userRole === "priest") {
    if (lower.includes("request") || lower.includes("proposal") || lower.includes("bid")) actions.push({ type: "navigate", label: "Open requests", target: "Marketplace" });
    if (lower.includes("availability") || lower.includes("calendar")) actions.push({ type: "navigate", label: "Open availability", target: "Availability" });
    if (lower.includes("message") || lower.includes("chat")) actions.push({ type: "navigate", label: "Open messages", target: "Messages" });
    if (lower.includes("profile")) actions.push({ type: "navigate", label: "Open profile", target: "Profile" });
  } else {
    if (lower.includes("pooja") || lower.includes("purohit") || lower.includes("priest") || lower.includes("find")) actions.push({ type: "navigate", label: "Open home", target: "Home" });
    if (lower.includes("proposal") || lower.includes("request") || lower.includes("book")) actions.push({ type: "navigate", label: "Request proposals", target: "RequestPooja" });
    if (lower.includes("message") || lower.includes("chat")) actions.push({ type: "navigate", label: "Open messages", target: "Messages" });
    if (lower.includes("profile")) actions.push({ type: "navigate", label: "Open profile", target: "Profile" });
  }
  return actions.slice(0, 3);
}

function normalizePlan(plan: Partial<AgentPlan>, message: string, poojas: Pooja[]): AgentPlan {
  const fallback = deterministicPlan(message, poojas);
  const poojaSlug = plan.pooja_slug && poojas.some((pooja) => pooja.slug === plan.pooja_slug) ? plan.pooja_slug : fallback.pooja_slug;
  return {
    intent: String(plan.intent || fallback.intent || "general_help"),
    pooja_slug: poojaSlug || null,
    should_create_request: Boolean(plan.should_create_request ?? fallback.should_create_request),
    ceremony_date: validDate(plan.ceremony_date) ? plan.ceremony_date! : fallback.ceremony_date,
    ceremony_time: validTime(plan.ceremony_time) ? plan.ceremony_time! : fallback.ceremony_time,
    address: clean(plan.address) || fallback.address,
    landmark: clean(plan.landmark) || "",
    budget_min_inr: numberOrNull(plan.budget_min_inr),
    budget_max_inr: numberOrNull(plan.budget_max_inr),
    notes: clean(plan.notes) || message,
    reply: clean(plan.reply) || fallback.reply,
    ai_provider: clean(plan.ai_provider) || "deterministic",
  };
}

function deterministicPlan(message: string, poojas: Pooja[]): AgentPlan {
  const lower = message.toLowerCase();
  const slug = detectPoojaSlug(lower, poojas);
  const shouldCreate = /\b(request|proposal|proposals|bid|bids|quote|quotes)\b/.test(lower);
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const address = extractAddress(message);
  return {
    intent: shouldCreate ? "create_request" : "general_help",
    pooja_slug: slug,
    should_create_request: shouldCreate,
    ceremony_date: tomorrow.toISOString().slice(0, 10),
    ceremony_time: "09:00",
    address,
    landmark: "",
    budget_min_inr: null,
    budget_max_inr: null,
    notes: message,
    reply: slug
      ? `I found the ceremony tag for ${poojas.find((pooja) => pooja.slug === slug)?.name}. I can show verified purohit profiles or help you request proposals.`
      : "Tell me which puja you need and the ceremony area, and I can match verified purohits for proposals.",
  };
}

function detectPoojaSlug(lower: string, poojas: Pooja[]) {
  const aliases: Record<string, string[]> = {
    "satyanarayan": ["satyanarayan", "satyanarayana", "satya narayan"],
    "griha-pravesh": ["griha", "gruha", "housewarming", "home warming", "pravesh"],
    "rudrabhishek": ["rudra", "abhishek", "rudrabhisheka"],
    "gauri-ganesha-vratha": ["gauri", "gowri", "ganesha vrata", "ganesh vrata"],
    "ganesh-pooja": ["ganesh pooja", "ganesha pooja", "ganapati"],
    "ayudha-puja": ["ayudha", "ayudha puja", "tools puja"],
    "navagraha-shanti": ["navagraha", "graha shanti"],
    "varamahalakshmi-vratha": ["varamahalakshmi", "lakshmi vrata"],
    "namakarna": ["namakarna", "naming ceremony"],
    "vivaha": ["vivaha", "wedding", "marriage"],
  };
  for (const [slug, names] of Object.entries(aliases)) {
    if (names.some((name) => lower.includes(name)) && poojas.some((pooja) => pooja.slug === slug)) return slug;
  }
  return poojas.find((pooja) => lower.includes(pooja.name.toLowerCase()))?.slug || null;
}

function extractAddress(message: string) {
  const match = message.match(/\b(?:in|at|near)\s+([A-Za-z0-9 ,.-]{8,})$/i);
  return match ? match[1].trim() : "";
}

async function createCeremonyRequest(supabase: ReturnType<typeof createClient>, input: { customerId: string; pooja: Pooja; plan: AgentPlan }) {
  const { data, error } = await supabase.from("ceremony_requests")
    .insert({
      customer_id: input.customerId,
      pooja_slug: input.pooja.slug,
      ceremony_date: input.plan.ceremony_date,
      ceremony_time: `${input.plan.ceremony_time}:00`,
      address: input.plan.address || FALLBACK_AREA,
      landmark: input.plan.landmark || "",
      notes: input.plan.notes || "",
      budget_min_inr: input.plan.budget_min_inr,
      budget_max_inr: input.plan.budget_max_inr,
      status: "open",
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    })
    .select("id,pooja_slug,ceremony_date,ceremony_time,address,landmark")
    .single();
  if (error) throw error;
  return { ...data, lat: null, lng: null };
}

function composeFallbackReply(plan: AgentPlan, pooja: Pooja | null, priests: Priest[]) {
  if (!pooja) return "I can help you choose the right puja. Tell me the ceremony, date, and area.";
  const price = Number(pooja.base_price_inr || 0).toLocaleString("en-IN");
  return `${pooja.name} usually takes about ${Math.round((pooja.duration_minutes || 120) / 60)} hours and starts around Rs ${price}. I found ${priests.length} verified purohits for this tag.`;
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : null;
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validTime(value: unknown) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function titleForThread(currentTitle: string, message: string, fallback: string | undefined) {
  if (currentTitle && currentTitle !== "New chat") return currentTitle;
  const cleanMessage = message.replace(/\s+/g, " ").trim();
  if (cleanMessage) return cleanMessage.length > 42 ? `${cleanMessage.slice(0, 39)}...` : cleanMessage;
  return fallback || "New chat";
}
