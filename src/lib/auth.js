// Auth context: role, user, biometric-guarded session restore.
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import api, { tokens } from "./api";
import { t } from "./i18n";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState(null);   // { id, role, name, phone, ... }
  const [role, setRoleState] = useState(null);

  const setRole = useCallback(async (r) => {
    setRoleState(r);
    await tokens.setRole(r);
  }, []);

  const resetRole = useCallback(async () => {
    setRoleState(null);
    await tokens.setRole(null);
  }, []);

  const login = useCallback(async ({ access_token, refresh_token, user: u }) => {
    await tokens.setAccess(access_token);
    if (refresh_token) await tokens.setRefresh(refresh_token);
    await tokens.setUser(u);
    setUser(u);
    setRoleState(u.role);
    await tokens.setRole(u.role);
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch (_) { /* ignore */ }
    await tokens.clear();
    setUser(null);
    // Preserve role so re-open lands on Login of same tab.
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      await tokens.setUser(data);
      return data;
    } catch (_) { return null; }
  }, []);

  const restoreWithBiometric = useCallback(async () => {
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
  }, [refreshMe]);

  useEffect(() => {
    (async () => {
      const [savedRole, savedUser] = await Promise.all([tokens.getRole(), tokens.getUser()]);
      if (savedRole) setRoleState(savedRole);
      if (savedUser) setUser(savedUser);
      setReady(true);
    })();
  }, []);

  return (
    <AuthCtx.Provider value={{
      ready, user, role,
      setRole, resetRole, login, logout, refreshMe, restoreWithBiometric,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
