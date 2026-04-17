"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getSession } from "@/lib/store";
import { formatRelativeTime, formatScheduledRange } from "@/lib/utils";
import type { SessionWithItems } from "@/lib/types";

export default function BroadcastDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [session, setSession] = useState<SessionWithItems | null>(null);

  useEffect(() => {
    const sync = () => setSession(getSession(id) ?? null);
    sync();
    window.addEventListener("mart-sessions-updated", sync as EventListener);
    return () => window.removeEventListener("mart-sessions-updated", sync as EventListener);
  }, [id]);

  if (!id) {
    return (
      <main className="min-h-full bg-[var(--bg)] p-8">
        <p className="text-stone-500">잘못된 경로입니다.</p>
        <Link href="/" className="mt-2 inline-block text-amber-600 hover:underline">
          ← 첫 화면
        </Link>
      </main>
    );
  }

  if (session === null) {
    return (
      <main className="min-h-full bg-[var(--bg)] p-8">
        <p className="text-stone-500">방송을 찾을 수 없습니다.</p>
        <Link href="/" className="mt-2 inline-block text-amber-600 hover:underline">
          ← 첫 화면
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-[var(--bg)]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link href="/" className="text-base text-stone-500 hover:text-stone-700">
          ← 첫 화면으로
        </Link>
        <h1 className="mt-4 text-3xl font-bold text-stone-800">{session.title}</h1>
        <div className="mt-2 flex flex-wrap gap-3 text-base text-stone-500">
          {session.lastPlayedAt && (
            <span>마지막 재생 {formatRelativeTime(session.lastPlayedAt)}</span>
          )}
          {session.lastGeneratedAt && (
            <span>생성 {formatRelativeTime(session.lastGeneratedAt)}</span>
          )}
          {formatScheduledRange(session.scheduledAt, session.scheduledEndAt) && (
            <span>예정 {formatScheduledRange(session.scheduledAt, session.scheduledEndAt)}</span>
          )}
        </div>
        <div className="mt-6 flex gap-3">
          <Link
            href={`/broadcast/${session.id}/play`}
            className="inline-block rounded-xl bg-amber-500 px-5 py-2.5 text-base font-medium text-white hover:bg-amber-600"
          >
            재생하기
          </Link>
          <Link
            href={`/broadcast/${session.id}/edit`}
            className="inline-block rounded-xl border border-stone-300 px-5 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-50"
          >
            수정하기
          </Link>
        </div>
      </div>
    </main>
  );
}
