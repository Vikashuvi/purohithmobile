import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../lib/theme";
import { isValidCoordinate, mapplsConfig } from "../lib/maps";

function safeText(value) {
  return String(value || "").replace(/[<>&"']/g, (match) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&#39;" }[match]));
}

function mapplsHtml({ latitude, longitude, title, address }) {
  const token = encodeURIComponent(mapplsConfig.accessToken);
  const lat = Number(latitude);
  const lng = Number(longitude);
  const popup = `<strong>${safeText(title || "Purohith Connect location")}</strong><br/>${safeText(address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`)}`;
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #F8F5EF; font-family: Inter, Arial, sans-serif; }
    .badge { position: absolute; top: 12px; left: 12px; z-index: 5; background: #fff; color: #211F1B; border: 1px solid #E8E0D5; border-radius: 18px; padding: 8px 11px; font: 700 11px Inter, Arial; box-shadow: 0 8px 20px rgba(0,0,0,.12); }
  </style>
  <script src="https://apis.mappls.com/advancedmaps/api/${token}/map_sdk?layer=vector&v=3.0&callback=initMap1" defer async></script>
</head>
<body>
  <div id="map"></div>
  <div class="badge">Mappls verified location</div>
  <script>
    window.initMap1 = function() {
      var map = new mappls.Map("map", { center: [${lat}, ${lng}], zoom: 16, zoomControl: true, location: false });
      new mappls.Marker({ map: map, position: { lat: ${lat}, lng: ${lng} }, fitbounds: true, popupHtml: "${popup.replace(/"/g, '\\"')}" });
    };
  </script>
</body>
</html>`;
}

export default function OpenStreetMap({ latitude, longitude, title, address, style }) {
  if (!isValidCoordinate(latitude, longitude)) {
    return <View style={[styles.map, styles.fallback, style]}><Text style={styles.fallbackTitle}>Location unavailable</Text><Text style={styles.fallbackText}>Add a valid latitude and longitude to preview this address.</Text></View>;
  }
  if (!mapplsConfig.accessToken) {
    return <View style={[styles.map, styles.fallback, style]}><Text style={styles.fallbackEyebrow}>MAPPLS READY</Text><Text style={styles.fallbackTitle}>{title || "Ceremony location"}</Text><Text style={styles.fallbackText}>{address || `${Number(latitude).toFixed(5)}, ${Number(longitude).toFixed(5)}`}</Text><Text style={styles.fallbackHint}>Add EXPO_PUBLIC_MAPPLS_ACCESS_TOKEN to load the live Mappls map.</Text></View>;
  }
  const html = mapplsHtml({ latitude, longitude, title, address });
  if (Platform.OS === "web") {
    return <View style={[styles.map, style]}>{React.createElement("iframe", { srcDoc: html, title: "Mappls Purohith Connect location", style: { width: "100%", height: "100%", border: 0 } })}</View>;
  }
  return <WebView source={{ html }} style={[styles.map, style]} originWhitelist={["https://*", "http://*"]} />;
}

const styles = StyleSheet.create({
  map: { width: "100%", minHeight: 320, overflow: "hidden", backgroundColor: "#F8F5EF" },
  fallback: { alignItems: "flex-start", justifyContent: "center", padding: 20 },
  fallbackEyebrow: { color: colors.saffron, fontSize: 10, fontWeight: "800", letterSpacing: .7, marginBottom: 7 },
  fallbackTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  fallbackText: { color: colors.muted2, fontSize: 12, lineHeight: 18, marginTop: 6 },
  fallbackHint: { color: colors.muted2, fontSize: 10, lineHeight: 15, marginTop: 12 },
});
