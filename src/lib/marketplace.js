import { supabase } from "./supabase";

async function invokeMarketplace(body) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.functions.invoke("purohit-marketplace", { body });
  if (error) throw error;
  return data || {};
}

export async function fetchMarketplacePoojas() {
  return invokeMarketplace({ kind: "poojas" });
}

export async function fetchMarketplaceSettings() {
  return invokeMarketplace({ kind: "settings" });
}

export async function fetchMarketplacePriests(filters = {}) {
  return invokeMarketplace({ kind: "priests", ...filters });
}

export async function fetchMarketplaceProfile(priestId) {
  return invokeMarketplace({ kind: "profile", priest_id: priestId });
}

export async function fetchMyRateCard(userId) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data: profile, error: profileError } = await supabase.from("priest_profiles")
    .select("id,pooja_slugs")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return { profile: null, services: [] };
  const { data: services, error } = await supabase.from("priest_services")
    .select("pooja_slug,price_paise,duration_minutes,includes_samagri,description,is_active")
    .eq("priest_id", profile.id);
  if (error) throw error;
  return { profile, services: services || [] };
}

export async function saveMyRateCard(items) {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.rpc("save_priest_rate_card", { p_items: items });
  if (error) throw error;
  return data || [];
}
