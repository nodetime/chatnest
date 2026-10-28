"use client";
import { useSession } from "next-auth/react";
import useSWR, { useSWRConfig } from "swr";
import type {
  SkillAction,
  SkillProjection,
} from "@/server/domain/capability/schema";
import type { SettingsProjection } from "@/server/domain/mcp/types";

export const personalMcpEndpoint = "/api/personal/mcp";
export const personalSkillsEndpoint = "/api/personal/skills";
export async function readPersonal<T>(url: string): Promise<T> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${url}`,
    { cache: "no-store" }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "读取失败，请重试。"
    );
  }
  return data;
}
export async function requestSkill<T>(
  action: SkillAction,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${personalSkillsEndpoint}`,
    {
      body: JSON.stringify(action),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
    }
  );
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error ?? "技能操作失败，请重试。");
    Object.assign(error, { status: response.status });
    throw error;
  }
  return data;
}
export type PersonalSkills = {
  configured: boolean;
  revision: number;
  skills: SkillProjection[];
};
export function usePersonalCapabilities() {
  const { data: session } = useSession();
  const ownerId = session?.user?.id;
  const regular = session?.user?.type === "regular";
  const mcp = useSWR<SettingsProjection>(
    regular ? [personalMcpEndpoint, ownerId] : null,
    ([url]: [string, string]) => readPersonal<SettingsProjection>(url),
    { shouldRetryOnError: false }
  );
  const skills = useSWR<PersonalSkills>(
    regular ? [personalSkillsEndpoint, ownerId] : null,
    ([url]: [string, string]) => readPersonal<PersonalSkills>(url),
    { shouldRetryOnError: false }
  );
  const { mutate } = useSWRConfig();
  const refresh = async () => {
    await Promise.all([
      mcp.mutate(),
      skills.mutate(),
      mutate([`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/agent`, ownerId]),
    ]);
  };
  return { mcp, refresh, regular, skills };
}
