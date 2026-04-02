"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCurrentUser, getVisibleSessionCountForUser } from "@/lib/auth";
import { getAllSessions } from "@/lib/store";
import { formatRelativeTime } from "@/lib/utils";
import type { SessionWithItems } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionWithItems[]>([]);
  const [showFreePlanNotice, setShowFreePlanNotice] = useState(false);
  const [isFreePlanUser, setIsFreePlanUser] = useState(false);
  const [sessionVisibleLimit, setSessionVisibleLimit] = useState<number | null>(1);

  useEffect(() => {
    const sync = () => {
      setSessions(getAllSessions());
      const user = getCurrentUser();
      const isFree = Boolean(user && (user.planId ?? "free") === "free");
      setIsFreePlanUser(isFree);
      setSessionVisibleLimit(getVisibleSessionCountForUser(user));
    };
    sync();
    window.addEventListener("mart-plan-updated", sync as EventListener);
    return () => window.removeEventListener("mart-plan-updated", sync as EventListener);
  }, []);

  const visibleSessions =
    sessionVisibleLimit == null ? sessions : sessions.slice(0, sessionVisibleLimit);

  const handleCreateBroadcastClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isFreePlanUser) return;
    e.preventDefault();
    setShowFreePlanNotice(true);
  };

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
            onClick={handleCreateBroadcastClick}
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

            {visibleSessions.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-stone-200 bg-stone-50/50 py-10 text-center">
                <p className="text-stone-500">아직 저장된 방송이 없습니다.</p>
                <p className="mt-1 text-sm text-stone-400">
                  새 방송 만들기로 첫 방송을 만들어 보세요.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {visibleSessions.map((session) => {
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

        {showFreePlanNotice ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h3 className="text-base font-semibold text-stone-800">안내</h3>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-stone-600">
                무료 플랜인 경우에는 방송 내용 입력 시 글자수 제한이 있습니다.
                {"\n"}
                더 많은 내용으로 방송을 원하시면 유료 플랜을 구독해 보세요.
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600"
                  onClick={() => {
                    setShowFreePlanNotice(false);
                    router.push("/broadcast/new");
                  }}
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <p className="mt-10 text-center text-xs text-stone-400">
          Copyright ©UNIWIZ. All rights reserved.
        </p>
      </div>
    </main>
  );
}
