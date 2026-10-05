import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const KEY = "role_picker_banner";
const CACHE_KEY = "pc.banner.role_picker";

export const DEFAULT_ROLE_PICKER_BANNER = {
  badge: "THE TRUSTED WAY TO BEGIN",
  title: "Your shubh karya,\nhandled with care.",
  imageUrl: "",
};

function normalize(input) {
  const source = input && typeof input === "object" ? input : {};
  const text = (value, fallback) => (typeof value === "string" && value.trim() ? value.replace(/\r\n/g, "\n").trim() : fallback);
  return {
    badge: text(source.badge, DEFAULT_ROLE_PICKER_BANNER.badge),
    title: text(source.title, DEFAULT_ROLE_PICKER_BANNER.title),
    imageUrl: typeof source.imageUrl === "string" && /^https:\/\//i.test(source.imageUrl) ? source.imageUrl : "",
  };
}

export function useRolePickerBanner() {
  const [banner, setBanner] = useState(DEFAULT_ROLE_PICKER_BANNER);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CACHE_KEY).then((raw) => {
      if (!active || !raw) return;
      try { setBanner(normalize(JSON.parse(raw))); } catch { /* ignore a corrupt cache */ }
    }).catch(() => {});
    if (supabase) {
      supabase.from("platform_settings").select("value").eq("key", KEY).maybeSingle().then(({ data }) => {
        if (!active) return;
        let parsed = null;
        try { parsed = data?.value ? JSON.parse(data.value) : null; } catch { parsed = null; }
        const next = normalize(parsed);
        setBanner(next);
        AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
      }, () => {});
    }
    return () => { active = false; };
  }, []);

  return banner;
}
