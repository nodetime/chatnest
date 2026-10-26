export type Readiness<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
export type ToolsReadiness = {
  managementConfigured: boolean;
  total: number;
  configured: number;
  enabled: number;
  openTools: number;
};
export type StorageReadiness = { enabled: boolean; configured: boolean };
export type ModelReadiness = {
  name: string;
  provider: string;
  configured: boolean;
};
export type AdminOverviewData = {
  tools: Readiness<ToolsReadiness>;
  storage: Readiness<StorageReadiness>;
  model: Readiness<ModelReadiness>;
};
