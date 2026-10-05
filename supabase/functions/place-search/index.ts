const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BENGALURU = { lat: 12.9716, lng: 77.5946 };
const USER_AGENT = "PurohithConnect/1.0 (place-search)";
const FETCH_TIMEOUT_MS = 6000;
// Same map key the app ships in app.json (public); it only covers map tiles and reverse geocoding.
const PUBLIC_MAPPLS_MAP_KEY = "245e028d27385d25b6fedb57230896ee";

let mapplsToken: { value: string; expiresAt: number } | null = null;

type Place = {
  id: string;
  title: string;
  subtitle: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  eloc?: string;
  provider: "mappls" | "osm";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const near = {
      lat: finiteOr(body.lat, BENGALURU.lat),
      lng: finiteOr(body.lng, BENGALURU.lng),
    };

    if (body.action === "autosuggest") {
      const query = String(body.query || "").trim().slice(0, 120);
      if (query.length < 3) return json({ places: [], provider: null });
      const mappls = await mapplsAutosuggest(query, near).catch((error) => {
        console.warn("Mappls autosuggest failed", String(error?.message || error));
        return null;
      });
      if (mappls?.length) return json({ places: mappls, provider: "mappls" });
      return json({ places: await photonSearch(query, near), provider: "osm" });
    }

    if (body.action === "resolve") {
      const eloc = String(body.eloc || "").trim();
      if (!eloc) return json({ error: "eloc is required" }, 400);
      const point = await mapplsResolveEloc(eloc).catch(() => null);
      if (point) return json({ place: point });
      const fallback = await photonSearch(String(body.address || ""), near);
      return json({ place: fallback[0] || null });
    }

    if (body.action === "reverse") {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!isValidCoordinate(lat, lng)) return json({ error: "Valid lat and lng are required" }, 400);
      const mappls = await mapplsReverse(lat, lng).catch(() => null);
      if (mappls) return json({ place: mappls });
      return json({ place: await photonReverse(lat, lng) });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: String(error?.message || error) }, 500);
  }
});

async function getMapplsToken() {
  const clientId = Deno.env.get("MAPPLS_CLIENT_ID");
  const clientSecret = Deno.env.get("MAPPLS_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  if (mapplsToken && mapplsToken.expiresAt > Date.now() + 60_000) return mapplsToken.value;
  const response = await timedFetch("https://outpost.mappls.com/api/security/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  });
  if (!response.ok) throw new Error(`Mappls OAuth failed (${response.status})`);
  const payload = await response.json();
  mapplsToken = { value: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000 };
  return mapplsToken.value;
}

async function mapplsAutosuggest(query: string, near: { lat: number; lng: number }): Promise<Place[] | null> {
  const token = await getMapplsToken();
  if (!token) return null;
  const url = new URL("https://atlas.mappls.com/api/places/search/json");
  url.searchParams.set("query", query);
  url.searchParams.set("location", `${near.lat},${near.lng}`);
  url.searchParams.set("region", "IND");
  const response = await timedFetch(url, { headers: { Authorization: `bearer ${token}` } });
  if (!response.ok) throw new Error(`Mappls autosuggest failed (${response.status})`);
  const payload = await response.json();
  return (payload.suggestedLocations || []).slice(0, 7).map((item: any) => {
    const latitude = Number(item.latitude);
    const longitude = Number(item.longitude);
    const hasCoords = isValidCoordinate(latitude, longitude) && latitude !== 0;
    return {
      id: `mappls:${item.eLoc || item.placeName}`,
      title: item.placeName || "",
      subtitle: item.placeAddress || "",
      address: [item.placeName, item.placeAddress].filter(Boolean).join(", "),
      latitude: hasCoords ? latitude : null,
      longitude: hasCoords ? longitude : null,
      eloc: item.eLoc,
      provider: "mappls" as const,
    };
  });
}

async function mapplsResolveEloc(eloc: string): Promise<Place | null> {
  const token = await getMapplsToken();
  if (!token) return null;
  const response = await timedFetch(`https://explore.mappls.com/apis/O2O/entity/${encodeURIComponent(eloc)}`, {
    headers: { Authorization: `bearer ${token}` },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  if (!isValidCoordinate(latitude, longitude)) return null;
  return {
    id: `mappls:${eloc}`,
    title: payload.placeName || "",
    subtitle: payload.address || "",
    address: [payload.placeName, payload.address].filter(Boolean).join(", "),
    latitude,
    longitude,
    eloc,
    provider: "mappls",
  };
}

async function mapplsReverse(lat: number, lng: number): Promise<Place | null> {
  const key = Deno.env.get("MAPPLS_STATIC_KEY") || PUBLIC_MAPPLS_MAP_KEY;
  const response = await timedFetch(`https://apis.mappls.com/advancedmaps/v1/${encodeURIComponent(key)}/rev_geocode?lat=${lat}&lng=${lng}`);
  if (!response.ok) return null;
  const result = (await response.json())?.results?.[0];
  if (!result) return null;
  const parts = [result.houseNumber, result.houseName, result.poi, result.street, result.subSubLocality, result.subLocality, result.locality, result.city]
    .filter((part: string) => part && String(part).trim());
  const address = [...new Set(parts)].join(", ") + (result.pincode ? ` ${result.pincode}` : "");
  return {
    id: `mappls:rev:${lat},${lng}`,
    title: result.subLocality || result.locality || result.street || "Pinned location",
    subtitle: result.formatted_address || address,
    address: address || result.formatted_address || "",
    latitude: lat,
    longitude: lng,
    provider: "mappls",
  };
}

async function photonSearch(query: string, near: { lat: number; lng: number }): Promise<Place[]> {
  if (!query.trim()) return [];
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("lat", String(near.lat));
  url.searchParams.set("lon", String(near.lng));
  url.searchParams.set("limit", "10");
  url.searchParams.set("lang", "en");
  const response = await timedFetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Place search failed (${response.status})`);
  const payload = await response.json();
  const seen = new Set<string>();
  return (payload.features || [])
    .filter((feature: any) => feature?.properties?.countrycode === "IN")
    .map((feature: any) => photonPlace(feature))
    .filter((place: Place) => {
      const key = place.address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 7);
}

async function photonReverse(lat: number, lng: number): Promise<Place | null> {
  const response = await timedFetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) return null;
  const feature = (await response.json())?.features?.[0];
  if (!feature) return null;
  return { ...photonPlace(feature), latitude: lat, longitude: lng };
}

function photonPlace(feature: any): Place {
  const p = feature.properties || {};
  const [longitude, latitude] = feature.geometry?.coordinates || [];
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const title = p.name || street || p.district || p.city || "Location";
  const locality = [street !== title ? street : "", p.locality, p.district, p.city, p.postcode]
    .filter((part) => part && part !== title);
  const subtitle = [...new Set(locality)].join(", ");
  return {
    id: `osm:${p.osm_type}${p.osm_id}`,
    title,
    subtitle,
    address: [title, subtitle].filter(Boolean).join(", "),
    latitude: Number(latitude),
    longitude: Number(longitude),
    provider: "osm",
  };
}

async function timedFetch(input: string | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isValidCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function finiteOr(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && value !== null && value !== "" ? parsed : fallback;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
