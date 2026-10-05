import React, { useEffect, useState } from "react";
import { bindBrandStyles } from "../lib/brandStyles";
import { View, Text, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, Pressable } from "react-native";
import { ArrowLeft, Mail, UserRound, ShieldCheck, KeyRound, LockKeyhole, Eye, EyeOff } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, font } from "../lib/theme";
import { useI18n } from "../lib/i18n";
import { Button, Field } from "../components/UI";
import { PrimaryButton } from "../components/ProductUI";
import { tokens } from "../lib/api";
import { useAuth } from "../lib/auth";
import BrandLogo from "../components/BrandLogo";
import { isSupabaseConfigured, supabase, supabaseConfig } from "../lib/supabase";

const OTP_LENGTH = 8;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9._-]{3,32}$/;

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

async function priestPasswordLogin(identifier, password) {
  const response = await fetch(`${supabaseConfig.url}/functions/v1/priest-password-login`, {
    method: "POST",
    headers: { apikey: supabaseConfig.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) throw new Error(data?.error || "Invalid username, email, or password");
  const { data: sessionData, error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (error) throw error;
  return sessionData?.session;
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { role, resetRole, restoreWithBiometric, applySupabaseSession } = useAuth();
  const isPriest = role === "priest";
  const minPassword = isPriest ? 12 : 8;
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState("signIn");
  const [method, setMethod] = useState("otp"); // otp | password (sign in only)
  const [stage, setStage] = useState("email"); // email → otp, or reset → otp
  const [otpPurpose, setOtpPurpose] = useState("signIn"); // signIn | signUp | reset
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasRefresh, setHasRefresh] = useState(false);

  const clearMessages = () => { setNotice(""); setFormError(""); };

  const handleBack = () => {
    if (stage === "otp" || stage === "reset") {
      setStage("email");
      setOtp("");
      setPassword("");
      clearMessages();
      return;
    }
    resetRole();
  };

  useEffect(() => {
    tokens.getRefresh().then(rt => setHasRefresh(!!rt));
  }, []);

  const passwordProblem = (value, required) => {
    if (!value && !required) return "";
    if (value.length < minPassword) return `Password must be at least ${minPassword} characters.`;
    if (value.length > 72) return "Password must be 72 characters or fewer.";
    return "";
  };

  const requestOtp = async (purpose = mode === "signUp" ? "signUp" : "signIn") => {
    const normalized = normalizeEmail(email);
    clearMessages();
    if (!EMAIL.test(normalized)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (purpose === "signUp" && name.trim().length < 2) {
      setFormError("Enter your full name to create your account.");
      return;
    }
    if (purpose === "signUp") {
      const problem = passwordProblem(password, false);
      if (problem) return setFormError(problem);
    }
    if (!isSupabaseConfigured || !supabase) {
      setFormError("Account creation is temporarily unavailable. Please try again shortly.");
      return;
    }
    setLoading(true);
    setNotice(purpose === "signUp"
      ? "Creating your account and sending the secure email code. This can take a few seconds."
      : "Sending your secure code. This can take a few seconds.");
    try {
      const options = { shouldCreateUser: purpose === "signUp" };
      if (purpose === "signUp") {
        options.data = {
          role: role || "customer",
          full_name: name.trim(),
          onboarding_required: isPriest,
          source: Platform.OS === "web" ? "expo-web" : "expo-mobile",
        };
      }
      const { error } = await supabase.auth.signInWithOtp({ email: normalized, options });
      if (error) throw error;
      setEmail(normalized);
      setOtpPurpose(purpose);
      setStage("otp");
      setNotice(purpose === "signUp"
        ? "Account verification sent. Enter the code from your email to finish creating your account."
        : purpose === "reset"
          ? "Code sent. Enter it below with your new password."
          : "Sign-in code sent. Enter the code from your email.");
    } catch (e) {
      const message = e?.message || "Please try again";
      setNotice("");
      const friendlyMessage = purpose !== "signUp" && /signups|user/i.test(message)
        ? "No account exists for this email. Choose Create account first."
        : /rate limit/i.test(message)
          ? "Too many email attempts. Wait a minute, then try again."
          : /sending|smtp|email/i.test(message)
            ? "We could not send the verification email. Please try again shortly."
            : message;
      setFormError(friendlyMessage);
      if (Platform.OS !== "web") Alert.alert("Email verification failed", friendlyMessage);
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    const normalized = normalizeEmail(email);
    const normalizedOtp = otp.replace(/\D/g, "");
    clearMessages();
    if (normalizedOtp.length !== OTP_LENGTH) {
      setFormError(`Enter the complete ${OTP_LENGTH}-digit code from your latest email.`);
      return;
    }
    const passwordToSet = otpPurpose === "reset" || (otpPurpose === "signUp" && password) ? password : "";
    const problem = otpPurpose === "reset" ? passwordProblem(password, true) : passwordProblem(passwordToSet, false);
    if (problem) return setFormError(problem);
    if (!isSupabaseConfigured || !supabase) {
      setFormError("Verification is temporarily unavailable. Please try again shortly.");
      return;
    }
    setLoading(true);
    setNotice("Verifying your secure email code...");
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: normalized, token: normalizedOtp, type: "email" });
      if (error) throw error;
      if (!data?.session?.user) throw new Error("Verification completed without a session. Request a new code and try again.");
      if (passwordToSet) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: passwordToSet });
        if (passwordError) throw new Error(`Signed in, but the password could not be saved: ${passwordError.message}`);
      }
      const nextUser = await applySupabaseSession(data.session, role);
      if (!nextUser) throw new Error("Your session could not be opened. Request a new code and try again.");
      setNotice(passwordToSet ? "Password saved. Opening your account..." : "Email verified. Opening your account...");
    } catch (e) {
      setNotice("");
      const message = e?.message || "Invalid verification code";
      const friendlyMessage = /expired|invalid|token/i.test(message) && !/password/i.test(message)
        ? "That code is expired or no longer valid. Tap Resend email OTP, then enter only the newest code."
        : message;
      setFormError(friendlyMessage);
      if (Platform.OS !== "web") Alert.alert("Verify failed", friendlyMessage);
    } finally { setLoading(false); }
  };

  const signInWithPassword = async () => {
    const id = identifier.trim().toLowerCase();
    clearMessages();
    if (isPriest ? !(EMAIL.test(id) || USERNAME.test(id)) : !EMAIL.test(id)) {
      return setFormError(isPriest ? "Enter your username or email address." : "Enter a valid email address.");
    }
    if (!password) return setFormError("Enter your password.");
    if (!isSupabaseConfigured || !supabase) return setFormError("Sign in is temporarily unavailable. Please try again shortly.");
    setLoading(true);
    setNotice("Signing you in...");
    try {
      let session;
      if (isPriest) {
        session = await priestPasswordLogin(id, password);
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: id, password });
        if (error) throw error;
        session = data?.session;
      }
      if (!session?.user) throw new Error("Sign in did not return a session. Please try again.");
      const nextUser = await applySupabaseSession(session, role);
      if (!nextUser) throw new Error("Your session could not be opened. Please try again.");
      setNotice("Signed in. Opening your account...");
    } catch (e) {
      setNotice("");
      const message = e?.message || "Sign in failed";
      const friendlyMessage = /invalid|credentials/i.test(message)
        ? `Incorrect ${isPriest ? "username/email" : "email"} or password. If you signed up with an email code, use "Set or reset password" first.`
        : /not confirmed/i.test(message)
          ? "Verify your email first: sign in once with an email code."
          : message;
      setFormError(friendlyMessage);
      if (Platform.OS !== "web") Alert.alert("Sign in failed", friendlyMessage);
    } finally { setLoading(false); }
  };

  const tryBiometric = async () => {
    const ok = await restoreWithBiometric();
    if (!ok) Alert.alert("Session expired", "Please sign in with OTP again.");
  };

  const switchMode = (next) => { setMode(next); if (next === "signUp") setMethod("otp"); setPassword(""); clearMessages(); };
  const switchMethod = (next) => { setMethod(next); setPassword(""); clearMessages(); };

  const topPadding = Math.max(insets.top, 16) + 8;
  const passwordMode = stage === "email" && mode === "signIn" && method === "password";
  const title = stage === "otp"
    ? otpPurpose === "reset" ? "Set a new password" : "Check your email"
    : stage === "reset" ? "Set or reset password" : mode === "signUp" ? "Create your account" : "Welcome back";
  const subtitle = stage === "otp"
    ? `We sent a verification code to ${email}`
    : stage === "reset"
      ? "We'll email you a code. Use it to set a new password, even if you've only used email codes so far."
      : isPriest ? "Join families looking for trusted Purohits." : "Plan and manage every sacred ceremony in one place.";

  const passwordInput = (testID, placeholder, onSubmit) => (
    <View style={styles.inputWrap}><LockKeyhole size={18} color={colors.muted2} />
      <TextInput
        testID={testID}
        value={password}
        onChangeText={(value) => { setPassword(value); setFormError(""); }}
        placeholder={placeholder}
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={testID === "password-input" ? "current-password" : "new-password"}
        textContentType={testID === "password-input" ? "password" : "newPassword"}
        style={styles.inputBare}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <Pressable accessibilityLabel={showPassword ? "Hide password" : "Show password"} hitSlop={10} onPress={() => setShowPassword((value) => !value)}>
        {showPassword ? <EyeOff size={18} color={colors.muted2} /> : <Eye size={18} color={colors.muted2} />}
      </Pressable>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.white }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: topPadding }]} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={handleBack}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            style={({ pressed }) => [styles.back, pressed && { opacity: 0.6, transform: [{ scale: 0.95 }] }]}
          >
            <ArrowLeft size={20} color={colors.brandBrown} />
          </Pressable>
          <View style={styles.roleBadge}><Text style={styles.roleBadgeText}>{isPriest ? "PRIEST APP" : "BOOKING APP"}</Text></View>
        </View>
        <View style={styles.brandRow}><BrandLogo width={214} height={96} showText={false} /><Text style={styles.brandMode}>{isPriest ? "Purohit partner workspace" : "Book trusted Vedic services"}</Text></View>
        {stage === "email" ? (
          <View style={styles.authTabs}>
            <Pressable testID="sign-in-tab" onPress={() => switchMode("signIn")} style={[styles.authTab, mode === "signIn" && styles.authTabActive]}><Text style={[styles.authTabText, mode === "signIn" && styles.authTabTextActive]}>Sign in</Text></Pressable>
            <Pressable testID="sign-up-tab" onPress={() => switchMode("signUp")} style={[styles.authTab, mode === "signUp" && styles.authTabActive]}><Text style={[styles.authTabText, mode === "signUp" && styles.authTabTextActive]}>Create account</Text></Pressable>
          </View>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{subtitle}</Text>
        {stage === "email" && mode === "signIn" ? (
          <View style={styles.methodRow}>
            <Pressable testID="method-otp" onPress={() => switchMethod("otp")} style={[styles.methodChip, method === "otp" && styles.methodChipActive]}>
              <Mail size={14} color={method === "otp" ? colors.white : colors.brandBrown} />
              <Text style={[styles.methodText, method === "otp" && styles.methodTextActive]}>Email code</Text>
            </Pressable>
            <Pressable testID="method-password" onPress={() => switchMethod("password")} style={[styles.methodChip, method === "password" && styles.methodChipActive]}>
              <KeyRound size={14} color={method === "password" ? colors.white : colors.brandBrown} />
              <Text style={[styles.methodText, method === "password" && styles.methodTextActive]}>{isPriest ? "Username & password" : "Password"}</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.security}><ShieldCheck size={15} color={colors.success} /><Text style={styles.securityText}>{passwordMode ? "Passwords are encrypted and never visible to anyone" : "Verified by secure email OTP"}</Text></View>
        {notice ? (
          <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View>
        ) : null}
        {formError ? (
          <View testID="auth-error" accessibilityRole="alert" style={styles.errorNotice}><Text style={styles.errorNoticeText}>{formError}</Text></View>
        ) : null}

        {passwordMode ? (
          <>
            <Field label={isPriest ? "Username or email" : "Email address"}>
              <View style={styles.inputWrap}>{isPriest ? <UserRound size={18} color={colors.muted2} /> : <Mail size={18} color={colors.muted2} />}
              <TextInput
                testID="identifier-input"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete={isPriest ? "username" : "email"}
                keyboardType={isPriest ? "default" : "email-address"}
                value={identifier}
                onChangeText={(value) => { setIdentifier(value); setFormError(""); }}
                placeholder={isPriest ? "purohit-xxxxxx or you@example.com" : "you@example.com"}
                style={styles.inputBare}
                returnKeyType="next"
              />
              </View>
            </Field>
            <Field label="Password">{passwordInput("password-input", "Your password", signInWithPassword)}</Field>
            <PrimaryButton testID="password-sign-in-btn" title={loading ? t.loggingIn : "Sign in"} onPress={signInWithPassword} disabled={loading} />
            <Pressable onPress={() => { setEmail(EMAIL.test(identifier.trim()) ? identifier.trim() : email); setPassword(""); clearMessages(); setStage("reset"); }} style={styles.linkBtn}>
              <KeyRound size={15} color={colors.saffron} />
              <Text style={styles.linkText}>Forgot or never set a password?</Text>
            </Pressable>
          </>
        ) : stage === "email" ? (
          <>
            <Field label="Email address">
              <View style={styles.inputWrap}><Mail size={18} color={colors.muted2} />
              <TextInput
                testID="email-input"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={(value) => { setEmail(value); setFormError(""); }}
                placeholder="you@example.com"
                style={styles.inputBare}
                returnKeyType={mode === "signUp" ? "next" : "go"}
                onSubmitEditing={mode === "signIn" ? () => requestOtp("signIn") : undefined}
              />
              </View>
            </Field>
            {mode === "signUp" ? <>
              <Field label="Full name">
                <View style={styles.inputWrap}><UserRound size={18} color={colors.muted2} /><TextInput
                  testID="name-input"
                  value={name}
                  onChangeText={(value) => { setName(value); setFormError(""); }}
                  placeholder="Your full name"
                  style={styles.inputBare}
                  returnKeyType="next"
                />
                </View>
              </Field>
              <Field label={`Password (optional, ${minPassword}+ characters)`}>{passwordInput("signup-password-input", "Create a password to sign in faster", () => requestOtp("signUp"))}</Field>
              <Text style={styles.otpHint}>You can always sign in with an email code too.</Text>
            </> : null}
            <PrimaryButton testID="send-otp-btn" title={loading ? (mode === "signUp" ? "Creating account..." : "Sending code...") : mode === "signUp" ? "Create account with email" : "Continue with email"} onPress={() => requestOtp(mode === "signUp" ? "signUp" : "signIn")} disabled={loading} />
            <Pressable onPress={() => { setPassword(""); clearMessages(); setStage("reset"); }} style={styles.linkBtn}>
              <KeyRound size={15} color={colors.saffron} />
              <Text style={styles.linkText}>Set or reset password</Text>
            </Pressable>
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
        ) : stage === "reset" ? (
          <>
            <Field label="Account email">
              <View style={styles.inputWrap}><Mail size={18} color={colors.muted2} />
              <TextInput
                testID="reset-email-input"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                style={styles.inputBare}
                returnKeyType="go"
                onSubmitEditing={() => requestOtp("reset")}
              />
              </View>
            </Field>
            {isPriest ? <Text style={styles.otpHint}>Signed in with a username from the admin team? Use the email on your account, or ask support to reset it.</Text> : null}
            <PrimaryButton testID="reset-password-btn" title={loading ? "Sending code..." : "Email me a code"} onPress={() => requestOtp("reset")} disabled={loading} />
            <Pressable onPress={() => { setStage("email"); clearMessages(); }}>
              <Text style={{ color: colors.brandOrangeDark, textAlign: "center", marginTop: spacing.md }}>Back to sign in</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Field label={`${t.enterOtp} (${OTP_LENGTH} digits)`}>
              <TextInput
                testID="otp-input"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={OTP_LENGTH}
                value={otp}
                onChangeText={(value) => { setOtp(value.replace(/\D/g, "").slice(0, OTP_LENGTH)); setFormError(""); }}
                placeholder={`${OTP_LENGTH}-digit email verification code`}
                returnKeyType={otpPurpose === "reset" ? "next" : "done"}
                onSubmitEditing={otpPurpose === "reset" ? undefined : verifyOtp}
                style={styles.input}
              />
            </Field>
            {otpPurpose === "reset" ? <Field label={`New password (${minPassword}+ characters)`}>{passwordInput("new-password-input", "Choose a new password", verifyOtp)}</Field> : null}
            <PrimaryButton testID="verify-otp-btn" title={loading ? t.loggingIn : otpPurpose === "reset" ? "Save password and sign in" : t.verifyOtp} onPress={verifyOtp} disabled={loading} />
            <Pressable onPress={() => { setOtp(""); requestOtp(otpPurpose); }} disabled={loading}>
              <Text style={{ color: colors.brandOrangeDark, textAlign: "center", marginTop: spacing.md }}>Resend email OTP</Text>
            </Pressable>
            <Text style={styles.otpHint}>After resending, earlier codes stop working. Always use the newest email.</Text>
            <Pressable onPress={() => { setStage(otpPurpose === "reset" ? "reset" : "email"); setOtp(""); }}>
              <Text style={{ color: colors.muted2, textAlign: "center", marginTop: spacing.sm }}>Change email</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = bindBrandStyles({
  body: { width: "100%", maxWidth: 560, alignSelf: "center", paddingHorizontal: 24, paddingBottom: 48, gap: spacing.md, backgroundColor: colors.white, minHeight: "100%" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: { width: 44, height: 44, borderWidth: 1, borderColor: "#E4C8CE", borderRadius: 22, alignItems: "center", justifyContent: "center" },
  roleBadge: { borderRadius: radii.pill, backgroundColor: colors.brandTint, paddingHorizontal: 11, paddingVertical: 7 },
  roleBadgeText: { color: colors.brandBrown, fontSize: 9, fontWeight: "800", letterSpacing: .7 },
  brandRow: { alignItems: "flex-start", gap: 3, marginBottom: 8 },
  brandMode: { color: colors.muted2, fontSize: 11, fontWeight: "700", marginLeft: 4, marginTop: -8 },
  authTabs: { flexDirection: "row", padding: 4, borderRadius: 12, backgroundColor: colors.brandTint, marginBottom: 8 },
  authTab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  authTabActive: { backgroundColor: colors.white, shadowColor: colors.brandBrown, shadowOpacity: .1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  authTabText: { color: colors.muted2, fontSize: 13, fontWeight: "700" },
  authTabTextActive: { color: colors.brandBrown },
  methodRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  methodChip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 13, borderRadius: radii.pill, borderWidth: 1, borderColor: "#E4C8CE", backgroundColor: colors.white },
  methodChipActive: { backgroundColor: colors.brandBrown, borderColor: colors.brandBrown },
  methodText: { color: colors.brandBrown, fontSize: 12, fontWeight: "700" },
  methodTextActive: { color: colors.white },
  title: { fontSize: 32, lineHeight: 39, fontWeight: "700", color: colors.ink },
  sub: { fontSize: font.sizes.sm, color: colors.muted2, marginBottom: spacing.sm },
  security: { flexDirection: "row", gap: 7, alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.warmBorder, marginBottom: spacing.lg },
  securityText: { color: colors.muted2, fontSize: 11 },
  notice: { backgroundColor: colors.brandTint, borderWidth: 1, borderColor: "#F5C7AA", borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  noticeText: { color: colors.brandBrown, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  errorNotice: { backgroundColor: "#FFF1F0", borderWidth: 1, borderColor: "#E7AAA3", borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  errorNoticeText: { color: "#8F271F", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  otpHint: { color: colors.muted2, fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: -4 },
  input: {
    height: 50, borderRadius: radii.md, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.warmBorder, paddingHorizontal: spacing.lg,
    fontSize: font.sizes.base, color: colors.ink,
  },
  inputWrap: { height: 54, borderRadius: radii.md, backgroundColor: colors.muted, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: "transparent" },
  inputBare: { flex: 1, fontSize: font.sizes.base, color: colors.ink, paddingVertical: 0 },
  linkBtn: { minHeight: 44, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  linkText: { color: colors.brandOrangeDark, fontWeight: "700", fontSize: font.sizes.sm },
});
