import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { Check, Clock3, IndianRupee, Package } from "lucide-react-native";
import { bindBrandStyles } from "../../lib/brandStyles";
import { colors, font, radii, spacing } from "../../lib/theme";
import { Button } from "../../components/UI";
import { useAuth } from "../../lib/auth";
import { fetchMarketplacePoojas, fetchMyRateCard, saveMyRateCard } from "../../lib/marketplace";

const MIN_PRICE = 100;
const MAX_PRICE = 500000;
const digits = (value, length) => String(value || "").replace(/[^0-9]/g, "").slice(0, length);

export default function RateCard({ navigation }) {
  const { user } = useAuth();
  const desktop = useWindowDimensions().width >= 760;
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState({});
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [hasProfile, setHasProfile] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [{ poojas }, rateCard] = await Promise.all([
        fetchMarketplacePoojas(),
        user?.demo ? Promise.resolve({ profile: null, services: [] }) : fetchMyRateCard(user.id),
      ]);
      setCatalog(poojas || []);
      setHasProfile(Boolean(rateCard.profile) || Boolean(user?.demo));
      const offeredSlugs = new Set(rateCard.profile?.pooja_slugs || []);
      const bySlug = Object.fromEntries((rateCard.services || []).map((service) => [service.pooja_slug, service]));
      setRows(Object.fromEntries((poojas || []).map((pooja) => {
        const service = bySlug[pooja.slug];
        return [pooja.slug, {
          offered: Boolean(service?.is_active) || (!service && offeredSlugs.has(pooja.slug)),
          price: service ? String(Math.round(Number(service.price_paise) / 100)) : "",
          duration: String(service?.duration_minutes || pooja.duration_minutes || ""),
          samagri: Boolean(service?.includes_samagri),
          note: service?.description || "",
        }];
      })));
    } catch (error) {
      setLoadError(error?.message || "Could not load your rate card.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.demo]);

  useEffect(() => { load(); }, [load]);

  const update = (slug, patch) => {
    setRows((current) => ({ ...current, [slug]: { ...current[slug], ...patch } }));
    setErrors((current) => {
      if (!current[slug]) return current;
      const next = { ...current };
      delete next[slug];
      return next;
    });
  };

  const offered = useMemo(() => catalog.filter((pooja) => rows[pooja.slug]?.offered), [catalog, rows]);
  const summary = useMemo(() => {
    const prices = offered.map((pooja) => Number(rows[pooja.slug]?.price)).filter((price) => price > 0);
    if (!prices.length) return `${offered.length} offered`;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = min === max ? `₹${min.toLocaleString("en-IN")}` : `₹${min.toLocaleString("en-IN")} – ₹${max.toLocaleString("en-IN")}`;
    return `${offered.length} offered · ${range}`;
  }, [offered, rows]);

  const validate = () => {
    const next = {};
    offered.forEach((pooja) => {
      const row = rows[pooja.slug];
      const price = Number(row.price);
      const duration = row.duration ? Number(row.duration) : null;
      if (!row.price || !Number.isInteger(price) || price < MIN_PRICE || price > MAX_PRICE) {
        next[pooja.slug] = `Enter a price between ₹${MIN_PRICE} and ₹${MAX_PRICE.toLocaleString("en-IN")}.`;
      } else if (duration !== null && (duration < 15 || duration > 1440)) {
        next[pooja.slug] = "Duration must be between 15 and 1440 minutes.";
      }
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!offered.length) return Alert.alert("Add a pooja", "Turn on at least one pooja and set its price.");
    if (!validate()) return Alert.alert("Check your prices", "Please fix the highlighted poojas.");
    if (user?.demo) return Alert.alert("Demo account", "Create a priest account to publish your rate card.");
    setSaving(true);
    try {
      await saveMyRateCard(offered.map((pooja) => {
        const row = rows[pooja.slug];
        return {
          pooja_slug: pooja.slug,
          price_inr: Number(row.price),
          duration_minutes: row.duration ? Number(row.duration) : null,
          includes_samagri: row.samagri,
          description: row.note.trim(),
        };
      }));
      Alert.alert("Rate card saved", "Families will now see these prices on your profile and pay them at booking.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      Alert.alert("Could not save rate card", error?.message || "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.saffron} /><Text style={styles.muted}>Loading your rate card…</Text></View>;
  if (loadError) return <View style={styles.center}><Text style={styles.errorTitle}>Rate card unavailable</Text><Text style={styles.muted}>{loadError}</Text><Button title="Try again" onPress={load} style={{ marginTop: 14 }} /></View>;
  if (!hasProfile) return <View style={styles.center}><Text style={styles.errorTitle}>Complete your profile first</Text><Text style={styles.muted}>Your rate card is linked to your professional profile.</Text><Button title="Open profile" onPress={() => navigation.navigate("PriestOnboarding")} style={{ marginTop: 14 }} /></View>;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.content, desktop && styles.contentDesktop]} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>POOJA RATE CARD</Text>
        <Text style={styles.title}>Set your fee for each ceremony</Text>
        <Text style={styles.sub}>Families see these prices on your profile and pay this amount (inclusive of GST) when they book you directly.</Text>

        {catalog.map((pooja) => {
          const row = rows[pooja.slug] || {};
          const error = errors[pooja.slug];
          return (
            <View key={pooja.slug} style={[styles.card, row.offered && styles.cardActive, error && styles.cardError]}>
              <View style={styles.cardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.poojaName}>{pooja.name}</Text>
                  <Text style={styles.poojaMeta}>Suggested ₹{Number(pooja.base_price_inr || 0).toLocaleString("en-IN")}</Text>
                </View>
                <Switch
                  testID={`rate-toggle-${pooja.slug}`}
                  value={Boolean(row.offered)}
                  onValueChange={(value) => update(pooja.slug, { offered: value, price: row.price || (value ? String(pooja.base_price_inr || "") : row.price) })}
                  trackColor={{ false: colors.warmBorder, true: colors.brandBrown }}
                  thumbColor={colors.white}
                />
              </View>
              {row.offered ? (
                <>
                  <View style={styles.inputRow}>
                    <View style={[styles.inputShell, styles.priceShell, error && styles.inputError]}>
                      <IndianRupee size={16} color={colors.brandBrown} />
                      <TextInput testID={`rate-price-${pooja.slug}`} value={row.price} onChangeText={(value) => update(pooja.slug, { price: digits(value, 6) })} keyboardType="number-pad" placeholder="Price" placeholderTextColor="#8A8582" style={styles.input} />
                    </View>
                    <View style={[styles.inputShell, styles.durationShell]}>
                      <Clock3 size={16} color={colors.brandBrown} />
                      <TextInput value={row.duration} onChangeText={(value) => update(pooja.slug, { duration: digits(value, 4) })} keyboardType="number-pad" placeholder="Minutes" placeholderTextColor="#8A8582" style={styles.input} />
                      <Text style={styles.unit}>min</Text>
                    </View>
                  </View>
                  <Pressable onPress={() => update(pooja.slug, { samagri: !row.samagri })} style={({ pressed }) => [styles.samagri, row.samagri && styles.samagriActive, pressed && { opacity: 0.8 }]}>
                    {row.samagri ? <Check size={14} color={colors.white} /> : <Package size={14} color={colors.ink} />}
                    <Text style={[styles.samagriText, row.samagri && styles.samagriTextActive]}>{row.samagri ? "Samagri included" : "Samagri not included"}</Text>
                  </Pressable>
                  <TextInput value={row.note} onChangeText={(value) => update(pooja.slug, { note: value.slice(0, 280) })} placeholder="Note for families (optional), e.g. includes homa" placeholderTextColor="#8A8582" style={[styles.inputShell, styles.note]} />
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.footer}>
        <Text style={styles.summary}>{summary}</Text>
        <Button testID="save-rate-card" title={saving ? "Saving…" : "Save rate card"} onPress={save} disabled={saving} />
      </View>
    </View>
  );
}

const styles = bindBrandStyles({
  root: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.white },
  muted: { color: colors.muted2, fontSize: 12, marginTop: 8, textAlign: "center" },
  errorTitle: { color: colors.ink, fontFamily: font.bold, fontSize: 18, textAlign: "center" },
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: 20, paddingBottom: 150 },
  contentDesktop: { paddingHorizontal: 36, paddingTop: 28 },
  kicker: { color: colors.saffron, fontFamily: font.bold, fontSize: 10, letterSpacing: 0.8 },
  title: { color: colors.ink, fontFamily: font.bold, fontSize: 24, lineHeight: 30, marginTop: 6 },
  sub: { color: colors.muted2, fontSize: 12, lineHeight: 18, marginTop: 6, marginBottom: 14 },
  card: { marginTop: 10, padding: 14, borderRadius: radii.md, borderWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white },
  cardActive: { borderColor: colors.brandBrown, backgroundColor: "#FFFBF8" },
  cardError: { borderColor: colors.danger },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  poojaName: { color: colors.ink, fontFamily: font.bold, fontSize: 15 },
  poojaMeta: { color: colors.muted2, fontSize: 11, marginTop: 2 },
  inputRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  inputShell: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: radii.sm, backgroundColor: colors.muted, borderWidth: 1, borderColor: "transparent" },
  priceShell: { flex: 1.2 },
  durationShell: { flex: 1 },
  inputError: { borderColor: colors.danger, backgroundColor: "#FEF2F2" },
  input: { flex: 1, minHeight: 46, color: colors.ink, fontSize: 15, fontWeight: "700", paddingVertical: 0 },
  unit: { color: colors.muted2, fontSize: 11 },
  samagri: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.warmBorder },
  samagriActive: { backgroundColor: colors.brandBrown, borderColor: colors.brandBrown },
  samagriText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  samagriTextActive: { color: colors.white },
  note: { marginTop: 10, color: colors.ink, fontSize: 13 },
  errorText: { color: colors.danger, fontSize: 11, fontWeight: "600", marginTop: 8 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.lg + 8, borderTopWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white },
  summary: { color: colors.muted2, fontSize: 12, fontWeight: "600", marginBottom: 8, textAlign: "center" },
});
