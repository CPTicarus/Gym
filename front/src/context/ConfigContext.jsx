import { createContext, useEffect, useMemo, useState } from "react";

import { fetchPublicConfig, updateBranding, updateChatMediaSettings } from "../api/config.js";
import { DEFAULT_BRANDING } from "../config/brand.js";

export const ConfigContext = createContext(null);

/**
 * How this gym is set up, as the backend reports it (GET /api/config/).
 *
 * The workflow is chosen on the backend (MEMBER_SIGNUP), which is also
 * what enforces it; this only lets the screens follow along. Until the
 * answer arrives, or if it never does, the app behaves like a
 * staff-managed gym, the default. A missing sign-up link is the safe
 * thing to show by mistake, and the server refuses sign-ups there anyway.
 *
 * `isLoaded` is for the few screens that must not decide early: the
 * sign-up page shouldn't bounce someone to the login page just because
 * the answer hasn't come back yet.
 */
export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPublicConfig()
      .then((config) => {
        if (!cancelled) setConfig(config);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const branding = useMemo(() => ({ ...DEFAULT_BRANDING, ...config?.branding }), [config?.branding]);

  useEffect(() => {
    if (isLoaded) document.title = `${branding.name} — پنل مدیریت باشگاه`;
  }, [isLoaded, branding.name]);

  async function saveBranding(changes) {
    const overrides = await updateBranding(changes);
    setConfig((current) => ({ ...current, branding: overrides }));
    return { ...DEFAULT_BRANDING, ...overrides };
  }

  async function saveChatMediaSettings(changes) {
    const chatMedia = await updateChatMediaSettings(changes);
    setConfig((current) => ({ ...current, chat_media: chatMedia }));
    return chatMedia;
  }

  function retryConfig() {
    setIsLoaded(false);
    setAttempt((n) => n + 1);
  }

  const value = {
    isSelfSignup: config?.member_signup === "self",
    isLoaded,
    branding,
    hasBranding: Boolean(config?.branding),
    chatMediaMaxSizeMb: config?.chat_media?.chat_media_max_size_mb,
    chatMediaRetentionDays: config?.chat_media?.chat_media_retention_days,
    retryConfig,
    saveBranding,
    saveChatMediaSettings,
  };
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
