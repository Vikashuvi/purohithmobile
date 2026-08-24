import React, { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { BadgeCheck, Check, Clock3, Download, MapPin, MessageSquareText, Navigation, QrCode, ShieldCheck, UploadCloud, WalletCards } from "lucide-react-native";
import { colors, radii, font } from "../../lib/theme";
import { Button } from "../../components/UI";
import OpenStreetMap from "../../components/OpenStreetMap";
import MapplsDrawer from "../../components/MapplsDrawer";
import { useAuth } from "../../lib/auth";
import { downloadInvoice, listRequestProposals, openUpiPayment, pickPaymentScreenshot, PUROHITH_UPI_ID, selectProposal, submitPaymentScreenshot } from "../../lib/payments";

const DEMO_BIDS = [
  { id: "demo-bid-rama", priest_name: "Sri Ramachandra Sharma", amount: 2900, message: "I can conduct this ceremony with traditional samagri guidance.", includes_samagri: true },
  { id: "demo-bid-ramesh", priest_name: "Pandit Ramesh Shukla", amount: 3200, message: "Available at your requested time. Happy to discuss family traditions first.", includes_samagri: false },
];

export default function RequestProposals({ route }) {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const params = route.params || {};
  const request = {
    id: params.requestId || params.request?.id,
    pooja_name: params.poojaName || params.request?.pooja_name,
    ceremony_date: params.ceremonyDate || params.request?.ceremony_date,
    ceremony_time: params.ceremonyTime || params.request?.ceremony_time,
    address: params.address || params.request?.address,
    landmark: params.landmark || params.request?.landmark,
    lat: params.lat || params.request?.lat,
    lng: params.lng || params.request?.lng,
  };
  const latitude = Number(request.lat || 12.9784);
  const longitude = Number(request.lng || 77.6408);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState("");
  const [selectedBid, setSelectedBid] = useState(null);
  const [paymentShot, setPaymentShot] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [payment, setPayment] = useState(null);
  const [paying, setPaying] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const desktop = width >= 850;
  const bestPrice = useMemo(() => bids.length ? Math.min(...bids.map((bid) => Number(bid.amount))) : 0, [bids]);

  useEffect(() => {
    if (!request.id) { setBids(DEMO_BIDS); setLoading(false); return; }
    listRequestProposals(request.id).then((data) => setBids(data?.proposals?.length ? data.proposals : (user?.demo ? DEMO_BIDS : []))).catch(() => setBids(user?.demo ? DEMO_BIDS : [])).finally(() => setLoading(false));
  }, [request.id, user?.demo]);

  const award = async (bid) => {
    setSelecting(bid.id);
    try {
      const data = await selectProposal(request.id, bid.id);
      const accepted = data?.proposal || bid;
      setSelectedBid(accepted);
      setPaymentAmount(String(data?.amount_inr || bid.amount || bid.amount_inr || ""));
      setPayment(null);
      Alert.alert("Purohit selected", "Now pay the selected proposal amount by UPI and upload the payment screenshot for admin verification.");
      return data;
    } catch (error) {
      if (user?.demo) {
        setSelectedBid(bid);
        setPaymentAmount(String(bid.amount || bid.amount_inr || ""));
        return Alert.alert("Demo selection saved", "Now complete the demo UPI proof step.");
      }
      Alert.alert("Could not select proposal", error?.response?.data?.detail || "Try again.");
    } finally { setSelecting(""); }
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
        amountInr: Number(paymentAmount || selectedBid?.amount || selectedBid?.amount_inr),
        note: `${request.pooja_name || "Purohith Connect"} - ${selectedBid?.priest_name || "selected purohit"}`,
      });
    } catch (error) {
      Alert.alert("Could not open UPI app", error.message || `Please pay manually to ${PUROHITH_UPI_ID}.`);
    }
  };

  const submitPayment = async () => {
    const amount = Number(paymentAmount);
    if (!selectedBid) return Alert.alert("Choose a proposal first", "Select the purohit you want before making payment.");
    if (!amount || amount < 1) return Alert.alert("Enter paid amount", "Add the exact UPI amount paid.");
    if (!paymentShot?.dataUrl) return Alert.alert("Upload screenshot", "Upload the successful UPI payment screenshot for admin verification.");
    setPaying(true);
    try {
      const result = await submitPaymentScreenshot({
        request_id: request.id,
        amount_inr: amount,
        screenshot_data_url: paymentShot.dataUrl,
      });
      setPayment(result);
      Alert.alert("Payment submitted", result.ai?.summary || "Admin will verify this screenshot and notify the selected purohit.");
    } catch (error) {
      if (user?.demo) {
        setPayment({ invoice_number: "DEMO-PROPOSAL-0001", invoice_html: "", ai: { confidence: 0.8, summary: "Demo payment submitted." } });
        return Alert.alert("Demo payment submitted", "The admin verification step is simulated in demo mode.");
      }
      Alert.alert("Could not submit payment", error.message || "Please try again.");
    } finally { setPaying(false); }
  };

  return <>
  <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <View style={styles.header}><Text style={styles.kicker}>PROPOSALS</Text><Text style={styles.title}>{request.pooja_name || "Your ceremony request"}</Text><Text style={styles.sub}>{request.ceremony_date || "Date pending"} · {request.ceremony_time || "Time pending"}</Text></View>
    <View style={[styles.summary, desktop && styles.summaryDesktop]}>
      <View style={[styles.locationCard, desktop && styles.locationDesktop]}><View style={styles.mapWrap}><OpenStreetMap latitude={latitude} longitude={longitude} title={request.pooja_name} address={request.address} style={styles.map} /></View><View style={styles.addressRow}><MapPin size={16} color={colors.saffron} /><View style={{ flex: 1 }}><Text style={styles.addressTitle}>{request.address || "Service address"}</Text>{request.landmark ? <Text style={styles.addressMeta}>{request.landmark}</Text> : null}</View><Pressable accessibilityLabel="Open Mappls drawer" onPress={() => setMapOpen(true)} style={styles.mapButton}><Navigation size={15} color={colors.white} /></Pressable></View></View>
      <View style={[styles.statusCard, desktop && styles.statusDesktop]}><View style={styles.statusIcon}><Clock3 size={19} color={colors.saffron} /></View><Text style={styles.statusLabel}>REQUEST STATUS</Text><Text style={styles.statusTitle}>{loading ? "Finding available purohits" : `${bids.length} proposals received`}</Text><View style={styles.timeline}><TimelineStep label="Request sent" done /><TimelineStep label="Purohits reviewing" done={bids.length > 0} /><TimelineStep label="Choose an offer" done={false} last /></View></View>
    </View>

    <View style={styles.proposalHeader}><View><Text style={styles.sectionTitle}>Compare proposals</Text><Text style={styles.sectionSub}>Review price, message, and included services.</Text></View>{bestPrice ? <View style={styles.bestBadge}><Text style={styles.bestBadgeText}>From ₹{bestPrice.toLocaleString("en-IN")}</Text></View> : null}</View>
    {loading ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Looking for verified offers...</Text><Text style={styles.empty}>We will update this page as purohits respond.</Text></View> : bids.length ? <View style={[styles.bidGrid, desktop && styles.bidGridDesktop]}>{bids.map((bid) => <View key={bid.id} style={[styles.bid, desktop && styles.bidDesktop, Number(bid.amount) === bestPrice && styles.bidBest]}><View style={styles.bidTop}><View style={styles.avatar}><Text style={styles.avatarText}>{bid.priest_name?.slice(0, 1)}</Text></View><View style={{ flex: 1 }}><View style={styles.nameRow}><Text style={styles.name}>{bid.priest_name}</Text><BadgeCheck size={16} color={colors.saffron} /></View><Text style={styles.verified}>Identity and practice verified</Text></View></View><View style={styles.priceRow}><View><Text style={styles.price}>₹{Number(bid.amount).toLocaleString("en-IN")}</Text><Text style={styles.priceLabel}>total proposal</Text></View>{Number(bid.amount) === bestPrice ? <View style={styles.valueTag}><Text style={styles.valueTagText}>BEST VALUE</Text></View> : null}</View><View style={styles.note}><MessageSquareText size={16} color={colors.muted2} /><Text style={styles.noteText}>{bid.message || "No note added."}</Text></View><View style={styles.featureRow}>{bid.includes_samagri ? <><Check size={14} color={colors.success} /><Text style={styles.featureText}>Samagri included</Text></> : <><ShieldCheck size={14} color={colors.muted2} /><Text style={styles.featureText}>Discuss samagri directly</Text></>}</View><Button title={selecting === bid.id ? "Selecting..." : "Choose this purohit"} onPress={() => award(bid)} disabled={Boolean(selecting)} style={styles.choose} /></View>)}</View> : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>Waiting for offers</Text><Text style={styles.empty}>Verified purohits will receive your request and can send a proposal shortly.</Text></View>}
    {selectedBid ? <View style={styles.paymentPanel}>
      <View style={styles.paymentTop}><View style={styles.paymentIcon}><QrCode size={22} color={colors.saffron} /></View><View style={{ flex: 1 }}><Text style={styles.paymentTitle}>Pay selected proposal</Text><Text style={styles.paymentSub}>{selectedBid.priest_name} is selected. Pay the accepted bid amount, upload the screenshot, and admin will verify before notifying the purohit.</Text></View></View>
      <View style={styles.payeeBox}><Text style={styles.payeeLabel}>UPI ID</Text><Text selectable style={styles.payeeText}>{PUROHITH_UPI_ID}</Text></View>
      <Text style={styles.inputLabel}>Amount paid</Text>
      <TextInput value={paymentAmount} onChangeText={(value) => setPaymentAmount(value.replace(/[^0-9]/g, ""))} keyboardType="numeric" placeholder="Amount in rupees" placeholderTextColor="#8D8A85" style={styles.amountInput} />
      <View style={styles.paymentActions}>
        <Button title="Open UPI app" icon={WalletCards} variant="outline" onPress={openUpi} style={styles.paymentAction} />
        <Pressable onPress={uploadScreenshot} style={({ pressed }) => [styles.upload, pressed && styles.uploadPressed]}><UploadCloud size={18} color={colors.ink} /><Text style={styles.uploadText}>{paymentShot ? paymentShot.name : "Upload screenshot"}</Text></Pressable>
      </View>
      <Button title={paying ? "Submitting..." : "Submit payment proof"} onPress={submitPayment} disabled={paying} style={styles.submitPayment} />
      {payment?.invoice_number ? <View style={styles.invoiceBox}><Text style={styles.invoiceTitle}>Invoice generated: {payment.invoice_number}</Text>{payment.invoice_html ? <Pressable onPress={() => {
        const downloaded = downloadInvoice(payment.invoice_html, payment.invoice_number);
        if (!downloaded && Platform.OS !== "web") Alert.alert("Invoice ready", `Invoice ${payment.invoice_number} is stored in the payment record.`);
      }} style={styles.downloadButton}><Download size={16} color={colors.white} /><Text style={styles.downloadText}>Download invoice</Text></Pressable> : null}<Text style={styles.aiNote}>AI confidence: {Math.round((payment.ai?.confidence || 0) * 100)}%. Admin final verification is required.</Text></View> : null}
    </View> : null}
  </ScrollView>
  <MapplsDrawer visible={mapOpen} onClose={() => setMapOpen(false)} location={{ ...request, latitude, longitude, title: request.pooja_name }} />
  </>;
}

function TimelineStep({ label, done, last }) {
  return <View style={styles.timelineRow}><View style={styles.timelineMarkWrap}><View style={[styles.timelineMark, done && styles.timelineMarkDone]}>{done ? <Check size={10} color={colors.white} /> : null}</View>{!last ? <View style={[styles.timelineLine, done && styles.timelineLineDone]} /> : null}</View><Text style={[styles.timelineText, done && styles.timelineTextDone]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white }, content: { width: "100%", maxWidth: 1040, alignSelf: "center", padding: 20, paddingBottom: 48 },
  header: { paddingTop: 6, paddingBottom: 18, borderBottomWidth: 1, borderColor: colors.warmBorder }, kicker: { fontSize: 10, fontWeight: "700", color: colors.saffron, letterSpacing: .8 }, title: { fontSize: 29, lineHeight: 35, color: colors.ink, fontFamily: font.semibold, marginTop: 6 }, sub: { color: colors.muted2, fontSize: 12, lineHeight: 18, marginTop: 6 },
  summary: { gap: 14, marginTop: 16 }, summaryDesktop: { flexDirection: "row" }, locationCard: { borderWidth: 1, borderColor: colors.warmBorder, borderRadius: radii.lg, overflow: "hidden", backgroundColor: colors.white }, locationDesktop: { flex: 1.45 }, mapWrap: { height: 176, overflow: "hidden" }, map: { minHeight: 176 }, addressRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13 }, addressTitle: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 18 }, addressMeta: { color: colors.muted2, fontSize: 10, lineHeight: 14, marginTop: 2 }, mapButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  statusCard: { padding: 18, borderRadius: 12, backgroundColor: colors.muted }, statusDesktop: { flex: 1 }, statusIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.white }, statusLabel: { color: colors.muted2, fontSize: 9, fontWeight: "700", letterSpacing: .7, marginTop: 14 }, statusTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", marginTop: 4 }, timeline: { marginTop: 16 }, timelineRow: { minHeight: 34, flexDirection: "row", gap: 9 }, timelineMarkWrap: { alignItems: "center" }, timelineMark: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" }, timelineMarkDone: { backgroundColor: colors.success, borderColor: colors.success }, timelineLine: { width: 1, flex: 1, backgroundColor: colors.warmBorder }, timelineLineDone: { backgroundColor: colors.success }, timelineText: { color: colors.muted2, fontSize: 11, marginTop: 2 }, timelineTextDone: { color: colors.ink, fontWeight: "600" },
  proposalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginTop: 28, marginBottom: 12 }, sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: "600" }, sectionSub: { color: colors.muted2, fontSize: 11, marginTop: 3 }, bestBadge: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: "#F1F8F4" }, bestBadgeText: { color: colors.success, fontSize: 10, fontWeight: "700" },
  bidGrid: { gap: 12 }, bidGridDesktop: { flexDirection: "row", flexWrap: "wrap" }, bid: { padding: 17, borderRadius: 12, borderWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white }, bidDesktop: { width: "49%" }, bidBest: { borderColor: "#C8D9CD" }, bidTop: { flexDirection: "row", alignItems: "center", gap: 11 }, avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" }, avatarText: { color: colors.white, fontWeight: "700", fontSize: 17 }, nameRow: { flexDirection: "row", alignItems: "center", gap: 5 }, name: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "700" }, verified: { color: colors.muted2, fontSize: 10, marginTop: 3 }, priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 17, paddingTop: 15, borderTopWidth: 1, borderColor: colors.warmBorder }, price: { color: colors.ink, fontSize: 24, fontWeight: "700" }, priceLabel: { color: colors.muted2, fontSize: 9, marginTop: 2 }, valueTag: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: "#F1F8F4" }, valueTagText: { color: colors.success, fontSize: 8, fontWeight: "700", letterSpacing: .4 }, note: { flexDirection: "row", gap: 8, marginTop: 15, padding: 12, borderRadius: 10, backgroundColor: colors.muted }, noteText: { flex: 1, fontSize: 11, color: colors.muted2, lineHeight: 17 }, featureRow: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 12 }, featureText: { color: colors.muted2, fontSize: 10, fontWeight: "600" }, choose: { marginTop: 16 },
  emptyCard: { marginTop: 14, padding: 28, alignItems: "center", backgroundColor: colors.muted, borderRadius: 12 }, emptyTitle: { color: colors.ink, fontWeight: "700", fontSize: 15 }, empty: { color: colors.muted2, fontSize: 12, textAlign: "center", marginTop: 7, lineHeight: 18 },
  paymentPanel: { marginTop: 22, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white, shadowColor: "#000", shadowOpacity: .07, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } },
  paymentTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  paymentIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: "#FFF1EB", alignItems: "center", justifyContent: "center" },
  paymentTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  paymentSub: { color: colors.muted2, fontSize: 11, lineHeight: 17, marginTop: 4 },
  payeeBox: { marginTop: 16, padding: 13, borderRadius: 13, backgroundColor: colors.muted },
  payeeLabel: { color: colors.muted2, fontSize: 9, fontWeight: "800", letterSpacing: .5 },
  payeeText: { color: colors.ink, fontSize: 13, fontWeight: "800", marginTop: 5 },
  inputLabel: { color: colors.ink, fontSize: 12, fontWeight: "800", marginTop: 15, marginBottom: 7 },
  amountInput: { minHeight: 50, borderRadius: 12, backgroundColor: colors.muted, color: colors.ink, fontSize: 15, paddingHorizontal: 14 },
  paymentActions: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  paymentAction: { flex: 1, minWidth: 180 },
  upload: { flex: 1, minWidth: 180, minHeight: 52, borderRadius: 14, borderWidth: 1, borderColor: colors.warmBorder, borderBottomWidth: 3, borderBottomColor: "#D8D5CF", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  uploadPressed: { transform: [{ translateY: 2 }, { scale: .99 }], borderBottomWidth: 1 },
  uploadText: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  submitPayment: { marginTop: 12 },
  invoiceBox: { marginTop: 14, padding: 14, borderRadius: 14, backgroundColor: "#F1F8F4" },
  invoiceTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  downloadButton: { marginTop: 10, minHeight: 42, borderRadius: 12, backgroundColor: colors.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  downloadText: { color: colors.white, fontSize: 12, fontWeight: "800" },
  aiNote: { color: colors.muted2, fontSize: 11, lineHeight: 16, marginTop: 10 },
});
