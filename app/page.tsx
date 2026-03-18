"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAllSessions } from "@/lib/store";
import { formatRelativeTime } from "@/lib/utils";
import type { SessionWithItems } from "@/lib/types";

export default function HomePage() {
  const [sessions, setSessions] = useState<SessionWithItems[]>([]);

  useEffect(() => {
    setSessions(getAllSessions());
  }, []);

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-stone-800 sm:text-4xl">
            마트방송
          </h1>
        </header>

        <div className="space-y-8">
          <Link
            href="/broadcast/new"
            className="block rounded-2xl border-2 border-amber-200 bg-white p-6 shadow-sm transition hover:border-amber-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
          >
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-2xl">
                ➕
              </span>
              <div className="min-w-0 flex-1 text-left">
                <h2 className="text-xl font-semibold text-stone-800">
                  새 방송 만들기
                </h2>
              </div>
              <span className="shrink-0 text-stone-400">→</span>
            </div>
          </Link>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-stone-800">
              기존 방송 열기
            </h2>

            {sessions.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-stone-200 bg-stone-50/50 py-10 text-center">
                <p className="text-stone-500">아직 저장된 방송이 없습니다.</p>
                <p className="mt-1 text-sm text-stone-400">
                  새 방송 만들기로 첫 방송을 만들어 보세요.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {sessions.map((session) => {
                  return (
                    <li key={session.id}>
                      <Link
                        href={`/broadcast/${session.id}/edit`}
                        className="block rounded-xl border border-stone-200 px-4 py-3 transition hover:border-amber-300 hover:bg-amber-50/50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="max-w-[80%] truncate font-medium text-stone-800">
                            {session.title}
                          </span>
                          <span className="shrink-0 text-stone-400">→</span>
                        </div>
                        <div className="mt-1 flex flex-col text-xs text-stone-500">
                          <span>
                            <span className="inline-block w-28 font-semibold">생성일시</span>
                            {new Date(session.createdAt).toLocaleString("ko-KR")}
                          </span>
                          {session.lastPlayedAt && (
                            <span>
                              <span className="inline-block w-28 font-semibold">마지막 방송일시</span>
                              {new Date(session.lastPlayedAt).toLocaleString("ko-KR")}
                            </span>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <p className="mt-10 text-center text-xs text-stone-400">
          Copyright ©UNIWIZ. All rights reserved.
        </p>
      </div>
    </main>
  );
}
