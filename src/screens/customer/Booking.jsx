import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Pressable, Platform, ActivityIndicator, useWindowDimensions } from "react-native";
import { Check, Download, QrCode, UploadCloud, UserRound, WalletCards } from "lucide-react-native";
import { colors, radii, spacing, font, shadow } from "../../lib/theme";
import { Button, Card, Field } from "../../components/UI";
import { useI18n } from "../../lib/i18n";
import api from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fetchMarketplacePoojas, fetchMarketplaceProfile } from "../../lib/marketplace";
import { createDirectBookingPayment, downloadInvoice, openUpiPayment, pickPaymentScreenshot, PUROHITH_UPI_ID } from "../../lib/payments";

const TIME_SLOTS = ["06:00", "07:30", "09:00", "10:30", "16:00", "17:30", "19:00"];
const DEFAULT_POOJAS = [
  { slug: "gauri-ganesha-vratha", name: "Gauri and Ganesha Vratha", base_price_inr: 1800 },
  { slug: "rudrabhishek", name: "Rudra Abhishek", base_price_inr: 2500 },
  { slug: "satyanarayan", name: "Satyanarayan Pooja", base_price_inr: 2100 },
  { slug: "griha-pravesh", name: "Griha Pravesh Puja", base_price_inr: 3500 },
  { slug: "ayudha-puja", name: "Ayudha Puja", base_price_inr: 1500 },
  { slug: "navagraha-shanti", name: "Navagraha Shanti", base_price_inr: 4100 },
  { slug: "varamahalakshmi-vratha", name: "Varamahalakshmi Vratha", base_price_inr: 2200 },
  { slug: "namakarna", name: "Namakarna", base_price_inr: 3000 },
  { slug: "vivaha", name: "Vivaha", base_price_inr: 15000 },
];

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function upcomingDates(days = 14) {
  const out = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    out.push(d);
  }
  return out;
}

export default function Booking({ route, navigation }) {
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { priestId, poojaSlug: routePoojaSlug } = route.params || {};
  const [pooja, setPooja] = useState(null);
  const [poojaCatalog, setPoojaCatalog] = useState(DEFAULT_POOJAS);
  const [selectedPoojaSlug, setSelectedPoojaSlug] = useState(routePoojaSlug || "satyanarayan");
  const [priest, setPriest] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [cart, setCart] = useState({}); // { addOnId: qty }
  const [date, setDate] = useState(null);
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [paymentShot, setPaymentShot] = useState(null);
  const { width } = useWindowDimensions();
  const desktop = width >= 860;

  useEffect(() => {
    api.get(`/priests/${priestId}`).then(({ data }) => setPriest(data)).catch(() => {
      fetchMarketplaceProfile(priestId).then(({ profile }) => setPriest(profile)).catch(() => {});
    });
    api.get("/booking/add-ons").then(({ data }) => setCatalog(data.add_ons || [])).catch(() => {});
  }, [priestId]);

  useEffect(() => {
    fetchMarketplacePoojas()
      .then(({ poojas }) => {
        const next = poojas?.length ? poojas : DEFAULT_POOJAS;
        setPoojaCatalog(next);
        const found = next.find((item) => item.slug === selectedPoojaSlug) || next[0] || DEFAULT_POOJAS[2];
        setSelectedPoojaSlug((current) => current || found.slug);
        setPooja(normalizePooja(found));
      })
      .catch(() => {
        const found = DEFAULT_POOJAS.find((item) => item.slug === selectedPoojaSlug) || DEFAULT_POOJAS[2];
        setPoojaCatalog(DEFAULT_POOJAS);
        setPooja(normalizePooja(found));
      });
  }, [selectedPoojaSlug]);

  const addOnList = useMemo(
    () => Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ id, qty })),
    [cart]
  );

  const totals = useMemo(() => {
    if (!pooja) return { pooja_price: 0, addons: 0, subtotal: 0, gst: 0 };
    const addonsTotal = addOnList.reduce((s, { id, qty }) => {
      const c = catalog.find(a => a.id === id); return s + (c ? c.price * qty : 0);
    }, 0);
    const subtotal = pooja.base_price + addonsTotal;
    const base = +(subtotal / 1.18).toFixed(2);
    const gst = +(subtotal - base).toFixed(2);
    return { pooja_price: pooja.base_price, addons: addonsTotal, subtotal, gst };
  }, [pooja, addOnList, catalog]);

  const bump = (id, delta) => {
    const cat = catalog.find(a => a.id === id); if (!cat) return;
    setCart(prev => {
      const n = Math.max(0, Math.min(cat.max_qty, (prev[id] || 0) + delta));
      return { ...prev, [id]: n };
    });
  };

  const submit = async () => {
    if (!date || !time || !address) return Alert.alert("Missing", "Choose date, time and address");
    if (!paymentShot?.dataUrl) return Alert.alert("Upload payment screenshot", `Pay ₹${totals.subtotal.toLocaleString("en-IN")} to ${PUROHITH_UPI_ID}, then upload the UPI success screenshot.`);
    setBusy(true);
    try {
      if (!user?.id || user?.demo) throw new Error("demo");
      const data = await createDirectBookingPayment({
        customer_id: user.id,
        priest_id: priestId,
        pooja_slug: selectedPoojaSlug,
        booking_date: date,
        booking_time: time,
        address, landmark, notes, customer_email: email,
        amount_inr: totals.subtotal,
        screenshot_data_url: paymentShot.dataUrl,
        add_ons: addOnList,
      });
      setConfirmed({ ...data.booking, ...data, priest_name: priest.name, pooja_name: pooja.name, booking_date: date, booking_time: time, total_amount: totals.subtotal });
    } catch (e) {
      if (user?.demo) {
        return setConfirmed({ id: `demo-${Date.now()}`, priest_name: priest.name, pooja_name: pooja.name, booking_date: date, booking_time: time, total_amount: totals.subtotal, invoice_no: "DEMO/0001" });
      }
      Alert.alert("Failed", e?.message || e?.response?.data?.detail || "Booking failed");
    } finally { setBusy(false); }
  };

  const uploadScreenshot = async () => {
    try {
      const shot = await pickPaymentScreenshot();
      if (shot) setPaymentShot(shot);
    } catch (error) {
      Alert.alert("Screenshot upload failed", error.message || "Please try again.");
    }
  };

  const openUpi = async () => {
    try {
      await openUpiPayment({
        amountInr: totals.subtotal,
        note: `${pooja.name} with ${priest.name}`,
      });
    } catch (error) {
      Alert.alert("Could not open UPI app", error.message || `Please pay manually to ${PUROHITH_UPI_ID}.`);
    }
  };

  if (!priest || !pooja) return <View style={{ flex: 1, backgroundColor: colors.cotton, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.saffron} /></View>;

  if (confirmed) {
    return (
      <ScrollView contentContainerStyle={[styles.confirmedPage, desktop && styles.contentDesktop]}>
        <View style={{ alignItems: "center" }}>
          <View style={styles.successIcon}><Check size={34} color={colors.white} strokeWidth={3} /></View>
          <Text style={styles.h1}>{language === "kn" ? "ಬುಕಿಂಗ್ ದೃಢಪಟ್ಟಿದೆ" : "Booking confirmed"}</Text>
          <Text style={styles.sub}>{confirmed.priest_name} · {confirmed.pooja_name}</Text>
          <Text style={styles.sub}>{confirmed.booking_date} · {confirmed.booking_time}</Text>
        </View>
        <Card style={{ marginTop: spacing.xl, ...shadow.card }}>
          <Row label="Booking ID" value={confirmed.id.slice(0, 8)} />
          {confirmed.invoice_no || confirmed.invoice_number ? <Row label="Invoice #" value={confirmed.invoice_no || confirmed.invoice_number} /> : null}
          <Row label="Total paid" value={`₹${(confirmed.total_amount || confirmed.price).toLocaleString("en-IN")}`} tone="saffron" />
        </Card>
        {confirmed.invoice_html ? <Button title="Download invoice" icon={Download} onPress={() => downloadInvoice(confirmed.invoice_html, confirmed.invoice_number || confirmed.invoice_no)} style={{ marginTop: spacing.md }} /> : null}
        <Button testID="view-bookings-btn" title="View my bookings" onPress={() => navigation.navigate("Tabs", { screen: "Bookings" })} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={[styles.content, desktop && styles.contentDesktop]}>
        <Text style={styles.eyebrow}>REVIEW AND CONTINUE</Text>
        <Text style={styles.h1}>{pooja.name}</Text>
        <View style={styles.providerSummary}><View style={styles.providerAvatar}><UserRound size={20} color={colors.ink} /></View><View style={{ flex: 1 }}><Text style={styles.providerName}>{priest.name}</Text><Text style={styles.sub}>Verified purohit · Base ₹{Number(pooja.base_price).toLocaleString("en-IN")}</Text></View></View>
        <View style={styles.steps}><Step active number="1" label="Schedule" /><View style={styles.stepLine} /><Step number="2" label="Details" /><View style={styles.stepLine} /><Step number="3" label="Review" /></View>

        <View style={desktop ? styles.checkoutGrid : undefined}>
        <View style={desktop ? styles.formPane : undefined}>
        <Field label="Choose ceremony">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ceremonyList}>
            {poojaCatalog.map((item) => {
              const active = item.slug === selectedPoojaSlug;
              return <Pressable key={item.slug} onPress={() => setSelectedPoojaSlug(item.slug)} style={[styles.ceremonyChip, active && styles.ceremonyChipActive]}>
                <Text style={[styles.ceremonyName, active && styles.ceremonyNameActive]}>{item.name}</Text>
                <Text style={[styles.ceremonyPrice, active && styles.ceremonyNameActive]}>from ₹{Number(item.base_price_inr || item.base_price || 0).toLocaleString("en-IN")}</Text>
              </Pressable>;
            })}
          </ScrollView>
        </Field>

        {/* Date scroller */}
        <Field label="Select date">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {upcomingDates().map((d) => {
              const iso = fmtDate(d);
              const blocked = (priest.blocked_dates || []).includes(iso);
              const isSel = date === iso;
              return (
                <Pressable
                  key={iso}
                  testID={`date-${iso}`}
                  disabled={blocked}
                  onPress={() => setDate(iso)}
                  style={[styles.dayChip, isSel && styles.dayChipActive, blocked && { opacity: 0.35 }]}
                >
                  <Text style={[styles.dayChipDow, isSel && { color: colors.white }]}>
                    {d.toLocaleDateString("en-IN", { weekday: "short" })}
                  </Text>
                  <Text style={[styles.dayChipNum, isSel && { color: colors.white }]}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Field>

        {/* Time slots */}
        <Field label="Time slot">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {TIME_SLOTS.map(s => (
              <Pressable
                key={s}
                testID={`time-${s}`}
                onPress={() => setTime(s)}
                style={[styles.timeChip, time === s && styles.timeChipActive]}
              >
                <Text style={[styles.timeChipTxt, time === s && { color: colors.white }]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        {/* Add-ons */}
        <Text style={styles.sectionTitle}>{t.addOns}</Text>
        {catalog.map(a => {
          const qty = cart[a.id] || 0;
          return (
            <Card key={a.id} testID={`addon-${a.id}`} style={styles.addonRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.addonName}>{a.name}</Text>
                <Text style={styles.addonDesc} numberOfLines={2}>{a.description}</Text>
                <Text style={styles.addonPrice}>₹{a.price.toLocaleString("en-IN")} / {a.unit}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Pressable testID={`addon-${a.id}-minus`} onPress={() => bump(a.id, -1)}
                  disabled={qty === 0} style={[styles.qtyBtn, qty === 0 && { opacity: 0.4 }]}>
                  <Text style={styles.qtyBtnTxt}>−</Text>
                </Pressable>
                <Text testID={`addon-${a.id}-qty`} style={styles.qty}>{qty}</Text>
                <Pressable testID={`addon-${a.id}-plus`} onPress={() => bump(a.id, 1)}
                  disabled={qty >= a.max_qty}
                  style={[styles.qtyBtn, { backgroundColor: colors.saffron, borderColor: colors.saffron }, qty >= a.max_qty && { opacity: 0.4 }]}> 
                  <Text style={[styles.qtyBtnTxt, { color: colors.white }]}>+</Text>
                </Pressable>
              </View>
            </Card>
          );
        })}

        {/* Address */}
        <Field label="Address">
          <TextInput testID="booking-address" multiline value={address} onChangeText={setAddress}
            placeholder="Flat, street, area, Bengaluru" style={[styles.input, { minHeight: 80, paddingVertical: 12 }]} />
        </Field>
        <Field label="Landmark (optional)">
          <TextInput testID="booking-landmark" value={landmark} onChangeText={setLandmark} placeholder="Near ABC temple" style={styles.input} />
        </Field>
        <Field label="Email for invoice (optional)">
          <TextInput testID="booking-email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="you@example.com" style={styles.input} />
        </Field>
        <Field label="Notes to priest (optional)">
          <TextInput testID="booking-notes" multiline value={notes} onChangeText={setNotes} placeholder="Any special requests" style={[styles.input, { minHeight: 70, paddingVertical: 12 }]} />
        </Field>
        </View>

        <View style={desktop ? styles.summaryPane : undefined}>
        <Card style={styles.paymentCard}>
          <View style={styles.paymentTop}><View style={styles.qrMark}><QrCode size={22} color={colors.saffron} /></View><View style={{ flex: 1 }}><Text style={styles.paymentTitle}>UPI payment proof</Text><Text style={styles.paymentSub}>Pay to {PUROHITH_UPI_ID}. Upload the successful payment screenshot so admin can verify and hold the order for priest acceptance.</Text></View></View>
          <Text selectable style={styles.upiText}>{PUROHITH_UPI_ID}</Text>
          <Button title={`Pay ₹${totals.subtotal.toLocaleString("en-IN")} by UPI`} icon={WalletCards} onPress={openUpi} style={{ marginTop: 12 }} />
          <Pressable onPress={uploadScreenshot} style={({ pressed }) => [styles.upload, pressed && styles.uploadPressed]}>
            <UploadCloud size={18} color={colors.ink} /><Text style={styles.uploadText}>{paymentShot ? paymentShot.name : "Upload UPI screenshot"}</Text>
          </Pressable>
        </Card>

        {/* Cart breakdown */}
        <Card testID="cart-breakdown" style={{ marginTop: spacing.md, ...shadow.card }}>
          <Row label={pooja.name} value={`₹${totals.pooja_price.toLocaleString("en-IN")}`} />
          {addOnList.map(({ id, qty }) => {
            const c = catalog.find(a => a.id === id); if (!c) return null;
            return <Row key={id} label={`${(c.name.split("·")[1] || c.name).trim()} × ${qty}`} value={`₹${(c.price * qty).toLocaleString("en-IN")}`} />;
          })}
          <View style={{ height: 1, backgroundColor: colors.warmBorder, marginVertical: 8 }} />
          <Text style={{ color: colors.muted2, fontSize: font.sizes.xs }}>{t.includingGst} (₹{totals.gst.toLocaleString("en-IN")})</Text>
          <Row label={t.total} value={`₹${totals.subtotal.toLocaleString("en-IN")}`} tone="saffron" />
        </Card>
        </View>
        </View>
      </ScrollView>

      {/* Sticky pay bar */}
      <View style={styles.stickyBar}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
          <Text style={{ color: colors.muted2, fontSize: font.sizes.xs }}>{t.includingGst}</Text>
          <Text testID="cart-total" style={{ color: colors.saffron, fontWeight: "800", fontSize: font.sizes.xl }}>
            ₹{totals.subtotal.toLocaleString("en-IN")}
          </Text>
        </View>
        <Button testID="pay-btn" title={busy ? "Processing…" : `${t.payNow} + upload proof`} onPress={submit} disabled={busy} />
      </View>
    </View>
  );
}

function Row({ label, value, tone }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
      <Text style={{ color: colors.muted2, fontSize: font.sizes.sm, flex: 1 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: tone === "saffron" ? colors.saffron : colors.ink, fontWeight: "700", fontSize: tone === "saffron" ? font.sizes.lg : font.sizes.sm }}>{value}</Text>
    </View>
  );
}

function Step({ number, label, active }) { return <View style={styles.step}><View style={[styles.stepNumber, active && styles.stepNumberActive]}><Text style={[styles.stepNumberText, active && { color: colors.white }]}>{number}</Text></View><Text style={[styles.stepLabel, active && { color: colors.ink }]}>{label}</Text></View>; }

function normalizePooja(item) {
  return {
    ...item,
    base_price: Number(item?.base_price ?? item?.base_price_inr ?? 0),
  };
}

const styles = StyleSheet.create({
  content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: spacing.lg, paddingBottom: 170 }, contentDesktop: { maxWidth: 1160, paddingHorizontal: 36, paddingTop: 28 }, confirmedPage: { width: "100%", maxWidth: 680, alignSelf: "center", padding: spacing.xxl, paddingTop: 72, paddingBottom: 60 },
  eyebrow: { color: colors.saffron, fontSize: 10, fontWeight: "700", letterSpacing: .7, marginTop: 4 }, h1: { fontSize: 28, lineHeight: 34, fontWeight: "700", color: colors.ink, marginTop: 6 },
  sub: { color: colors.muted2, fontSize: 12, marginTop: 4 }, providerSummary: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.warmBorder, marginTop: 16 }, providerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: colors.muted }, providerName: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  steps: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", marginTop: 22, marginBottom: 28 }, step: { width: 64, alignItems: "center" }, stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }, stepNumberActive: { backgroundColor: colors.ink }, stepNumberText: { color: colors.muted2, fontSize: 10, fontWeight: "700" }, stepLabel: { color: colors.muted2, fontSize: 9, marginTop: 5 }, stepLine: { width: 42, height: 1, backgroundColor: colors.warmBorder, marginTop: 14 }, successIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: colors.success, marginBottom: 20 },
  checkoutGrid: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  formPane: { flex: 1.45, minWidth: 0 },
  summaryPane: { flex: 0.9, minWidth: 340 },
  sectionTitle: { fontSize: font.sizes.sm, fontWeight: "700", color: colors.ink, marginTop: spacing.md, marginBottom: 8 },
  ceremonyList: { gap: 9, paddingBottom: 4 },
  ceremonyChip: { minWidth: 170, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white },
  ceremonyChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  ceremonyName: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  ceremonyNameActive: { color: colors.white },
  ceremonyPrice: { color: colors.muted2, fontSize: 10, fontWeight: "700", marginTop: 4 },
  dayChip: {
    width: 54, height: 60, borderRadius: radii.md, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.warmBorder, alignItems: "center", justifyContent: "center", marginRight: 8,
  },
  dayChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayChipDow: { fontSize: font.sizes.xs, color: colors.muted2 },
  dayChipNum: { fontSize: font.sizes.lg, fontWeight: "700", color: colors.ink },
  timeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radii.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.warmBorder },
  timeChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  timeChipTxt: { fontSize: font.sizes.sm, color: colors.ink, fontWeight: "600" },
  input: {
    minHeight: 50, borderRadius: radii.sm, backgroundColor: colors.muted,
    borderWidth: 0, paddingHorizontal: spacing.lg,
    fontSize: font.sizes.base, color: colors.ink,
  },
  addonRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: 9, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.warmBorder },
  addonName: { fontSize: font.sizes.sm, fontWeight: "700", color: colors.ink },
  addonDesc: { fontSize: 11, color: colors.muted2, marginTop: 2 },
  addonPrice: { fontSize: font.sizes.xs, color: colors.saffron, fontWeight: "700", marginTop: 4 },
  qtyBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.warmBorder, alignItems: "center", justifyContent: "center" },
  qtyBtnTxt: { fontSize: 18, fontWeight: "700", color: colors.ink },
  qty: { width: 24, textAlign: "center", fontVariant: ["tabular-nums"], fontSize: font.sizes.base, fontWeight: "700" },
  paymentCard: { marginTop: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.warmBorder, ...shadow.card },
  paymentTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  qrMark: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#FFF1EB", alignItems: "center", justifyContent: "center" },
  paymentTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  paymentSub: { color: colors.muted2, fontSize: 11, lineHeight: 16, marginTop: 3 },
  upiText: { color: colors.ink, fontSize: 12, fontWeight: "800", padding: 12, borderRadius: 12, backgroundColor: colors.muted, marginTop: 14 },
  upload: { marginTop: 12, minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: colors.warmBorder, borderBottomWidth: 3, borderBottomColor: "#D8D5CF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  uploadPressed: { transform: [{ translateY: 2 }, { scale: .99 }], borderBottomWidth: 1 },
  uploadText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg,
    backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.warmBorder,
    ...(Platform.OS === "ios" && { paddingBottom: 24 }),
  },
});
