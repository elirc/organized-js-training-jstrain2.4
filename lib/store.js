import { create } from "zustand";

export const usePlatformStore = create((set) => ({
  selectedAppId: null,
  selectedEnvironmentId: null,
  selectedDeploymentId: null,
  logFilters: {
    severity: "",
    keyword: "",
  },
  setSelectedAppId: (selectedAppId) =>
    set(() => ({
      selectedAppId,
      selectedEnvironmentId: null,
      selectedDeploymentId: null,
    })),
  setSelectedEnvironmentId: (selectedEnvironmentId) =>
    set(() => ({
      selectedEnvironmentId,
      selectedDeploymentId: null,
    })),
  setSelectedDeploymentId: (selectedDeploymentId) => set(() => ({ selectedDeploymentId })),
  setLogFilters: (logFilters) => set(() => ({ logFilters })),
}));
