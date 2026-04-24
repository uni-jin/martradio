"use client";

import { useEffect, useState } from "react";
import type { VoiceTemplate } from "@/lib/voiceTemplateTypes";

const cache = new Map<string, VoiceTemplate[]>();

export function clearVoiceTemplatesClientCache(): void {
  cache.clear();
}

export async function fetchVoiceTemplatesForPlan(planId: string | undefined): Promise<VoiceTemplate[]> {
  const key = planId ?? "free";
  const includePaidPreview = key === "free";
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const q = new URLSearchParams({ planId: key });
    if (includePaidPreview) q.set("includePaidPreview", "1");
    const res = await fetch(`/api/public/voice-templates?${q.toString()}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { voices?: VoiceTemplate[] };
    const list = Array.isArray(data.voices) ? data.voices : [];
    cache.set(key, list);
    return list;
  } catch {
    cache.set(key, []);
    return [];
  }
}

export function getVoiceTemplatesUserFacingSync(planId: string | undefined): VoiceTemplate[] {
  return cache.get(planId ?? "free") ?? [];
}

export function findVoiceTemplateByIdInList(id: string, list: VoiceTemplate[]): VoiceTemplate | undefined {
  return list.find((v) => v.id === id);
}

export function useVoiceTemplatesForPlan(planId: string | undefined, refreshToken?: number): VoiceTemplate[] {
  const [list, setList] = useState<VoiceTemplate[]>(() => getVoiceTemplatesUserFacingSync(planId));
  useEffect(() => {
    let cancelled = false;
    void fetchVoiceTemplatesForPlan(planId).then((v) => {
      if (!cancelled) setList(v);
    });
    return () => {
      cancelled = true;
    };
  }, [planId, refreshToken]);
  return list;
}
