import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { CheckCircle2, LocateFixed, MapPin, Search, X } from "lucide-react-native";
import { bindBrandStyles } from "../lib/brandStyles";
import { colors, radii } from "../lib/theme";
import MapplsMap from "./MapplsMap";
import { isValidCoordinate, resolvePlace, reverseGeocode, searchPlaces } from "../lib/maps";

const SEARCH_DEBOUNCE_MS = 350;

export default function LocationPicker({ coords, onCoordsChange, address, onAddressChange, title }) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [locating, setLocating] = useState(false);
  const [pinLabel, setPinLabel] = useState("");
  const requestSeq = useRef(0);
  const lastAutoAddress = useRef("");
  const hasPin = isValidCoordinate(coords?.latitude, coords?.longitude);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) {
      setPlaces([]);
      setSearching(false);
      setSearchError("");
      return undefined;
    }
    const seq = ++requestSeq.current;
    setSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(text, hasPin ? coords : null)
        .then((results) => {
          if (seq !== requestSeq.current) return;
          setPlaces(results);
          setSearchError(results.length ? "" : "No matching places. Try a nearby landmark or area.");
        })
        .catch(() => {
          if (seq === requestSeq.current) setSearchError("Location search is unavailable. Use current location or tap the map.");
        })
        .finally(() => { if (seq === requestSeq.current) setSearching(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const fillAddress = (text) => {
    if (!text) return;
    const current = (address || "").trim();
    if (!current || current === lastAutoAddress.current) {
      lastAutoAddress.current = text;
      onAddressChange(text);
    }
  };

  const applyPoint = (latitude, longitude, label) => {
    onCoordsChange({ latitude, longitude });
    setPinLabel(label || "");
  };

  const choosePlace = async (place) => {
    requestSeq.current += 1;
    setPlaces([]);
    setSearching(false);
    setQuery("");
    try {
      const resolved = await resolvePlace(place);
      if (!resolved) throw new Error("missing coordinates");
      applyPoint(resolved.latitude, resolved.longitude, place.title);
      const text = place.address || resolved.address;
      if (text) {
        lastAutoAddress.current = text;
        onAddressChange(text);
      }
    } catch {
      Alert.alert("Could not pin this place", "Try another search result, or tap the map to drop the pin.");
    }
  };

  const labelFromReverse = async (latitude, longitude) => {
    const place = await reverseGeocode(latitude, longitude).catch(() => null);
    if (place) {
      setPinLabel(place.title || place.address);
      fillAddress(place.address);
      return true;
    }
    return false;
  };

  const onMapPick = ({ latitude, longitude }) => {
    applyPoint(latitude, longitude, "Pinned on map");
    labelFromReverse(latitude, longitude);
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Location permission required", "Allow location access, or search for your address instead.");
        return;
      }
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = current.coords;
      applyPoint(latitude, longitude, "Current location");
      const labelled = await labelFromReverse(latitude, longitude);
      if (!labelled) {
        const [place] = await Location.reverseGeocodeAsync({ latitude, longitude }).catch(() => []);
        if (place) fillAddress([place.name, place.street, place.district || place.subregion, place.city].filter(Boolean).join(", "));
      }
    } catch (error) {
      Alert.alert("Could not read location", error?.message || "Search for your address or tap the map.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <View>
      <View style={styles.searchShell}>
        <Search size={17} color={colors.brandBrown} />
        <TextInput
          testID="location-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search apartment, street or area"
          placeholderTextColor="#8D8A85"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchInput}
        />
        {searching ? <ActivityIndicator size="small" color={colors.brandBrown} /> : query ? (
          <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")} hitSlop={10}><X size={16} color={colors.muted2} /></Pressable>
        ) : null}
      </View>

      {places.length ? (
        <View style={styles.results}>
          {places.map((place) => (
            <Pressable key={place.id} onPress={() => choosePlace(place)} style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}>
              <MapPin size={16} color={colors.saffron} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle} numberOfLines={1}>{place.title}</Text>
                {place.subtitle ? <Text style={styles.resultSub} numberOfLines={2}>{place.subtitle}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : searchError && query.trim().length >= 3 && !searching ? (
        <Text style={styles.searchError}>{searchError}</Text>
      ) : null}

      <Pressable onPress={useCurrentLocation} disabled={locating} style={({ pressed }) => [styles.locationButton, pressed && styles.locationPressed]}>
        {locating ? <ActivityIndicator size="small" color={colors.ink} /> : <LocateFixed size={17} color={colors.ink} />}
        <Text style={styles.locationButtonText}>{locating ? "Reading location..." : "Use current location"}</Text>
      </Pressable>

      <View style={styles.mapWrap}>
        <MapplsMap latitude={coords?.latitude} longitude={coords?.longitude} title={title} style={styles.map} onPick={onMapPick} />
      </View>
      <View style={[styles.pinStatus, hasPin && styles.pinStatusSet]}>
        {hasPin ? <CheckCircle2 size={15} color={colors.success} /> : <MapPin size={15} color={colors.muted2} />}
        <Text style={[styles.pinStatusText, hasPin && styles.pinStatusTextSet]} numberOfLines={2}>
          {hasPin
            ? `${pinLabel || "Location pinned"} · ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
            : "Search, use current location, or tap the map to pin the ceremony spot"}
        </Text>
      </View>
    </View>
  );
}

const styles = bindBrandStyles({
  searchShell: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: radii.sm, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.warmBorder },
  searchInput: { flex: 1, minHeight: 50, color: colors.ink, fontSize: 14, paddingVertical: 0 },
  results: { marginTop: 6, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white, overflow: "hidden" },
  result: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.warmBorder },
  resultPressed: { backgroundColor: colors.muted },
  resultTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  resultSub: { color: colors.muted2, fontSize: 11, lineHeight: 15, marginTop: 2 },
  searchError: { color: colors.muted2, fontSize: 11, marginTop: 6 },
  locationButton: { minHeight: 46, marginTop: 10, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  locationPressed: { opacity: 0.8 },
  locationButtonText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  mapWrap: { height: 220, marginTop: 10, overflow: "hidden", borderRadius: radii.lg, borderWidth: 1, borderColor: colors.warmBorder },
  map: { height: "100%", minHeight: 220 },
  pinStatus: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: radii.sm, backgroundColor: colors.muted },
  pinStatusSet: { backgroundColor: "#F0F7F3" },
  pinStatusText: { flex: 1, color: colors.muted2, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  pinStatusTextSet: { color: colors.ink },
});
