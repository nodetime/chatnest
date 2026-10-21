// Client-safe DTOs. Never import repositories or environment access into client components.
export type Connection = { url: string; headers: Record<string, string> };
export type ManagedServer = Connection & {
  id: string;
  name: string;
  enabled: boolean;
  allowedTools: string[];
};
export type ToolMetadata = { name: string; description: string };
export type ServerProjection = {
  id: string;
  name: string;
  enabled: boolean;
  allowedTools: string[];
  origin: string;
  headerNames: string[];
  source: "managed" | "file";
};
export type SettingsProjection = {
  revision: number;
  configured: boolean;
  servers: ServerProjection[];
};
export type ConnectionEdit =
  | { mode: "keep" }
  | { mode: "replace"; value: Connection };
export type SettingsAction =
  | { action: "test"; id?: string; connection: ConnectionEdit }
  | {
      action: "save";
      revision: number;
      server: {
        id: string;
        name: string;
        enabled: boolean;
        allowedTools: string[];
        connection: ConnectionEdit;
      };
    }
  | { action: "toggle"; revision: number; id: string; enabled: boolean }
  | { action: "delete"; revision: number; id: string };
