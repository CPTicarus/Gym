import { createContext, useEffect, useMemo, useState } from "react";

import { fetchPublicConfig } from "../api/config.js";

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
  const [memberSignup, setMemberSignup] = useState("staff");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPublicConfig()
      .then((config) => {
        if (!cancelled) setMemberSignup(config.member_signup);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({ isSelfSignup: memberSignup === "self", isLoaded }),
    [memberSignup, isLoaded]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
