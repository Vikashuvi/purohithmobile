// Purohith Connect — axios client (shared, mirrors /app/frontend/src/lib/api.js).
// Handles JWT access/refresh rotation, token persistence, and auto-logout on 401.
import axios from "axios";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

const EXTRA = Constants.expoConfig?.extra || Constants.manifest?.extra || {};
export const API_URL = (EXTRA.apiUrl || "").replace(/\/$/, "");
export const API = `${API_URL}/api`;

const ACCESS_KEY = "pc.access";
const REFRESH_KEY = "pc.refresh";
const ROLE_KEY = "pc.role";        // remembered role (customer / priest)
const USER_KEY = "pc.user";        // JSON user snapshot

const storage = {
  async set(key, value) {
    if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async get(key) {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async del(key) {
    if (Platform.OS === "web") return AsyncStorage.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};

export const tokens = {
  async setAccess(t) { t ? await storage.set(ACCESS_KEY, t) : await storage.del(ACCESS_KEY); },
  async setRefresh(t) { t ? await storage.set(REFRESH_KEY, t) : await storage.del(REFRESH_KEY); },
  async getAccess() { return storage.get(ACCESS_KEY); },
  async getRefresh() { return storage.get(REFRESH_KEY); },
  async setRole(r) { r ? await storage.set(ROLE_KEY, r) : await storage.del(ROLE_KEY); },
  async getRole() { return storage.get(ROLE_KEY); },
  async setUser(u) { await storage.set(USER_KEY, JSON.stringify(u || {})); },
  async getUser() { const s = await storage.get(USER_KEY); return s ? JSON.parse(s) : null; },
  async clear() {
    await Promise.all([
      storage.del(ACCESS_KEY),
      storage.del(REFRESH_KEY),
      storage.del(USER_KEY),
    ]);
  },
};

const api = axios.create({ baseURL: API, timeout: 20000 });

// Attach access token
api.interceptors.request.use(async (config) => {
  const t = await tokens.getAccess();
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// Auto-refresh on 401
let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        if (!refreshing) refreshing = doRefresh();
        const newAccess = await refreshing;
        refreshing = null;
        if (newAccess) {
          original.headers.Authorization = `Bearer ${newAccess}`;
          return api(original);
        }
      } catch (_) {
        refreshing = null;
        await tokens.clear();
      }
    }
    return Promise.reject(err);
  }
);

async function doRefresh() {
  const rt = await tokens.getRefresh();
  if (!rt) return null;
  const { data } = await axios.post(`${API}/auth/refresh`, { refresh_token: rt });
  if (data?.access_token) {
    await tokens.setAccess(data.access_token);
    if (data.refresh_token) await tokens.setRefresh(data.refresh_token);
    return data.access_token;
  }
  return null;
}

export default api;
