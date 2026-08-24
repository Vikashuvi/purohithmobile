import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Image, Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { UserRound } from "lucide-react-native";
import { colors, radii, spacing, font } from "../../lib/theme";
import { Button, Card, Field } from "../../components/UI";
import api, { API_URL, tokens } from "../../lib/api";

const LANGUAGES = ["Kannada", "Sanskrit", "English", "Hindi", "Tamil", "Telugu", "Marathi", "Malayalam"];
const AREAS = ["Jayanagar", "Malleshwaram", "Basavanagudi", "Whitefield", "Indiranagar",
  "Koramangala", "HSR", "Yelahanka", "Rajajinagar", "Banashankari"];
const POOJAS = ["ganesh", "griha-pravesh", "satyanarayan", "navagraha", "rudrabhishek"];

export default function PriestOnboarding({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [experience, setExperience] = useState("");
  const [langs, setLangs] = useState(new Set(["Kannada", "Sanskrit"]));
  const [areas, setAreas] = useState(new Set());
  const [poojas, setPoojas] = useState(new Set());
  const [photoUri, setPhotoUri] = useState(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [idDocUrl, setIdDocUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/priest/me").then(({ data }) => {
      setProfile(data);
      if (data) {
        setName(data.name || "");
        setBio(data.bio || "");
        setExperience(String(data.experience_years || ""));
        setLangs(new Set(data.languages || ["Kannada"]));
        setAreas(new Set(data.service_areas || []));
        setPoojas(new Set(data.poojas_offered || []));
        setPhotoUrl(data.photo_url || "");
      }
    }).catch(() => {});
  }, []);

  const toggle = (set, val, setter) => {
    setter((prev) => {
      const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val);
      return n;
    });
  };

  const pickImage = async (setter, kind = "photo") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission denied", "Enable photo access in Settings.");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: kind === "photo" ? [1, 1] : [4, 3], quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPhotoUri(asset.uri);
    // Upload to /api/storage/upload (multipart)
    const form = new FormData();
    form.append("file", { uri: asset.uri, name: `upload.jpg`, type: "image/jpeg" });
    form.append("purpose", kind === "photo" ? "priest_photo" : "priest_kyc");
    try {
      const tok = await tokens.getAccess();
      const resp = await fetch(`${API_URL}/api/storage/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
        body: form,
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json?.detail || "Upload failed");
      const url = json.url || json.download_url || `/api/files/${json.file_id}`;
      setter(url);
    } catch (e) {
      Alert.alert("Upload failed", String(e.message || e));
    }
  };

  const save = async () => {
    if (!name.trim() || !bio.trim() || !experience || langs.size === 0) {
      return Alert.alert("Missing", "Name, bio, experience and at least one language are required.");
    }
    setSaving(true);
    try {
      await api.post("/priest/onboarding", {
        name,
        bio,
        experience_years: Number(experience) || 0,
        languages: Array.from(langs),
        poojas_offered: Array.from(poojas),
        service_areas: Array.from(areas),
        photo_url: photoUrl,
        id_proof_url: idDocUrl,
      });
      Alert.alert("Saved", "Profile submitted. Admin will verify shortly.");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Failed", e?.response?.data?.detail || "Try again");
    } finally { setSaving(false); }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.kicker}>PUBLIC LISTING</Text>
      <Text style={styles.h1}>Build your priest profile</Text>
      <Text style={styles.sub}>{profile?.verification_status === "verified" ? "Verified and visible to customers" : "Complete the essentials, then submit for verification."}</Text>
      <View style={styles.progress}><ProgressItem value="01" label="Identity" done /><View style={styles.progressLine} /><ProgressItem value="02" label="Practice" done={Boolean(name && bio)} /><View style={styles.progressLine} /><ProgressItem value="03" label="Verify" done={Boolean(idDocUrl)} /></View>

      {/* Photo */}
      <Card style={styles.uploadCard}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
          {photoUrl ? (
            <Image source={{ uri: photoUri || (photoUrl.startsWith("http") ? photoUrl : `${API_URL}${photoUrl}`) }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <UserRound size={28} color={colors.ink} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", color: colors.ink }}>Photo</Text>
            <Text style={styles.hint}>Face clearly visible, no filter</Text>
            <Pressable testID="pick-photo" onPress={() => pickImage(setPhotoUrl, "photo")} style={styles.smallBtn}>
              <Text style={styles.smallBtnTxt}>{photoUrl ? "Change" : "Upload"}</Text>
            </Pressable>
          </View>
        </View>
      </Card>

      <Field label="Display name">
        <TextInput testID="priest-name-input" value={name} onChangeText={setName} placeholder="Your full name" style={styles.input} />
      </Field>
      <Field label="About you">
        <TextInput testID="bio-input" multiline value={bio} onChangeText={setBio}
          placeholder="Traditional Vedic priest with 15 years of experience..."
          style={[styles.input, { minHeight: 90 }]} />
      </Field>
      <Field label="Experience (years)">
        <TextInput testID="experience-input" keyboardType="number-pad" value={experience} onChangeText={setExperience}
          placeholder="e.g. 12" style={styles.input} />
      </Field>

      <Text style={styles.sectionTitle}>Languages</Text>
      <View style={styles.chipRow}>
        {LANGUAGES.map(l => (
          <Chip key={l} label={l} active={langs.has(l)} onPress={() => toggle(langs, l, setLangs)} testID={`lang-${l}`} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Pooja specialties</Text>
      <View style={styles.chipRow}>
        {POOJAS.map(p => (
          <Chip key={p} label={p} active={poojas.has(p)} onPress={() => toggle(poojas, p, setPoojas)} testID={`pooja-${p}`} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>Service areas</Text>
      <View style={styles.chipRow}>
        {AREAS.map(a => (
          <Chip key={a} label={a} active={areas.has(a)} onPress={() => toggle(areas, a, setAreas)} testID={`area-${a}`} />
        ))}
      </View>

      <Text style={styles.sectionTitle}>ID Proof</Text>
      <Card style={styles.documentCard}>
        {idDocUrl ? <Text style={{ color: colors.success, fontWeight: "700" }}>✓ Uploaded</Text> : <Text style={styles.hint}>Aadhaar / PAN — for admin verification</Text>}
        <Pressable testID="pick-id" onPress={() => pickImage(setIdDocUrl, "id")} style={[styles.smallBtn, { alignSelf: "flex-start", marginTop: 8 }]}>
          <Text style={styles.smallBtnTxt}>{idDocUrl ? "Replace" : "Upload"}</Text>
        </Pressable>
      </Card>

      <Button testID="save-profile-btn" title={saving ? "Saving…" : "Submit for verification"} onPress={save} disabled={saving} style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
}

function Chip({ label, active, onPress, testID }) {
  return (
    <Pressable testID={testID} onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipTxt, active && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

function ProgressItem({ value, label, done }) { return <View style={styles.progressItem}><View style={[styles.progressDot, done && styles.progressDotDone]}><Text style={[styles.progressNumber, done && { color: colors.white }]}>{value}</Text></View><Text style={styles.progressLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white }, content: { width: "100%", maxWidth: 760, alignSelf: "center", padding: spacing.lg, paddingBottom: 52 },
  kicker: { color: colors.saffron, fontSize: 10, fontWeight: "700", letterSpacing: .8, marginTop: 8 },
  h1: { fontSize: 31, lineHeight: 38, fontWeight: "700", color: colors.ink, marginTop: 6 },
  sub: { color: colors.muted2, fontSize: font.sizes.sm, marginTop: 4 },
  progress: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", marginTop: 26, marginBottom: 8 }, progressItem: { width: 62, alignItems: "center" }, progressDot: { width: 31, height: 31, borderRadius: 16, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" }, progressDotDone: { backgroundColor: colors.ink }, progressNumber: { color: colors.muted2, fontSize: 9, fontWeight: "700" }, progressLabel: { color: colors.muted2, fontSize: 9, marginTop: 5 }, progressLine: { width: 48, height: 1, backgroundColor: colors.warmBorder, marginTop: 15 },
  sectionTitle: { fontSize: font.sizes.sm, fontWeight: "700", color: colors.ink, marginTop: 28, marginBottom: 10, paddingTop: 20, borderTopWidth: 1, borderColor: colors.warmBorder },
  input: {
    minHeight: 54, borderRadius: radii.md, backgroundColor: colors.muted,
    borderWidth: 0, paddingHorizontal: spacing.lg, paddingVertical: 10,
    fontSize: font.sizes.base, color: colors.ink,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.warmBorder },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipTxt: { fontSize: font.sizes.xs, color: colors.ink, fontWeight: "600" },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.muted },
  avatarPlaceholder: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
  uploadCard: { marginTop: spacing.lg, borderRadius: radii.lg, padding: spacing.lg, shadowOpacity: 0, elevation: 0, borderWidth: 0, backgroundColor: colors.muted },
  documentCard: { borderRadius: radii.lg, padding: spacing.lg, shadowOpacity: 0, elevation: 0, borderWidth: 0, backgroundColor: colors.muted },
  hint: { fontSize: font.sizes.xs, color: colors.muted2, marginTop: 2 },
  smallBtn: { alignSelf: "flex-start", marginTop: 8, paddingHorizontal: 15, paddingVertical: 8, borderRadius: radii.pill, backgroundColor: colors.ink },
  smallBtnTxt: { color: colors.white, fontWeight: "700", fontSize: font.sizes.xs },
});
