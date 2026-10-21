import { connectionSchema } from "./schema";
import type { ConnectionEdit } from "./types";
export function parseHeaderInput(text: string) {
  return connectionSchema.shape.headers.parse(JSON.parse(text.trim() || "{}"));
}
// Kept in transient component memory only. Never log or persist this value.
export function connectionFingerprint(
  id: string,
  connection: ConnectionEdit,
  revision = 0
) {
  return JSON.stringify([
    id,
    connection,
    connection.mode === "keep" ? revision : null,
  ]);
}

export async function refreshConflictMessage(
  refresh: () => Promise<void>,
  message: string
) {
  try {
    await refresh();
    return message;
  } catch {
    return `${message} 版本刷新失败，请重新读取后再试；当前输入仍保留。`;
  }
}

export function authenticationKind(text: string): "none" | "bearer" | "custom" {
  const headers = parseHeaderInput(text);
  const entries = Object.entries(headers);
  if (!entries.length) {
    return "none";
  }
  return entries.length === 1 &&
    entries[0][0].toLowerCase() === "authorization" &&
    /^Bearer /i.test(entries[0][1])
    ? "bearer"
    : "custom";
}
export function bearerValue(text: string) {
  const entry = Object.entries(parseHeaderInput(text)).find(
    ([name]) => name.toLowerCase() === "authorization"
  );
  return entry?.[1].match(/^Bearer (.*)$/i)?.[1] ?? "";
}
export function withBearer(text: string, token: string) {
  const headers = Object.fromEntries(
    Object.entries(parseHeaderInput(text)).filter(
      ([name]) => name.toLowerCase() !== "authorization"
    )
  );
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return JSON.stringify(headers, null, 2);
}
export function suggestServerId(name: string, suffix: string) {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "connection";
  return `mcp_${slug.slice(0, 19)}_${suffix.slice(0, 6)}`;
}

export function newConnectionIdConflict(
  id: string,
  existingIds: string[],
  editing: boolean
) {
  return !editing && existingIds.includes(id);
}
