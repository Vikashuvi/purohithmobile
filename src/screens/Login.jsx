import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { ArrowLeft, Phone, UserRound, ShieldCheck } from "lucide-react-native";
import { colors, radii, spacing, font } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { Button, Field } from "../components/UI";
import { PrimaryButton } from "../components/ProductUI";
import api, { tokens } from "../lib/api";
import { useAuth } from "../lib/auth";
import { registerForPush } from "../lib/notifications";
import BrandLogo from "../components/BrandLogo";

export default function Login() {
  const { t } = useI18n();
  const { role, resetRole, login, restoreWithBiometric } = useAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [stage, setStage] = useState("phone"); // phone → otp
  const [devOtp, setDevOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasRefresh, setHasRefresh] = useState(false);

  useEffect(() => {
    tokens.getRefresh().then(rt => setHasRefresh(!!rt));
  }, []);

  const requestOtp = async () => {
    if (phone.length !== 10) return Alert.alert("Invalid", "Enter 10-digit phone number");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/request", { phone, role });
      setStage("otp");
      // Mock mode returns dev_otp — surface it so users can log in without SMS.
      if (data?.dev_otp) setDevOtp(data.dev_otp);
    } catch (e) {
      Alert.alert("OTP failed", e?.response?.data?.detail || "Please try again");
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (otp.length < 4) return Alert.alert("OTP too short");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/otp/verify", { phone, otp, role, name });
      await login(data);
      // Best-effort push registration; won't block login.
      registerForPush().catch(() => {});
    } catch (e) {
      Alert.alert("Verify failed", e?.response?.data?.detail || "Invalid OTP");
    } finally { setLoading(false); }
  };

  const tryBiometric = async () => {
    const ok = await restoreWithBiometric();
    if (!ok) Alert.alert("Session expired", "Please sign in with OTP again.");
  };

  const enterDemo = async () => {
    const isPriest = role === "priest";
    await login({
      access_token: null,
      refresh_token: null,
      user: {
        id: isPriest ? "demo-priest" : "demo-customer",
        role,
        name: isPriest ? "Demo Purohit" : "Demo Customer",
        phone: isPriest ? "9000000002" : "9000000001",
        demo: true,
      },
    });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.cotton }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityLabel="Choose account type" onPress={resetRole} hitSlop={12} style={styles.back}><ArrowLeft size={20} color={colors.ink} /></Pressable>
        <View style={styles.brandRow}><BrandLogo width={198} height={90} showText={false} /><Text style={styles.brandMode}>{role === "priest" ? "Purohit partner app" : "User booking app"}</Text></View>
        <Text style={styles.title}>{stage === "phone" ? "Sign in to continue" : "Enter verification code"}</Text>
        <Text style={styles.sub}>{role === "priest" ? t.rolePriest : t.roleCustomer} · secure mobile access</Text>
        <View style={styles.security}><ShieldCheck size={15} color={colors.success} /><Text style={styles.securityText}>Your session is encrypted and private</Text></View>

        {stage === "phone" ? (
          <>
            <Field label={t.enterPhone}>
              <View style={styles.inputWrap}><Phone size={18} color={colors.muted2} /><Text style={styles.country}>+91</Text><View style={styles.inputDivider} />
              <TextInput
                testID="phone-input"
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={setPhone}
                placeholder="10-digit mobile"
                style={styles.inputBare}
              />
              </View>
            </Field>
            <Field label={t.name}>
              <View style={styles.inputWrap}><UserRound size={18} color={colors.muted2} /><TextInput
                testID="name-input"
                value={name}
                onChangeText={setName}
                placeholder="Your name (new users)"
                style={styles.inputBare}
              />
              </View>
            </Field>
            <PrimaryButton testID="send-otp-btn" title={loading ? t.loggingIn : t.sendOtp} onPress={requestOtp} disabled={loading} />
            <Pressable
              testID="demo-credentials-btn"
              onPress={enterDemo}
              style={styles.demoBtn}
            >
              <Text style={styles.demoBtnTxt}>{role === "priest" ? "Enter priest demo" : "Enter customer demo"}</Text>
            </Pressable>
            <Text style={styles.demoHint}>Demo accounts: customer 9000000001 · priest 9000000002</Text>
            {hasRefresh && (
              <Button
                testID="biometric-btn"
                title={t.biometricUnlock}
                onPress={tryBiometric}
                variant="outline"
                style={{ marginTop: spacing.md }}
              />
            )}
          </>
        ) : (
          <>
            {devOtp ? (
              <View style={styles.devBanner}>
                <Text style={styles.devBannerTxt}>Dev OTP: {devOtp}</Text>
              </View>
            ) : null}
            <Field label={t.enterOtp}>
              <TextInput
                testID="otp-input"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
                placeholder="6-digit code"
                style={styles.input}
              />
            </Field>
            <PrimaryButton testID="verify-otp-btn" title={loading ? t.loggingIn : t.verifyOtp} onPress={verifyOtp} disabled={loading} />
            <Pressable onPress={() => { setStage("phone"); setOtp(""); setDevOtp(""); }}>
              <Text style={{ color: colors.saffron, textAlign: "center", marginTop: spacing.md }}>Change number</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.xxl, paddingTop: 20, gap: spacing.md, backgroundColor: colors.white, minHeight: "100%" },
  back: { width: 44, height: 44, borderWidth: 1, borderColor: colors.warmBorder, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  brandRow: { alignItems: "flex-start", gap: 3, marginBottom: 18 },
  brandMode: { color: colors.muted2, fontSize: 11, fontWeight: "700", marginLeft: 4, marginTop: -8 },
  title: { fontSize: 32, lineHeight: 39, fontWeight: "700", color: colors.ink },
  sub: { fontSize: font.sizes.sm, color: colors.muted2, marginBottom: spacing.sm },
  security: { flexDirection: "row", gap: 7, alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.warmBorder, marginBottom: spacing.lg },
  securityText: { color: colors.muted2, fontSize: 11 },
  input: {
    height: 50, borderRadius: radii.md, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.warmBorder, paddingHorizontal: spacing.lg,
    fontSize: font.sizes.base, color: colors.ink,
  },
  inputWrap: { height: 54, borderRadius: radii.md, backgroundColor: colors.muted, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: "transparent" },
  inputBare: { flex: 1, fontSize: font.sizes.base, color: colors.ink, paddingVertical: 0 },
  country: { color: colors.ink, fontWeight: "700", fontSize: font.sizes.sm },
  inputDivider: { width: 1, height: 22, backgroundColor: colors.warmBorder },
  devBanner: { backgroundColor: "#FEF3C7", borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  devBannerTxt: { color: colors.saffronDark, fontWeight: "700", textAlign: "center" },
  demoBtn: { minHeight: 52, borderWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white, borderRadius: radii.md, padding: spacing.md, alignItems: "center", justifyContent: "center" },
  demoBtnTxt: { color: colors.ink, fontWeight: "600", fontSize: font.sizes.sm },
  demoHint: { color: colors.muted2, fontSize: 10, textAlign: "center", marginTop: -4 },
});
