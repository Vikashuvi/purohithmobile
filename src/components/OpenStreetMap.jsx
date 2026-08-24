import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

function mapUrl(latitude, longitude, delta = 0.018) {
  const bbox = [longitude - delta, latitude - delta, longitude + delta, latitude + delta].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`;
}

export default function OpenStreetMap({ latitude, longitude, style }) {
  const uri = mapUrl(latitude, longitude);
  if (Platform.OS === "web") {
    return <View style={[styles.map, style]}>{React.createElement("iframe", { src: uri, title: "OpenStreetMap priest tracking", style: { width: "100%", height: "100%", border: 0 } })}</View>;
  }
  return <WebView source={{ uri }} style={[styles.map, style]} originWhitelist={["https://*", "http://*"]} />;
}

const styles = StyleSheet.create({ map: { width: "100%", minHeight: 320, overflow: "hidden" } });
