"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LEGAL_DOCUMENT_LABEL,
  type LegalDocumentType,
} from "@/lib/legalDocuments";

type LegalDocumentVersionMeta = {
  id: string;
  version: string;
  effectiveDate: string;
  updatedAt: string;
  changeSummary: string | null;
  isCurrent: boolean;
};

type LegalDocumentVersion = LegalDocumentVersionMeta & {
  content: string;
};

export default function LegalDocumentViewer({ type }: { type: LegalDocumentType }) {
  const [versions, setVersions] = useState<LegalDocumentVersionMeta[]>([]);
  const [selected, setSelected] = useState<LegalDocumentVersion | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedLabel = useMemo(
    () => versions.find((v) => v.id === selectedVersionId)?.version ?? "",
    [selectedVersionId, versions]
  );

  const load = async (versionId?: string) => {
    setLoading(true);
    setError(null);
    const sp = new URLSearchParams({ type });
    if (versionId) sp.set("versionId", versionId);
    try {
      const res = await fetch(`/api/public/legal-documents?${sp.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        selectedVersion?: LegalDocumentVersion | null;
        versions?: LegalDocumentVersionMeta[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `불러오기 실패 (${res.status})`);
      }
      const list = Array.isArray(data.versions) ? data.versions : [];
      setVersions(list);
      setSelected(data.selectedVersion ?? null);
      setSelectedVersionId(data.selectedVersion?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [type]);

  return (
    <main className="min-h-full bg-[var(--bg)]">
      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-bold text-stone-800">{LEGAL_DOCUMENT_LABEL[type]}</h1>
        {loading ? (
          <p className="mt-4 text-sm text-stone-600">불러오는 중…</p>
        ) : error ? (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        ) : selected ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
                <span>
                  버전 <span className="font-semibold text-stone-800">{selected.version}</span>
                </span>
                {selected.isCurrent ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                    최신
                  </span>
                ) : null}
                <span>시행일 {selected.effectiveDate}</span>
                <span>수정일 {new Date(selected.updatedAt).toLocaleString("ko-KR")}</span>
              </div>
              <div className="mt-3 max-w-xs">
                <label className="text-sm text-stone-700">
                  지난 버전 보기
                  <select
                    value={selectedVersionId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      void load(nextId);
                    }}
                    className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.version} ({v.effectiveDate})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {selected.changeSummary ? (
                <p className="mt-2 text-xs text-stone-500">변경 요약: {selected.changeSummary}</p>
              ) : null}
            </div>
            <article className="rounded-lg border border-stone-200 bg-white p-5">
              <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed text-stone-800">
                {selected.content}
              </pre>
            </article>
            {selectedLabel ? <p className="text-xs text-stone-400">선택 버전: {selectedLabel}</p> : null}
          </div>
        ) : (
          <p className="mt-4 text-sm text-stone-600">표시할 약관이 없습니다.</p>
        )}
      </div>
    </main>
  );
}
