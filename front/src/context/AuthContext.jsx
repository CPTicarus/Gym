import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { fetchMe, loginRequest, updateMe } from "../api/auth.js";
import { clearTokens, getTokens, setTokens } from "../api/tokenStorage.js";
import { decodeJwt } from "../utils/jwt.js";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // full profile from /auth/me/
  const [role, setRole] = useState(null); // quick claim from the JWT, available before /me/ resolves
  const [isLoading, setIsLoading] = useState(true);

  // On first load, if a token is already stored, decode its role for an
  // instant redirect and then hydrate the full profile in the background.
  useEffect(() => {
    async function hydrate() {
      const { access } = getTokens();
      if (!access) {
        setIsLoading(false);
        return;
      }
      const payload = decodeJwt(access);
      if (!payload) {
        clearTokens();
        setIsLoading(false);
        return;
      }
      setRole(payload.role ?? null);
      try {
        const profile = await fetchMe();
        setUser(profile);
      } catch {
        clearTokens();
        setUser(null);
        setRole(null);
      } finally {
        setIsLoading(false);
      }
    }
    hydrate();
  }, []);

  const login = useCallback(async (username, password) => {
    const { access, refresh } = await loginRequest(username, password);
    setTokens({ access, refresh });
    const payload = decodeJwt(access);
    setRole(payload?.role ?? null);
    const profile = await fetchMe();
    setUser(profile);
    return profile;
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
    setRole(null);
  }, []);

  // Used by the settings page — PATCHes /auth/me/ and syncs the result
  // back into context so the topbar/drawer reflect the change immediately.
  const updateProfile = useCallback(async (payload) => {
    const profile = await updateMe(payload);
    setUser(profile);
    return profile;
  }, []);

  // Re-pulls /auth/me/ without changing anything — used after an action on
  // a *different* endpoint (e.g. logging a weight entry) changes something
  // derived on the user object (latest_weight_kg, bmi) that a plain PATCH
  // wouldn't touch.
  const refreshProfile = useCallback(async () => {
    const profile = await fetchMe();
    setUser(profile);
    return profile;
  }, []);

  const value = useMemo(
    () => ({
      user,
      role: user?.role ?? role,
      isAuthenticated: Boolean(user || role),
      isLoading,
      login,
      logout,
      updateProfile,
      refreshProfile,
    }),
    [user, role, isLoading, login, logout, updateProfile, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
