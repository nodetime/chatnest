"use client";

import { toast } from "sonner";

export function notifyCapabilityUnavailable(): void {
  toast.info("产品能力还未开放");
}
