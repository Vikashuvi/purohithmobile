import React, { useState } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, ChevronDown, MapPin, X } from "lucide-react-native";
import { colors, radii, spacing } from "../lib/theme";
import { usePreferences } from "../lib/preferences";
import BrandLogo from "./BrandLogo";

export default function AppTopBar({ showLocation = true }) {
  const { language, setLanguage, area, setArea, areas } = usePreferences();
  const [open, setOpen] = useState(false);
  return <>
    <View style={styles.bar}>
      <BrandLogo width={138} height={48} showText={false} style={styles.brand} />
      {showLocation ? <Pressable style={styles.location} onPress={() => setOpen(true)}>
        <View style={styles.pinTile}><MapPin size={15} color={colors.saffron} /></View><View style={{ flex: 1 }}><Text style={styles.label}>SERVICE LOCATION</Text><Text style={styles.value}>{area.name}, Bengaluru</Text></View><ChevronDown size={16} color={colors.muted2} />
      </Pressable> : <View style={{ flex: 1 }} />}
      <View style={styles.language}>
        <Pressable onPress={() => setLanguage("en")} style={[styles.languageOption, language === "en" && styles.languageActive]}><Text style={[styles.languageText, language === "en" && styles.languageActiveText]}>EN</Text></Pressable>
        <Pressable onPress={() => setLanguage("kn")} style={[styles.languageOption, language === "kn" && styles.languageActive]}><Text style={[styles.languageText, language === "kn" && styles.languageActiveText]}>ಕ</Text></Pressable>
      </View>
    </View>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}><SafeAreaView style={styles.sheet}>
        <View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Select service area</Text><Text style={styles.sheetSub}>Bengaluru</Text></View><Pressable style={styles.close} onPress={() => setOpen(false)}><X size={20} color={colors.ink} /></Pressable></View>
        <ScrollView>{areas.map((item) => <Pressable key={item.id} style={styles.areaRow} onPress={async () => { await setArea(item); setOpen(false); }}>
          <View style={{ flex: 1 }}><Text style={styles.areaName}>{item.name}</Text><Text style={styles.areaMeta}>Purohits serving within the local radius</Text></View>{area.id === item.id ? <Check size={19} color={colors.success} /> : null}
        </Pressable>)}</ScrollView>
      </SafeAreaView></View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  bar: { width: "100%", maxWidth: 1180, minHeight: 62, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderColor: colors.warmBorder },
  brand: { flexShrink: 0, width: 138 },
  location: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  pinTile: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#FFF2EC", alignItems: "center", justifyContent: "center" },
  label: { fontSize: 8, color: colors.muted2, fontWeight: "600", letterSpacing: .5 },
  value: { fontSize: 13, color: colors.ink, fontWeight: "700", marginTop: 1 },
  language: { flexDirection: "row", padding: 2, borderRadius: 18, backgroundColor: colors.muted },
  languageOption: { width: 32, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 14 },
  languageActive: { backgroundColor: colors.white },
  languageText: { color: colors.muted2, fontSize: 11, fontWeight: "600" },
  languageActiveText: { color: colors.ink },
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.36)" },
  sheet: { maxHeight: "78%", backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: spacing.lg },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg, borderBottomWidth: 1, borderColor: colors.warmBorder },
  sheetTitle: { fontSize: 22, color: colors.ink, fontWeight: "700" },
  sheetSub: { fontSize: 11, color: colors.muted2, marginTop: 2 },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.warmBorder, borderRadius: radii.sm },
  areaRow: { minHeight: 64, flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.warmBorder },
  areaName: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  areaMeta: { color: colors.muted2, fontSize: 10, marginTop: 2 },
});
