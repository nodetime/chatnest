"use client";

import { format } from "date-fns";
import { useSyncExternalStore } from "react";

export function formatMessageTime(createdAt?: string): string | null {
  if (!createdAt) {
    return null;
  }
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? null : format(date, "yyyy-MM-dd HH:mm");
}

const subscribe = () => () => undefined;
const serverSnapshot = () => null;

export function MessageTime({ createdAt }: { createdAt?: string }) {
  // 浏览器决定本地时区；服务端不输出可能与浏览器不同的时间文本。
  const label = useSyncExternalStore(
    subscribe,
    () => formatMessageTime(createdAt),
    serverSnapshot
  );
  if (!createdAt || formatMessageTime(createdAt) === null) {
    return null;
  }
  return (
    <time
      className="mr-2 shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
      dateTime={createdAt}
    >
      {label}
    </time>
  );
}
