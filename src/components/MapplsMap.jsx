import React, { useEffect, useMemo, useRef, useState } from "react";
import { bindBrandStyles } from "../lib/brandStyles";
import { Platform, View } from "react-native";
import { WebView } from "react-native-webview";
import { isValidCoordinate, mapplsConfig } from "../lib/maps";

function safeText(value) {
  return String(value || "").replace(/[<>&"']/g, (match) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&#39;",
  }[match]));
}

// Default Bengaluru coordinates
const DEFAULT_LAT = 12.9716;
const DEFAULT_LNG = 77.5946;
const WEBVIEW_BASE_URL = "https://purohit-marketplace-project.vercel.app/";
const MAPPLS_LOAD_TIMEOUT_MS = 10000;

function generateMapplsHtml({ latitude, longitude, title, address, token, pickable, frameId }) {
  const lat = isValidCoordinate(latitude, longitude) ? Number(latitude) : DEFAULT_LAT;
  const lng = isValidCoordinate(latitude, longitude) ? Number(longitude) : DEFAULT_LNG;
  const safeTitle = safeText(title || "Purohith Connect Ceremony Location");
  const safeAddress = safeText(address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  const popupHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:4px 2px;"><strong style="font-size:13px;color:#1E1B18;display:block;margin-bottom:3px;">${safeTitle}</strong><span style="color:#6A655F;font-size:11px;line-height:1.4;display:block;">${safeAddress}</span></div>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #map { width: 100%; height: 100%; background: #F8F5EF; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
    .badge {
      position: absolute; top: 12px; left: 12px; z-index: 1000;
      background: #FFFFFF; color: #1E1B18; border: 1px solid #E8E0D5;
      border-radius: 20px; padding: 6px 13px; font-size: 11px; font-weight: 700;
      box-shadow: 0 4px 14px rgba(0,0,0,0.12); display: flex; align-items: center; gap: 6px;
      pointer-events: none;
    }
    .badge-dot { width: 8px; height: 8px; border-radius: 4px; background: #E05638; display: inline-block; animation: pulse 2s infinite; }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
      100% { opacity: 1; transform: scale(1); }
    }
    .mappls-popup-content-wrapper, .leaflet-popup-content-wrapper {
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      border: 1px solid #E8E0D5;
    }
    .mappls-popup-content, .leaflet-popup-content {
      margin: 10px 14px;
    }
  </style>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  ${token ? `<script src="https://apis.mappls.com/advancedmaps/api/${token}/map_sdk?v=3.0&layer=vector"></script>` : ""}
</head>
<body>
  <div class="badge"><span class="badge-dot"></span><span id="badge-text">${pickable ? "Tap map or drag pin" : "Mappls Map"}</span></div>
  <div id="map"></div>

  <script>
    (function() {
      var lat = ${lat};
      var lng = ${lng};
      var pickable = ${pickable ? "true" : "false"};
      var frameId = ${JSON.stringify(frameId || "")};
      var popupHtml = ${JSON.stringify(popupHtml)};
      var initialized = false;

      function post(payload) {
        payload.frameId = frameId;
        payload.source = "purohith-map";
        var message = JSON.stringify(payload);
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
        else if (window.parent && window.parent !== window) window.parent.postMessage(message, "*");
      }

      function reportPick(point, origin) {
        var nextLat = Number(point && point.lat);
        var nextLng = Number(point && point.lng);
        if (!isFinite(nextLat) || !isFinite(nextLng)) return;
        post({ type: "pick", latitude: nextLat, longitude: nextLng, origin: origin });
      }

      function initMapplsMap() {
        if (typeof mappls === "undefined" || typeof mappls.Map !== "function") return false;
        try {
          var map = new mappls.Map("map", {
            center: [lat, lng],
            zoom: pickable ? 16 : 15,
            zoomControl: true,
            hybrid: false,
            clickableIcons: !pickable
          });
          var loaded = false;
          function onMapplsLoad() {
            if (loaded) return;
            loaded = true;
            initialized = true;
            post({ type: "ready", provider: "mappls" });
            try {
              var marker = new mappls.Marker({
                map: map,
                position: { lat: lat, lng: lng },
                draggable: pickable,
                popupHtml: pickable ? undefined : popupHtml,
                popupOptions: pickable ? undefined : { openPopup: true, maxWidth: 320 }
              });
              if (pickable) {
                marker.addListener("dragend", function() { reportPick(marker.getPosition(), "drag"); });
                map.addListener("click", function(event) {
                  var point = event && event.lngLat ? { lat: event.lngLat.lat, lng: event.lngLat.lng } : null;
                  if (!point) return;
                  marker.setPosition(point);
                  reportPick(point, "tap");
                });
              }
            } catch (e) {
              console.warn("Mappls marker setup warning", e);
            }
          }
          map.addListener("load", onMapplsLoad);
          setTimeout(function() {
            if (loaded) return;
            var styleReady = false;
            try { styleReady = typeof map.isStyleLoaded === "function" && map.isStyleLoaded(); } catch (e) {}
            if (styleReady) return onMapplsLoad();
            try { if (map.remove) map.remove(); } catch (e) {}
            document.getElementById("map").innerHTML = "";
            initFallbackMap();
          }, ${MAPPLS_LOAD_TIMEOUT_MS});
          return true;
        } catch (err) {
          console.warn("Mappls map initialization fallback", err);
          return false;
        }
      }

      function initFallbackMap() {
        if (initialized || typeof L === "undefined") return;
        initialized = true;
        try {
          var container = document.getElementById("map");
          container.className = "";
          var map = L.map(container, { zoomControl: true, attributionControl: false }).setView([lat, lng], pickable ? 16 : 15);
          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

          var saffronIcon = L.divIcon({
            className: "leaflet-saffron-pin",
            html: '<div style="background:#E05638;width:30px;height:30px;border-radius:15px 15px 15px 0;transform:rotate(-45deg);border:2px solid #FFFFFF;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,0.25);"><div style="width:10px;height:10px;background:#FFFFFF;border-radius:5px;transform:rotate(45deg);"></div></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30],
            popupAnchor: [0, -30]
          });

          var marker = L.marker([lat, lng], { icon: saffronIcon, draggable: pickable }).addTo(map);
          if (pickable) {
            marker.on("dragend", function() { var p = marker.getLatLng(); reportPick({ lat: p.lat, lng: p.lng }, "drag"); });
            map.on("click", function(event) { marker.setLatLng(event.latlng); reportPick({ lat: event.latlng.lat, lng: event.latlng.lng }, "tap"); });
          } else {
            marker.bindPopup(popupHtml).openPopup();
          }
          post({ type: "ready", provider: "osm" });
          setTimeout(function() { map.invalidateSize(); }, 350);
        } catch (e) {
          console.error("Fallback map init error", e);
        }
      }

      window.onload = function() {
        if (!initMapplsMap()) initFallbackMap();
      };
    })();
  </script>
</body>
</html>`;
}

const sameSpot = (a, b) => a && b && Math.abs(a.latitude - b.latitude) < 1e-6 && Math.abs(a.longitude - b.longitude) < 1e-6;

export default function MapplsMap({ latitude, longitude, title, address, style, onPick }) {
  const hasValidCoords = isValidCoordinate(latitude, longitude);
  const effectiveLat = hasValidCoords ? Number(latitude) : DEFAULT_LAT;
  const effectiveLng = hasValidCoords ? Number(longitude) : DEFAULT_LNG;
  const token = mapplsConfig.accessToken || "";
  const pickable = typeof onPick === "function";
  const frameId = useRef(`map-${Math.random().toString(36).slice(2)}`).current;
  const lastPicked = useRef(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // A pin moved inside the map must not rebuild the map; only external location changes re-centre it.
  const [center, setCenter] = useState({ latitude: effectiveLat, longitude: effectiveLng });
  useEffect(() => {
    const next = { latitude: effectiveLat, longitude: effectiveLng };
    if (sameSpot(next, lastPicked.current) || sameSpot(next, center)) return;
    setCenter(next);
  }, [effectiveLat, effectiveLng]); // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => generateMapplsHtml({
    latitude: center.latitude,
    longitude: center.longitude,
    title,
    address: pickable ? "" : address,
    token,
    pickable,
    frameId,
  }), [center, title, pickable ? "" : address, token, pickable, frameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMessage = (raw) => {
    let message;
    try { message = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return; }
    if (!message || message.source !== "purohith-map" || message.frameId !== frameId) return;
    if (message.type === "pick" && isValidCoordinate(message.latitude, message.longitude)) {
      lastPicked.current = { latitude: message.latitude, longitude: message.longitude };
      onPickRef.current?.({ latitude: message.latitude, longitude: message.longitude, origin: message.origin });
    }
  };

  useEffect(() => {
    if (Platform.OS !== "web" || !pickable || typeof window === "undefined") return undefined;
    const listener = (event) => handleMessage(event.data);
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [pickable]); // eslint-disable-line react-hooks/exhaustive-deps

  if (Platform.OS === "web") {
    return (
      <View style={[styles.map, style]}>
        {React.createElement("iframe", {
          srcDoc: html,
          title: pickable ? "Pick ceremony location on map" : "Mappls interactive ceremony map",
          style: { width: "100%", height: "100%", border: 0 },
        })}
      </View>
    );
  }

  return (
    <WebView
      source={{ html, baseUrl: WEBVIEW_BASE_URL }}
      style={[styles.map, style]}
      originWhitelist={["*"]}
      javaScriptEnabled
      domStorageEnabled
      nestedScrollEnabled
      scrollEnabled={false}
      onMessage={(event) => handleMessage(event.nativeEvent.data)}
    />
  );
}

const styles = bindBrandStyles({
  map: {
    width: "100%",
    minHeight: 320,
    overflow: "hidden",
    backgroundColor: "#F8F5EF",
  },
});
