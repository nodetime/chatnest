import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export function parseEncryptionKey(value: string | undefined) {
  if (!value || !/[A-Za-z0-9+/]{43}=$/.test(value) || value.length !== 44) {
    throw new Error("MCP encryption key is not configured correctly");
  }
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("MCP encryption key is not configured correctly");
  }
  return key;
}
const aad = (revision: number) =>
  Buffer.from(`chatnest:mcp-settings:workspace:1:revision:${revision}`);
export function encryptSettings(value: unknown, revision: number, key: Buffer) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad(revision));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    data: data.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    v: 1,
  });
}
export function decryptSettings(
  encrypted: string,
  revision: number,
  key: Buffer
): unknown {
  try {
    const envelope = JSON.parse(encrypted);
    if (envelope.v !== 1) {
      throw new Error("Invalid encrypted settings envelope");
    }
    const nonce = Buffer.from(envelope.nonce, "base64"),
      tag = Buffer.from(envelope.tag, "base64");
    if (nonce.length !== 12 || tag.length !== 16) {
      throw new Error("Invalid encrypted settings envelope");
    }
    const cipher = createDecipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(aad(revision));
    cipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(envelope.data, "base64")),
        cipher.final(),
      ]).toString("utf8")
    );
  } catch {
    // biome-ignore lint/style/useErrorCause: Raw SDK/crypto causes may contain credentials; intentionally discard.
    throw new Error("MCP settings could not be decrypted");
  }
}
