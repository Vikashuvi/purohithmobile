import { Linking } from "react-native";

export function googleMapsUrl({ lat, lng, address }) {
  const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const query = hasCoords ? `${Number(lat)},${Number(lng)}` : address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "")}`;
}

export function openInGoogleMaps(location) {
  return Linking.openURL(googleMapsUrl(location));
}
