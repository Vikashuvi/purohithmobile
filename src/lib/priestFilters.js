import BANGALORE_AREAS from "../data/bangalore-areas.json";

export const POOJA_FILTERS = [
  ["all", "All Pujas"],
  ["gauri-ganesha-vratha", "Gauri Ganesha"],
  ["rudrabhishek", "Rudra Abhishek"],
  ["satyanarayan", "Satyanarayana"],
  ["griha-pravesh", "Griha Pravesh"],
  ["ayudha-puja", "Ayudha Puja"],
  ["navagraha-shanti", "Navagraha Shanti"],
  ["varamahalakshmi-vratha", "Varalakshmi"],
  ["namakarna", "Namakarna"],
  ["vivaha", "Vivaha"],
];

export const LANGUAGE_FILTERS = ["All", "Kannada", "Sanskrit", "Hindi", "Marathi", "Tamil", "Telugu", "English", "Malayalam"];

const ZONE_ORDER = ["South", "South East", "East", "Central", "West", "North", "North East"];
export const AREA_FILTERS = ["All", "Bengaluru", ...ZONE_ORDER];

// Bands follow the rate card (from ₹100) and split on the starting fee so each priest lands in one band.
export const PRICE_BANDS = [
  { label: "All", min: 0, max: 0 },
  { label: "Up to ₹1,000", min: 1, max: 1000 },
  { label: "₹1,001 – ₹2,500", min: 1001, max: 2500 },
  { label: "₹2,501 – ₹5,000", min: 2501, max: 5000 },
  { label: "₹5,001 – ₹15,000", min: 5001, max: 15000 },
  { label: "Above ₹15,000", min: 15001, max: 0 },
];

const LOCALITY_ZONE = new Map(BANGALORE_AREAS.map((area) => [area.name.toLowerCase(), area.zone]));

export function labelForCategory(value) {
  return POOJA_FILTERS.find(([slug]) => slug === value)?.[1] || "All Pujas";
}

export function normalizeAreaFilter(value) {
  if (!value || value === "All") return "All";
  if (AREA_FILTERS.includes(value)) return value;
  if (/bengaluru|bangalore/i.test(value)) return "Bengaluru";
  return LOCALITY_ZONE.get(String(value).trim().toLowerCase()) || "All";
}

export function matchesLanguage(languages, language) {
  if (!language || language === "All") return true;
  const target = language.trim().toLowerCase();
  return (languages || []).some((item) => String(item).trim().toLowerCase() === target);
}

export function matchesCategory(slugs, category) {
  if (!category || category === "all") return true;
  return (slugs || []).includes(category);
}

export function matchesArea(areas, zone) {
  if (!zone || zone === "All") return true;
  const values = (areas || []).map((item) => String(item).trim().toLowerCase());
  if (zone === "Bengaluru") {
    return values.some((value) => LOCALITY_ZONE.has(value) || value.includes("bengaluru") || value.includes("bangalore"));
  }
  return values.some((value) => LOCALITY_ZONE.get(value) === zone);
}

export function matchesPrice(priest, band) {
  if (!band || band.label === "All" || (band.min === 0 && band.max === 0)) return true;
  const starting = Number(priest?.starting_price_inr);
  if (!Number.isFinite(starting) || starting <= 0) return false;
  if (band.min > 0 && starting < band.min) return false;
  if (band.max > 0 && starting > band.max) return false;
  return true;
}

export function matchesSearch(priest, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const languages = priest.languages || [];
  const areas = priest.areas || priest.service_areas || [];
  const slugs = priest.pooja_slugs || priest.pooja_specialties || [];
  const text = [priest.name, priest.display_name, priest.tradition, priest.bio, ...languages, ...areas, ...slugs].join(" ").toLowerCase();
  return text.includes(q);
}
