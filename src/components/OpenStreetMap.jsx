import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";
import { isValidCoordinate } from "../lib/maps";

function safeText(value) {
  return String(value || "").replace(/[<>&"']/g, (match) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&#39;" }[match]));
}

// Default Bengaluru center coordinates if none provided
const DEFAULT_LAT = 12.9716;
const DEFAULT_LNG = 77.5946;

function generateMapHtml({ latitude, longitude, title, address }) {
  const lat = isValidCoordinate(latitude, longitude) ? Number(latitude) : DEFAULT_LAT;
  const lng = isValidCoordinate(latitude, longitude) ? Number(longitude) : DEFAULT_LNG;
  const safeTitle = safeText(title || "Purohith Connect Location");
  const safeAddress = safeText(address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  const popupHtml = `<strong>${safeTitle}</strong><br/><span style="color:#666;font-size:12px;">${safeAddress}</span>`.replace(/"/g, '\\"');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; background: #F8F5EF; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .badge {
      position: absolute; top: 12px; left: 12px; z-index: 1000;
      background: #FFFFFF; color: #1E1B18; border: 1px solid #E8E0D5;
      border-radius: 20px; padding: 7px 14px; font-size: 11px; font-weight: 700;
      box-shadow: 0 4px 14px rgba(0,0,0,0.12); display: flex; align-items: center; gap: 6px;
    }
    .badge-dot { width: 8px; height: 8px; border-radius: 4px; background: #E05638; display: inline-block; }
    .leaflet-popup-content-wrapper { border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); font-family: inherit; }
    .leaflet-popup-content { margin: 10px 14px; font-size: 13px; line-height: 1.45; color: #1E1B18; }
    .custom-pin { filter: drop-shadow(0 3px 6px rgba(0,0,0,0.25)); }
  </style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
</head>
<body>
  <div class="badge"><span class="badge-dot"></span>Purohith Connect Map</div>
  <div id="map"></div>
  <script>
    (function() {
      try {
        var lat = ${lat};
        var lng = ${lng};
        var map = L.map("map", { zoomControl: true, attributionControl: false }).setView([lat, lng], 15);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19
        }).addTo(map);

        var saffronIcon = L.divIcon({
          className: "custom-pin",
          html: '<div style="background:#E05638;width:30px;height:30px;border-radius:15px 15px 15px 0;transform:rotate(-45deg);border:2px solid #FFFFFF;display:flex;align-items:center;justify-content:center;"><div style="width:10px;height:10px;background:#FFFFFF;border-radius:5px;transform:rotate(45deg);"></div></div>',
          iconSize: [30, 30],
          iconAnchor: [15, 30],
          popupAnchor: [0, -30]
        });

        var marker = L.marker([lat, lng], { icon: saffronIcon }).addTo(map);
        marker.bindPopup("${popupHtml}").openPopup();

        setTimeout(function() { map.invalidateSize(); }, 350);
      } catch (err) {
        console.error("Map initialization failed", err);
      }
    })();
  </script>
</body>
</html>`;
}

export default function OpenStreetMap({ latitude, longitude, title, address, style }) {
  const hasValidCoords = isValidCoordinate(latitude, longitude);
  const effectiveLat = hasValidCoords ? Number(latitude) : DEFAULT_LAT;
  const effectiveLng = hasValidCoords ? Number(longitude) : DEFAULT_LNG;

  const html = generateMapHtml({
    latitude: effectiveLat,
    longitude: effectiveLng,
    title,
    address,
  });

  if (Platform.OS === "web") {
    return (
      <View style={[styles.map, style]}>
        {React.createElement("iframe", {
          srcDoc: html,
          title: "Purohith Connect interactive map",
          style: { width: "100%", height: "100%", border: 0 },
        })}
      </View>
    );
  }

  return (
    <WebView
      source={{ html }}
      style={[styles.map, style]}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      scalesPageToFit
    />
  );
}

const styles = StyleSheet.create({
  map: {
    width: "100%",
    minHeight: 320,
    overflow: "hidden",
    backgroundColor: "#F8F5EF",
  },
});
