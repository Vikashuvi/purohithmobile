// Auth context: role, user, biometric-guarded session restore.
import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import api, { tokens } from "./api";
import { t } from "./i18n";
import { supabase } from "./supabase";
import { unregisterPush } from "./notifications";
import { unregisterWebPush } from "./webPush";
import { signOutFirebaseGoogle } from "./firebaseGoogle";

const AuthCtx = createContext(null);

function normalizeRole(role) {
  return role === "priest" ? "priest" : "customer";
}

function profileFromSupabaseUser(authUser, fallbackRole) {
  const metadata = authUser?.user_metadata || {};
  const role = normalizeRole(metadata.role || fallbackRole);
  return {
    id: authUser.id,
    role,
    name: metadata.full_name || metadata.name || authUser.email?.split("@")[0] || "Purohith user",
    phone: metadata.phone || "",
    email: authUser.email || "",
    avatarUrl: metadata.avatar_url || metadata.picture || "",
    emailVerified: Boolean(authUser.email_confirmed_at),
    onboardingRequired: role === "priest" && metadata.onboarding_required === true,
  };
}

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);   // { id, role, name, phone, ... }
  const [role, setRoleState] = useState(null);
  const signingOutRef = useRef(false);
  const interactiveAuthRef = useRef(false);
  const restoringRef = useRef(true);

  const beginInteractiveAuth = useCallback(() => { interactiveAuthRef.current = true; }, []);
  const endInteractiveAuth = useCallback(() => { interactiveAuthRef.current = false; }, []);

  const setRole = useCallback(async (r) => {
    setRoleState(r);
    await tokens.setRole(r);
  }, []);

  const resetRole = useCallback(async () => {
    setRoleState(null);
    await tokens.setRole(null);
  }, []);

  const syncSupabaseProfile = useCallback(async (authUser, fallbackRole) => {
    if (!supabase || !authUser) return null;
    const metadataUser = profileFromSupabaseUser(authUser, fallbackRole);
    const [{ data: existing, error: userError }, { data: priestProfile, error: priestError }] = await Promise.all([
      supabase.from("app_users").select("id,role,full_name,phone,email,avatar_url,is_active").eq("id", authUser.id).maybeSingle(),
      supabase.from("priest_profiles").select("id,onboarding_step,verification_status").eq("user_id", authUser.id).maybeSingle(),
    ]);
    if (userError) throw userError;
    if (priestError) throw priestError;
    if (!existing) throw new Error("Your account profile could not be loaded. Please try signing in again.");
    if (existing?.is_active === false) throw new Error("This account has been suspended. Contact support for help.");
    if (existing.role !== "customer" && existing.role !== "priest") {
      throw new Error("This account belongs to the admin panel. Please sign in there instead.");
    }
    const resolvedRole = existing.role;
    const nextUser = {
      ...metadataUser,
      role: resolvedRole,
      name: existing?.full_name || metadataUser.name,
      phone: existing?.phone || metadataUser.phone,
      email: existing?.email || metadataUser.email,
      avatarUrl: existing?.avatar_url || metadataUser.avatarUrl,
      onboardingRequired: resolvedRole === "priest" && (!priestProfile || Number(priestProfile.onboarding_step || 0) < 3),
      priestProfileId: priestProfile?.id || null,
      verificationStatus: priestProfile?.verification_status || null,
    };
    return nextUser;
  }, []);

  const applySupabaseSession = useCallback(async (session, fallbackRole, expectedRole) => {
    if (!session?.user || !session.access_token) return null;
    const nextUser = await syncSupabaseProfile(session.user, fallbackRole);
    if (!nextUser) return null;
    if (expectedRole && nextUser.role !== expectedRole) {
      throw new Error(`This account is registered as a ${nextUser.role}. Go back and choose that role to sign in.`);
    }
    await tokens.setAccess(session.access_token);
    if (session.refresh_token) await tokens.setRefresh(session.refresh_token);
    await tokens.setUser(nextUser);
    await tokens.setRole(nextUser.role);
    setUser(nextUser);
    setRoleState(nextUser.role);
    return nextUser;
  }, [syncSupabaseProfile]);

  const login = useCallback(async ({ access_token, refresh_token, user: u }) => {
    await tokens.setAccess(access_token);
    if (refresh_token) await tokens.setRefresh(refresh_token);
    await tokens.setUser(u);
    setUser(u);
    setRoleState(u.role);
    await tokens.setRole(u.role);
  }, []);

  const logout = useCallback(async () => {
    signingOutRef.current = true;
    await unregisterPush();
    if (Platform.OS === "web") await unregisterWebPush().catch(() => {});
    setUser(null);
    setRoleState(null);
    await tokens.clear();
    try {
      if (supabase) await supabase.auth.signOut({ scope: "local" });
    } catch (_) { /* local app state is already signed out */ }
    if (Platform.OS === "web") await signOutFirebaseGoogle().catch(() => {});
    try { await api.post("/auth/logout"); } catch (_) { /* legacy API is best effort */ }
    signingOutRef.current = false;
  }, []);

  const completeOnboarding = useCallback(async (verificationStatus = "pending") => {
    if (supabase) {
      const { error } = await supabase.auth.updateUser({
        data: { onboarding_required: false, onboarding_completed: true },
      });
      // The saved priest profile is authoritative. A metadata sync failure must not trap the user on this screen.
      if (error) console.warn("Could not sync onboarding metadata:", error.message);
    }
    setUser((current) => {
      if (!current) return current;
      const updated = { ...current, onboardingRequired: false, verificationStatus };
      tokens.setUser(updated).catch(() => {});
      return updated;
    });
  }, []);

  const updateProfile = useCallback(async ({ name, phone } = {}) => {
    if (!user?.id) return null;
    const cleanPhone = phone !== undefined ? String(phone).replace(/\D/g, "").slice(-10) : undefined;
    const cleanName = name !== undefined ? String(name).trim() : undefined;
    const nextName = cleanName !== undefined && cleanName !== "" ? cleanName : user.name;
    const nextPhone = cleanPhone !== undefined ? cleanPhone : user.phone;

    if (supabase) {
      const updates = {
        updated_at: new Date().toISOString(),
      };
      if (cleanName !== undefined && cleanName !== "") updates.full_name = cleanName;
      if (cleanPhone !== undefined) updates.phone = cleanPhone;

      const { error } = await supabase.from("app_users").update(updates).eq("id", user.id);
      if (error) {
        throw error;
      }
      const meta = {};
      if (cleanName) meta.full_name = cleanName;
      if (cleanPhone) meta.phone = cleanPhone;
      if (Object.keys(meta).length > 0) {
        await supabase.auth.updateUser({ data: meta }).catch(() => {});
      }
    }

    const nextUser = {
      ...user,
      name: nextName,
      phone: nextPhone,
    };
    setUser(nextUser);
    await tokens.setUser(nextUser).catch(() => {});
    return nextUser;
  }, [user]);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      await tokens.setUser(data);
      return data;
    } catch (_) { return null; }
  }, []);

  const restoreWithBiometric = useCallback(async () => {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        const restored = await applySupabaseSession(data.session, role);
        return Boolean(restored);
      }
    }
    const rt = await tokens.getRefresh();
    if (!rt) return false;
    if (Platform.OS === "web") {
      const me = await refreshMe();
      if (me) { setRoleState(me.role); return true; }
      return false;
    }
    // Only prompt if hardware supports it
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hasHw && (await LocalAuthentication.isEnrolledAsync());
    if (enrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t.biometricPrompt,
        fallbackLabel: "Use passcode",
        disableDeviceFallback: false,
      });
      if (!result.success) return false;
    }
    // Force a refresh via /auth/me (interceptor will auto-refresh access token)
    const me = await refreshMe();
    if (me) { setRoleState(me.role); return true; }
    return false;
  }, [applySupabaseSession, refreshMe, role]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const savedRole = await tokens.getRole();
        if (active && savedRole) setRoleState(savedRole);
        if (supabase) {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) throw sessionError;
          if (sessionData?.session) {
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError || !userData?.user) throw userError || new Error("Session expired");
            await applySupabaseSession({ ...sessionData.session, user: userData.user }, savedRole);
          } else {
            await tokens.clearSession();
          }
        }
      } catch (error) {
        console.warn("Supabase session restore failed", error?.message || error);
        await tokens.clearSession();
        if (active) setUser(null);
      } finally {
        restoringRef.current = false;
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, [applySupabaseSession]);

  useEffect(() => {
    if (!supabase) return undefined;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || signingOutRef.current) {
        setUser(null);
        if (event === "SIGNED_OUT") {
          if (interactiveAuthRef.current && !signingOutRef.current) {
            tokens.clearSession().catch(() => {});
          } else {
            setRoleState(null);
            tokens.clear().catch(() => {});
          }
        }
        return;
      }
      if (session?.user && !interactiveAuthRef.current && !restoringRef.current && event !== "INITIAL_SESSION") {
        setTimeout(() => {
          applySupabaseSession(session, role).catch((error) => {
            console.warn("Supabase profile sync failed", error?.message || error);
          });
        }, 0);
      }
    });
    return () => listener?.subscription?.unsubscribe?.();
  }, [applySupabaseSession, role]);

  return (
    <AuthCtx.Provider value={{
      ready, user, role,
      setRole, resetRole, login, logout, completeOnboarding, updateProfile, refreshMe, restoreWithBiometric, applySupabaseSession,
      beginInteractiveAuth, endInteractiveAuth,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
