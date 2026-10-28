"use client";

import { SessionContext } from "next-auth/react";
import { useContext } from "react";
import useSWR from "swr";

export type AgentInfo = {
  mcpManagement?: { admin: boolean; configured: boolean };
  skills: {
    id?: string;
    enabled?: boolean;
    source?: "builtin" | "personal";
    name: string;
    description: string;
    displayName?: string;
    shortDescription?: string;
  }[];
  servers: {
    id: string;
    name: string;
    status: "configured" | "not_configured";
    tools: string[];
    toolAliases?: { alias: string; name: string; serverName: string }[];
    missingEnvironment: string[];
    keyless?: boolean;
    source?: "managed" | "file" | "personal";
  }[];
  modelConfigured: boolean;
  modelProvider?: "openai" | "gateway";
  uploadsConfigured: boolean;
  limits: { maxSteps: number; timeoutMs: number };
};

async function readInfo(url: string): Promise<AgentInfo> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("暂时无法读取能力配置，请稍后重试。");
  }
  return response.json();
}

export function useAgentInfo(enabled = true) {
  const session = useContext(SessionContext);
  const ownerId = session?.data?.user?.id;
  return useSWR<AgentInfo>(
    enabled && ownerId
      ? [`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/agent`, ownerId]
      : null,
    ([url]: [string, string]) => readInfo(url),
    { dedupingInterval: 15_000, shouldRetryOnError: false }
  );
}
