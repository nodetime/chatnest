import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const basePath = process.env.IS_DEMO === "1" ? "/demo" : "";

const nextConfig: NextConfig = {
  ...(basePath
    ? {
        assetPrefix: "/demo-assets",
        basePath,
        redirects: async () => [
          {
            basePath: false,
            destination: basePath,
            permanent: false,
            source: "/",
          },
        ],
      }
    : {}),
  cacheComponents: true,
  devIndicators: false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  experimental: {
    appNewScrollHandler: true,
    cachedNavigations: true,
    inlineCss: true,
    prefetchInlining: true,
    // Next proxy clones bodies before route admission. Keep the envelope bounded, not truncated at its 10mb default.
    proxyClientMaxBodySize: "65mb",
    turbopackFileSystemCacheForDev: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: "avatar.vercel.sh",
      },
      {
        hostname: "*.public.blob.vercel-storage.com",
        protocol: "https",
      },
    ],
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
    incomingRequests: false,
  },
  outputFileTracingIncludes: {
    "/api/agent": ["./server/config/agent.json", "./server/skills/**/*"],
    "/api/agent/mcp": ["./server/config/agent.json"],
    "/api/chat": ["./server/config/agent.json", "./server/skills/**/*"],
    "/api/files/upload": [
      "./server/uploads/document-worker.cjs",
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/mammoth/**/*",
      "./node_modules/exceljs/**/*",
      "./node_modules/yauzl/**/*",
      "./node_modules/saxes/**/*",
      "./node_modules/papaparse/**/*",
    ],
  },
  poweredByHeader: false,
  reactCompiler: true,
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "rotating-file-stream",
    "mammoth",
    "exceljs",
    "yauzl",
    "saxes",
    "papaparse",
    "@playwright/mcp",
    "playwright",
    "playwright-core",
    "@modelcontextprotocol/sdk",
  ],
};

export default withBotId(async (phase) => {
  if (phase !== PHASE_PRODUCTION_BUILD) {
    return nextConfig;
  }
  // Tracing includes are not entry points: trace the external worker's entire require
  // graph explicitly. This runs only at build time, never per upload or on next start.
  const { nodeFileTrace } = await import("@vercel/nft");
  const root = process.cwd();
  const nodeRequire = createRequire(join(root, "package.json"));
  const pdfManifest = nodeRequire.resolve("pdfjs-dist/package.json");
  const pdfRequire = createRequire(pdfManifest);
  const { fileList } = await nodeFileTrace(
    [
      "server/uploads/document-worker.cjs",
      pdfRequire.resolve("@napi-rs/canvas"),
    ],
    { base: root, fileIOConcurrency: 64, processCwd: root }
  );
  const files = [...fileList].map((path) => `./${path}`);
  // PDF.js uses a computed fake-worker import and newer syntax beyond NFT's parser.
  // Preserve its official worker/maps/fonts/assets independently of static analysis.
  const pdfAssets = `./${relative(root, dirname(pdfManifest)).replaceAll("\\", "/")}/**/*`;
  return {
    ...nextConfig,
    outputFileTracingIncludes: {
      ...nextConfig.outputFileTracingIncludes,
      "/api/files/upload": [
        ...(nextConfig.outputFileTracingIncludes?.["/api/files/upload"] ?? []),
        ...files,
        pdfAssets,
      ],
    },
  };
});
