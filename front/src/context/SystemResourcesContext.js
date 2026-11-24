import { createContext } from "react";

export const SystemResourcesContext = createContext({
  resources: null,
  resourceError: false,
  refreshResources: () => {},
});
