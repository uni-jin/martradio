"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAllSessions } from "@/lib/store";
import { formatRelativeTime, formatScheduledRange } from "@/lib/utils";
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
          <p className="mt-2 text-stone-500 sm:text-lg">
            행사 상품 표로 입력 → 멘트 생성 → MP3 저장 후 재생
          </p>
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
                <p className="mt-0.5 text-sm text-stone-500">
                  행사 유형 선택 후 상품 표 입력 · 멘트 생성 · MP3 저장
                </p>
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
                  const scheduled = formatScheduledRange(session.scheduledAt, session.scheduledEndAt);
                  return (
                    <li key={session.id}>
                      <Link
                        href={`/broadcast/${session.id}`}
                        className="block rounded-xl border border-stone-200 px-4 py-3 transition hover:border-amber-300 hover:bg-amber-50/50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="max-w-[80%] truncate font-medium text-stone-800">
                            {session.title}
                          </span>
                          <span className="shrink-0 text-stone-400">→</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                          {session.lastPlayedAt && (
                            <span>
                              <span className="font-semibold">마지막 재생</span>{" "}
                              {formatRelativeTime(session.lastPlayedAt)}
                            </span>
                          )}
                          {session.lastGeneratedAt && (
                            <>
                              {session.lastPlayedAt && (
                                <span className="text-stone-300">|</span>
                              )}
                              <span>
                                <span className="font-semibold">생성</span>{" "}
                                {formatRelativeTime(session.lastGeneratedAt)}
                              </span>
                            </>
                          )}
                          {scheduled && (
                            <>
                              {(session.lastPlayedAt || session.lastGeneratedAt) && (
                                <span className="text-stone-300">|</span>
                              )}
                              <span>
                                <span className="font-semibold">예정</span>{" "}
                                {scheduled}
                              </span>
                            </>
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
