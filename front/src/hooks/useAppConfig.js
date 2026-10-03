import { useContext } from "react";

import { ConfigContext } from "../context/ConfigContext.jsx";

export function useAppConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error("useAppConfig must be used within a ConfigProvider");
  }
  return ctx;
}
