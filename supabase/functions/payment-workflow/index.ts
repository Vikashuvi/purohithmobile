import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const UPI_ID = "sgmsfreshmindsservicesllp.8050934625.ibz@icici";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, getSupabaseSecretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (body.action === "create_request") return createRequest(supabase, body);
    if (body.action === "submit_payment") return submitPayment(supabase, body);
    if (body.action === "list_proposals") return listProposals(supabase, body);
    if (body.action === "award_proposal") return awardProposal(supabase, body);
    if (body.action === "provider_requests") return providerRequests(supabase, body);
    if (body.action === "send_proposal") return sendProposal(supabase, body);
    if (body.action === "direct_booking_payment") return directBookingPayment(supabase, body);
    if (body.action === "admin_verify_payment") return adminVerifyPayment(supabase, body);

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: String(error?.message || error) }, 500);
  }
});

async function createRequest(supabase: any, body: any) {
  const customerId = cleanUuid(body.customer_id);
  if (!customerId) return json({ error: "Customer session is required" }, 401);
  if (!clean(body.address) || !clean(body.pooja_slug)) return json({ error: "Ceremony and address are required" }, 400);

  const { data: pooja } = await supabase.from("poojas").select("slug,name,base_price_inr").eq("slug", clean(body.pooja_slug)).maybeSingle();
  const payload = {
    customer_id: customerId,
    pooja_slug: clean(body.pooja_slug),
    ceremony_date: clean(body.ceremony_date),
    ceremony_time: clean(body.ceremony_time),
    address: clean(body.address),
    landmark: clean(body.landmark),
    notes: clean(body.notes),
    budget_min_inr: numberOrNull(body.budget_min_inr ?? body.budget_min),
    budget_max_inr: numberOrNull(body.budget_max_inr ?? body.budget_max),
    latitude: numberOrNull(body.lat ?? body.latitude),
    longitude: numberOrNull(body.lng ?? body.longitude),
    status: "open",
    payment_status: "unpaid",
  };
  const { data, error } = await supabase.from("ceremony_requests").insert(payload).select("*").single();
  if (error) throw error;
  return json({
    request: mapRequest(data, pooja),
    upi_id: UPI_ID,
    recommended_amount_inr: payload.budget_max_inr || payload.budget_min_inr || pooja?.base_price_inr || 1000,
  });
}

async function submitPayment(supabase: any, body: any) {
  const requestId = cleanUuid(body.request_id);
  const bookingId = cleanUuid(body.booking_id);
  if (!requestId && !bookingId) return json({ error: "Request or booking id is required" }, 400);
  const amount = Number(body.amount_inr || 0);
  if (!amount || amount < 1) return json({ error: "Payment amount is required" }, 400);

  const context = requestId ? await loadRequestContext(supabase, requestId) : await loadBookingContext(supabase, bookingId);
  if (!context) return json({ error: "Payment context not found" }, 404);

  const ai = await verifyScreenshotWithOpenAI(supabase, body.screenshot_data_url, amount);
  const status = ai.verified && ai.confidence >= 0.7 ? "ai_verified" : "submitted";
  const invoiceNumber = makeInvoiceNumber();
  const invoiceHtml = renderInvoice({
    invoiceNumber,
    amount,
    customerName: context.customer_name || "Customer",
    poojaName: context.pooja_name || clean(body.pooja_name) || "Purohith Connect Ceremony",
    ceremonyDate: context.ceremony_date || context.booking_date || "",
    ceremonyTime: context.ceremony_time || context.booking_time || "",
    address: context.address || "",
    upiId: UPI_ID,
    status,
  });

  const { data: payment, error } = await supabase.from("payment_submissions").insert({
    request_id: requestId,
    booking_id: bookingId,
    customer_id: context.customer_id,
    priest_id: context.priest_id || null,
    pooja_slug: context.pooja_slug || clean(body.pooja_slug),
    pooja_name: context.pooja_name || clean(body.pooja_name),
    amount_inr: amount,
    upi_id: UPI_ID,
    status,
    screenshot_data_url: clean(body.screenshot_data_url),
    ai_verified: ai.verified,
    ai_confidence: ai.confidence,
    ai_summary: ai.summary,
    ai_provider: ai.provider,
    invoice_number: invoiceNumber,
    invoice_html: invoiceHtml,
    metadata: { verification: ai.raw || null },
  }).select("*").single();
  if (error) throw error;

  if (requestId) {
    await supabase.from("ceremony_requests").update({
      payment_status: status,
      payment_submission_id: payment.id,
      invoice_number: invoiceNumber,
      status: "open",
      updated_at: new Date().toISOString(),
    }).eq("id", requestId);
  }
  if (bookingId) {
    await supabase.from("bookings").update({
      payment_status: status,
      payment_submission_id: payment.id,
      invoice_no: invoiceNumber,
      invoice_html: invoiceHtml,
      updated_at: new Date().toISOString(),
    }).eq("id", bookingId);
  }

  return json({ payment, invoice_number: invoiceNumber, invoice_html: invoiceHtml, ai, upi_id: UPI_ID });
}

async function listProposals(supabase: any, body: any) {
  const requestId = cleanUuid(body.request_id);
  if (!requestId) return json({ proposals: [] });
  const { data, error } = await supabase.from("ceremony_proposals")
    .select("id,request_id,priest_id,amount_inr,message,includes_samagri,status,created_at,priest_profiles(display_name,rating,review_count,photo_url)")
    .eq("request_id", requestId)
    .order("amount_inr", { ascending: true });
  if (error) throw error;
  return json({ proposals: (data || []).map(mapProposal) });
}

async function awardProposal(supabase: any, body: any) {
  const requestId = cleanUuid(body.request_id);
  const proposalId = cleanUuid(body.proposal_id);
  if (!requestId || !proposalId) return json({ error: "Request and proposal are required" }, 400);
  const { data: proposal, error } = await supabase.from("ceremony_proposals").select("*").eq("id", proposalId).eq("request_id", requestId).maybeSingle();
  if (error) throw error;
  if (!proposal) return json({ error: "Proposal not found" }, 404);
  const { data: request } = await supabase.from("ceremony_requests").select("id,pooja_slug,ceremony_date,ceremony_time,address,landmark,latitude,longitude").eq("id", requestId).maybeSingle();
  const { data: pooja } = request?.pooja_slug ? await supabase.from("poojas").select("name").eq("slug", request.pooja_slug).maybeSingle() : { data: null };
  const { data: priest } = proposal.priest_id ? await supabase.from("priest_profiles").select("display_name,rating,review_count,photo_url").eq("id", proposal.priest_id).maybeSingle() : { data: null };
  await supabase.from("ceremony_proposals").update({ status: "declined" }).eq("request_id", requestId).neq("id", proposalId);
  await supabase.from("ceremony_proposals").update({ status: "accepted" }).eq("id", proposalId);
  await supabase.from("ceremony_requests").update({ awarded_proposal_id: proposalId, status: "awarded", payment_status: "unpaid", updated_at: new Date().toISOString() }).eq("id", requestId);
  return json({
    proposal_id: proposalId,
    priest_id: proposal.priest_id,
    status: "awarded",
    upi_id: UPI_ID,
    amount_inr: proposal.amount_inr,
    proposal: mapProposal({ ...proposal, status: "accepted", priest_profiles: priest }),
    request: mapRequest(request, pooja),
  });
}

async function providerRequests(supabase: any, body: any) {
  const userId = cleanUuid(body.user_id);
  if (!userId) return json({ requests: [] });
  const { data: priest } = await supabase.from("priest_profiles").select("id,pooja_slugs").eq("user_id", userId).maybeSingle();
  if (!priest) return json({ requests: [] });

  const { data, error } = await supabase.from("ceremony_requests")
    .select("id,customer_id,pooja_slug,ceremony_date,ceremony_time,address,landmark,notes,budget_min_inr,budget_max_inr,status,payment_status,payment_submission_id,invoice_number,latitude,longitude,created_at")
    .eq("status", "open");
  if (error) throw error;

  const filtered = (data || []).filter((item: any) => (priest.pooja_slugs || []).includes(item.pooja_slug));
  const poojaSlugs = [...new Set(filtered.map((item: any) => item.pooja_slug))];
  const { data: poojas } = poojaSlugs.length ? await supabase.from("poojas").select("slug,name").in("slug", poojaSlugs) : { data: [] };
  const poojaNames = Object.fromEntries((poojas || []).map((pooja: any) => [pooja.slug, pooja.name]));
  const requestIds = filtered.map((item: any) => item.id);
  let myProposals: Record<string, any> = {};
  if (requestIds.length) {
    const { data: proposals } = await supabase.from("ceremony_proposals").select("request_id,status,amount_inr").eq("priest_id", priest.id).in("request_id", requestIds);
    myProposals = Object.fromEntries((proposals || []).map((item: any) => [item.request_id, item]));
  }
  return json({ requests: filtered.map((item: any) => mapProviderRequest({ ...item, pooja_name: poojaNames[item.pooja_slug] }, myProposals[item.id])) });
}

async function sendProposal(supabase: any, body: any) {
  const userId = cleanUuid(body.user_id);
  const requestId = cleanUuid(body.request_id);
  const amount = Number(body.amount_inr || body.amount || 0);
  if (!userId || !requestId || amount < 1) return json({ error: "Priest, request, and amount are required" }, 400);
  const { data: priest } = await supabase.from("priest_profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!priest) return json({ error: "Priest profile not found" }, 404);
  const { data, error } = await supabase.from("ceremony_proposals").upsert({
    request_id: requestId,
    priest_id: priest.id,
    amount_inr: amount,
    message: clean(body.message) || "I am available and would be happy to conduct this ceremony.",
    includes_samagri: Boolean(body.includes_samagri),
    status: "active",
    updated_at: new Date().toISOString(),
  }, { onConflict: "request_id,priest_id" }).select("*").single();
  if (error) throw error;
  return json({ proposal: data });
}

async function directBookingPayment(supabase: any, body: any) {
  const customerId = cleanUuid(body.customer_id);
  const priestId = cleanUuid(body.priest_id);
  if (!customerId || !priestId) return json({ error: "Customer and priest are required" }, 400);
  const { data: customer } = await supabase.from("app_users").select("full_name,phone,email").eq("id", customerId).maybeSingle();
  const { data: priest } = await supabase.from("priest_profiles").select("id,display_name").eq("id", priestId).maybeSingle();
  const { data: pooja } = await supabase.from("poojas").select("slug,name,base_price_inr").eq("slug", clean(body.pooja_slug)).maybeSingle();
  if (!priest || !pooja) return json({ error: "Priest or pooja was not found" }, 404);
  const total = Number(body.amount_inr || body.total_inr || pooja.base_price_inr || 1000);
  const subtotal = Math.round(total / 1.18);
  const gst = total - subtotal;
  const { data: booking, error } = await supabase.from("bookings").insert({
    customer_id: customerId,
    priest_id: priestId,
    pooja_slug: pooja.slug,
    booking_date: clean(body.booking_date),
    booking_time: clean(body.booking_time),
    address: clean(body.address),
    landmark: clean(body.landmark),
    notes: clean(body.notes),
    subtotal_inr: subtotal,
    gst_inr: gst,
    total_inr: total,
    status: "pending",
    payment_status: "submitted",
    customer_name: customer?.full_name || "Customer",
    customer_phone: customer?.phone || "9000000000",
    customer_email: customer?.email || clean(body.customer_email) || "customer@purohithconnect.com",
    priest_name: priest.display_name,
    pooja_name: pooja.name,
    pooja_price_inr: pooja.base_price_inr,
    addons_total_inr: Math.max(0, total - pooja.base_price_inr),
  }).select("*").single();
  if (error) throw error;
  const paymentResult = await submitPayment(supabase, { ...body, booking_id: booking.id, amount_inr: total, pooja_name: pooja.name, pooja_slug: pooja.slug });
  const paymentPayload = await paymentResult.json();
  return json({ booking: { ...booking, invoice_no: paymentPayload.invoice_number, payment_status: paymentPayload.payment?.status }, ...paymentPayload });
}

async function adminVerifyPayment(supabase: any, body: any) {
  const paymentId = cleanUuid(body.payment_submission_id);
  if (!paymentId) return json({ error: "Payment submission is required" }, 400);
  const { data: payment, error } = await supabase.from("payment_submissions").select("*").eq("id", paymentId).maybeSingle();
  if (error) throw error;
  if (!payment) return json({ error: "Payment not found" }, 404);

  await supabase.from("payment_submissions").update({
    status: "admin_verified",
    admin_verified_at: new Date().toISOString(),
    verified_by: cleanUuid(body.admin_user_id),
    updated_at: new Date().toISOString(),
  }).eq("id", paymentId);

  if (payment.request_id) {
    await supabase.from("ceremony_requests").update({ payment_status: "admin_verified", status: "open", updated_at: new Date().toISOString() }).eq("id", payment.request_id);
    const { data: request } = await supabase.from("ceremony_requests").select("pooja_slug,address,ceremony_date,ceremony_time").eq("id", payment.request_id).maybeSingle();
    const { data: pooja } = request?.pooja_slug ? await supabase.from("poojas").select("name").eq("slug", request.pooja_slug).maybeSingle() : { data: null };
    const { data: priests } = await supabase.from("priest_profiles").select("id").contains("pooja_slugs", [request?.pooja_slug]);
    if (priests?.length) {
      await supabase.from("provider_notifications").insert(priests.map((priest: any) => ({
        priest_id: priest.id,
        request_id: payment.request_id,
        payment_submission_id: payment.id,
        title: `${pooja?.name || payment.pooja_name} request verified`,
        body: `${request?.ceremony_date || ""} ${request?.ceremony_time || ""} · ${request?.address || ""}`,
      })));
    }
  }

  return json({ status: "admin_verified" });
}

async function loadRequestContext(supabase: any, requestId: string) {
  const { data } = await supabase.from("ceremony_requests")
    .select("*,app_users(full_name,phone,email)")
    .eq("id", requestId).maybeSingle();
  if (!data) return null;
  const { data: pooja } = data.pooja_slug ? await supabase.from("poojas").select("name,base_price_inr").eq("slug", data.pooja_slug).maybeSingle() : { data: null };
  const { data: proposal } = data.awarded_proposal_id ? await supabase.from("ceremony_proposals").select("priest_id,amount_inr").eq("id", data.awarded_proposal_id).maybeSingle() : { data: null };
  return {
    ...data,
    priest_id: proposal?.priest_id || data.priest_id,
    customer_name: data.app_users?.full_name,
    pooja_name: pooja?.name,
  };
}

async function loadBookingContext(supabase: any, bookingId: string) {
  const { data } = await supabase.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  return data;
}

async function verifyScreenshotWithOpenAI(supabase: any, screenshotDataUrl: string, amount: number) {
  const fallback = { verified: false, confidence: 0.45, summary: "Screenshot received. Admin verification is still required before assigning the ceremony.", provider: "manual_review" };
  if (!screenshotDataUrl || !screenshotDataUrl.startsWith("data:image/")) return { ...fallback, summary: "No valid image was attached, so the payment is waiting for manual verification." };
  const apiKey = await getOpenAIKey(supabase);
  if (!apiKey) return fallback;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          { role: "system", content: "You verify Indian UPI payment screenshots for an admin review queue. Return only JSON with keys verified boolean, confidence number 0-1, amount_inr number|null, payee_upi string|null, summary string. Never claim bank-settled certainty." },
          { role: "user", content: [
            { type: "text", text: `Expected payee UPI: ${UPI_ID}. Expected amount INR: ${amount}. Check whether the screenshot appears to show a completed/successful UPI payment to this payee. This is an AI estimate; admin will manually verify.` },
            { type: "image_url", image_url: { url: screenshotDataUrl } },
          ] },
        ],
      }),
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content.replace(/^```json/i, "").replace(/```$/i, "").trim());
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence || 0)));
    return {
      verified: Boolean(parsed.verified) && confidence >= 0.7,
      confidence,
      summary: clean(parsed.summary) || "AI reviewed the payment screenshot.",
      provider: "openai:gpt-4o-mini",
      raw: parsed,
    };
  } catch (error) {
    return { ...fallback, summary: `AI verification could not complete. Admin review required. ${String(error?.message || "")}`.trim() };
  }
}

async function getOpenAIKey(supabase: any) {
  const { data, error } = await supabase.rpc("get_openai_api_key_for_edge");
  if (error) return "";
  return typeof data === "string" ? data : data?.api_key || "";
}

function mapRequest(row: any, pooja: any) {
  return {
    id: row.id,
    pooja_slug: row.pooja_slug,
    pooja_name: pooja?.name || row.pooja_slug,
    ceremony_date: row.ceremony_date,
    ceremony_time: row.ceremony_time,
    address: row.address,
    landmark: row.landmark,
    lat: row.latitude,
    lng: row.longitude,
    payment_status: row.payment_status,
  };
}

function mapProposal(row: any) {
  const priest = Array.isArray(row.priest_profiles) ? row.priest_profiles[0] : row.priest_profiles;
  return {
    id: row.id,
    request_id: row.request_id,
    priest_id: row.priest_id,
    priest_name: priest?.display_name || "Verified purohit",
    amount: row.amount_inr,
    amount_inr: row.amount_inr,
    message: row.message,
    includes_samagri: row.includes_samagri,
    status: row.status,
    rating: priest?.rating || 0,
    review_count: priest?.review_count || 0,
    photo_url: priest?.photo_url || "",
  };
}

function mapProviderRequest(row: any, proposal: any) {
  return {
    id: row.id,
    pooja_slug: row.pooja_slug,
    pooja_name: row.pooja_name || row.pooja_slug,
    ceremony_date: row.ceremony_date,
    ceremony_time: row.ceremony_time,
    address: row.address,
    landmark: row.landmark,
    lat: row.latitude,
    lng: row.longitude,
    notes: row.notes,
    budget_min: row.budget_min_inr,
    budget_max: row.budget_max_inr,
    status: row.status,
    payment_status: row.payment_status,
    invoice_number: row.invoice_number,
    my_bid_status: proposal?.status || null,
    my_bid_amount: proposal?.amount_inr || null,
  };
}

function renderInvoice(details: any) {
  const issuedAt = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(details.invoiceNumber)}</title><style>body{font-family:Inter,Arial,sans-serif;margin:0;background:#f7f4ef;color:#1f1f1d}.invoice{max-width:760px;margin:32px auto;background:#fff;border:1px solid #e6ded2;border-radius:22px;padding:34px}.brand{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #eee2d8;padding-bottom:20px}.name{font-size:24px;font-weight:800}.badge{background:#fff1eb;color:#d84616;border-radius:999px;padding:8px 12px;font-weight:800;font-size:12px}.row{display:flex;justify-content:space-between;border-bottom:1px solid #f0ebe5;padding:14px 0}.muted{color:#6d6861}.total{font-size:28px;font-weight:900}.note{margin-top:22px;padding:16px;background:#fff8f4;border-radius:16px;color:#5d5650}</style></head><body><main class="invoice"><section class="brand"><div><div class="name">Purohith Connect</div><div class="muted">AI-assisted UPI payment acknowledgement</div></div><div class="badge">${escapeHtml(details.status)}</div></section><section><div class="row"><span>Invoice number</span><strong>${escapeHtml(details.invoiceNumber)}</strong></div><div class="row"><span>Issued at</span><strong>${escapeHtml(issuedAt)}</strong></div><div class="row"><span>Customer</span><strong>${escapeHtml(details.customerName)}</strong></div><div class="row"><span>Ceremony</span><strong>${escapeHtml(details.poojaName)}</strong></div><div class="row"><span>Date and time</span><strong>${escapeHtml(`${details.ceremonyDate} ${details.ceremonyTime}`)}</strong></div><div class="row"><span>Address</span><strong>${escapeHtml(details.address)}</strong></div><div class="row"><span>UPI paid to</span><strong>${escapeHtml(details.upiId)}</strong></div><div class="row"><span>Total</span><strong class="total">₹${Number(details.amount).toLocaleString("en-IN")}</strong></div></section><p class="note">This invoice is generated from a customer-uploaded UPI screenshot. Admin verification is required before provider assignment or payout release.</p></main></body></html>`;
}

function makeInvoiceNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `PCI-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanUuid(value: unknown) {
  const text = clean(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] || char));
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
