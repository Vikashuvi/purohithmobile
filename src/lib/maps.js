import { Linking } from "react-native";
import Constants from "expo-constants";
import { supabase } from "./supabase";

export const mapplsConfig = {
  accessToken: process.env.EXPO_PUBLIC_MAPPLS_ACCESS_TOKEN || Constants.expoConfig?.extra?.mapplsAccessToken || "",
};

async function invokePlaceSearch(body) {
  if (!supabase) throw new Error("Location search is not configured");
  const { data, error } = await supabase.functions.invoke("place-search", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || {};
}

export async function searchPlaces(query, near) {
  const data = await invokePlaceSearch({ action: "autosuggest", query, lat: near?.latitude, lng: near?.longitude });
  return data.places || [];
}

export async function resolvePlace(place) {
  if (isValidCoordinate(place?.latitude, place?.longitude)) return place;
  if (!place?.eloc) return null;
  const data = await invokePlaceSearch({ action: "resolve", eloc: place.eloc, address: place.address });
  return data.place ? { ...place, ...data.place, title: place.title, address: place.address } : null;
}

export async function reverseGeocode(latitude, longitude) {
  const data = await invokePlaceSearch({ action: "reverse", lat: latitude, lng: longitude });
  return data.place || null;
}

export function isValidCoordinate(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function normalizeLocation(location = {}) {
  const source = location || {};
  const latitude = Number(source.latitude ?? source.lat);
  const longitude = Number(source.longitude ?? source.lng);
  return {
    ...source,
    latitude,
    longitude,
    lat: latitude,
    lng: longitude,
    hasCoordinates: isValidCoordinate(latitude, longitude),
  };
}

export function mapplsUrl(location = {}) {
  const point = normalizeLocation(location);
  if (point.hasCoordinates) return `https://maps.mappls.com/@${point.latitude},${point.longitude},16z`;
  return `https://maps.mappls.com/search/${encodeURIComponent(point.address || "")}`;
}

export function mapplsDirectionsUrl(destination = {}, origin = null) {
  const destPoint = normalizeLocation(destination);
  const destQuery = destPoint.hasCoordinates
    ? `${destPoint.latitude},${destPoint.longitude}`
    : encodeURIComponent(destPoint.address || "");

  if (origin) {
    const originPoint = normalizeLocation(origin);
    const originQuery = originPoint.hasCoordinates
      ? `${originPoint.latitude},${originPoint.longitude}`
      : encodeURIComponent(originPoint.address || "");
    return `https://maps.mappls.com/directions?start=${originQuery}&destination=${destQuery}`;
  }
  return `https://maps.mappls.com/directions?destination=${destQuery}`;
}

export function openInMappls(location) {
  return Linking.openURL(mapplsUrl(location));
}

export function openInMapplsDirections(destination, origin) {
  return Linking.openURL(mapplsDirectionsUrl(destination, origin));
}

// Deprecated fallback for backward compatibility
export function googleMapsUrl({ lat, lng, address }) {
  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const query = hasCoords ? `${Number(lat)},${Number(lng)}` : address;
  return `https://maps.mappls.com/search/${encodeURIComponent(query || "")}`;
}

export function openInGoogleMaps(location) {
  return openInMappls(location);
}
