import { lookup } from "node:dns/promises";
import { request } from "node:https";
import sharp from "sharp";
import {
  isPublicAddress,
  publicBrowserUrl,
} from "@/server/shared/browser-policy";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export function imageDNSAddresses(hostname: string, raw?: string) {
  if (!raw) {
    return null;
  }
  const overrides: unknown = JSON.parse(raw);
  if (
    raw.length > 8192 ||
    !overrides ||
    typeof overrides !== "object" ||
    Array.isArray(overrides) ||
    Object.keys(overrides).length > 16
  ) {
    throw new Error("Invalid image DNS overrides.");
  }
  for (const [host, addresses] of Object.entries(overrides)) {
    if (
      !/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(host) ||
      !Array.isArray(addresses) ||
      addresses.length < 1 ||
      addresses.length > 8 ||
      addresses.some(
        (address) => typeof address !== "string" || !isPublicAddress(address)
      )
    ) {
      throw new Error("Invalid image DNS overrides.");
    }
  }
  return Object.hasOwn(overrides, hostname)
    ? (overrides as Record<string, string[]>)[hostname].map((address) => ({
        address,
      }))
    : null;
}

export function validateImageDestination(input: string, addresses: string[]) {
  const url = new URL(publicBrowserUrl(input));
  if (
    url.protocol !== "https:" ||
    !addresses.length ||
    addresses.some((address) => !isPublicAddress(address))
  ) {
    throw new Error("Only public HTTPS images are supported.");
  }
  return url;
}

export async function fetchPublicImage(input: string, signal: AbortSignal) {
  const url = new URL(publicBrowserUrl(input));
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses =
    imageDNSAddresses(hostname, process.env.IMAGE_DNS_OVERRIDES) ??
    (await lookup(hostname, { all: true }));
  validateImageDestination(
    input,
    addresses.map(({ address }) => address)
  );
  signal.throwIfAborted();
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    // Connect to the validated address, preserving TLS SNI/Host. No redirects,
    // cookies, authorization, proxy env or subsequent hostname resolution.
    const req = request(
      {
        headers: { accept: "image/*", host: url.host },
        hostname: addresses[0].address,
        method: "GET",
        path: url.pathname + url.search,
        port: 443,
        servername: hostname,
        signal,
      },
      (res) => {
        if (
          res.statusCode !== 200 ||
          !res.headers["content-type"]?.startsWith("image/") ||
          Number(res.headers["content-length"] ?? 0) > MAX_IMAGE_BYTES
        ) {
          res.destroy();
          reject(new Error("Image response rejected."));
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_IMAGE_BYTES) {
            res.destroy(new Error("Image exceeds size limit."));
            return;
          }
          chunks.push(chunk);
        });
        res.once("end", () => resolve(Buffer.concat(chunks)));
        res.once("error", reject);
      }
    );
    req.once("error", reject);
    req.end();
  });
  signal.throwIfAborted();
  const { data, info } = await sharp(buffer, {
    animated: false,
    limitInputPixels: 20_000_000,
  })
    .rotate()
    .resize({
      fit: "inside",
      height: 1024,
      width: 1024,
      withoutEnlargement: true,
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  signal.throwIfAborted();
  if (data.length > 512_000) {
    throw new Error("Normalized image exceeds size limit.");
  }
  return {
    data: data.toString("base64"),
    height: info.height,
    mediaType: "image/jpeg" as const,
    width: info.width,
  };
}
