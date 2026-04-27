"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "@/app/_components/AdminShell";
import {
  LEGAL_DOCUMENT_LABEL,
  type LegalDocumentType,
  type LegalDocumentVersion,
} from "@/lib/legalDocuments";

type ApiVersion = LegalDocumentVersion;

function todayYmd(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminLegalSettingsPage() {
  const [docType, setDocType] = useState<LegalDocumentType>("privacy_policy");
  const [versions, setVersions] = useState<ApiVersion[]>([]);
  const [historyVersionId, setHistoryVersionId] = useState("");
  const [version, setVersion] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(todayYmd());
  const [content, setContent] = useState("");
  const [changeSummary, setChangeSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentVersion = useMemo(
    () => versions.find((v) => v.isCurrent) ?? versions[0] ?? null,
    [versions]
  );

  const load = async (type: LegalDocumentType) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/settings/legal-documents?type=${encodeURIComponent(type)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        versions?: ApiVersion[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `불러오기 실패 (${res.status})`);
      }
      const list = Array.isArray(data.versions) ? data.versions : [];
      setVersions(list);
      const latest = list.find((v) => v.isCurrent) ?? list[0] ?? null;
      setHistoryVersionId(latest?.id ?? "");
      setContent(latest?.content ?? "");
      setVersion(latest?.version ?? "");
      setEffectiveDate(latest?.effectiveDate ?? todayYmd());
      setChangeSummary("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(docType);
  }, [docType]);

  const handleSave = async () => {
    setError(null);
    setNotice(null);
    if (!version.trim() || !effectiveDate.trim() || !content.trim()) {
      setError("버전, 시행일, 본문은 필수입니다.");
      return;
    }
    if (!window.confirm("새 약관 버전으로 저장하고 최신본으로 공개하시겠습니까?")) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/legal-documents", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: docType,
          version: version.trim(),
          effectiveDate: effectiveDate.trim(),
          content,
          changeSummary,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `저장 실패 (${res.status})`);
      }
      setNotice("저장되었습니다. 사용자 화면에 최신 버전으로 즉시 노출됩니다.");
      await load(docType);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const historySelected = useMemo(
    () => versions.find((v) => v.id === historyVersionId) ?? versions[0] ?? null,
    [historyVersionId, versions]
  );

  return (
    <AdminShell title="약관 관리">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["privacy_policy", "terms_of_service"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setDocType(t)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                docType === t
                  ? "border-[#28579d] bg-[#28579d] text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              {LEGAL_DOCUMENT_LABEL[t]}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-stone-600">불러오는 중…</p>
        ) : (
          <>
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
              현재 공개 버전:{" "}
              <span className="font-semibold">{currentVersion?.version ?? "-"}</span>
              {currentVersion?.updatedAt ? (
                <span className="ml-2 text-stone-500">
                  (수정일 {new Date(currentVersion.updatedAt).toLocaleString("ko-KR")})
                </span>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-stone-700">
                버전
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="예: 1.0.1"
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
                />
              </label>
              <label className="text-sm text-stone-700">
                시행일
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
                />
              </label>
            </div>

            <label className="block text-sm text-stone-700">
              변경 요약 (선택)
              <input
                value={changeSummary}
                onChange={(e) => setChangeSummary(e.target.value)}
                placeholder="예: 개인정보 보관기간 문구 정비"
                className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-800"
              />
            </label>

            <label className="block text-sm text-stone-700">
              본문 (Markdown)
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="mt-1 min-h-[420px] w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm text-stone-800"
                spellCheck={false}
              />
            </label>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[#28579d] px-4 py-2.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "새 버전 저장 및 공개"}
            </button>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {notice ? <p className="text-sm text-green-700">{notice}</p> : null}

            <section className="rounded-xl border border-stone-200">
              <div className="border-b border-stone-200 px-4 py-3 text-sm font-semibold text-stone-700">
                버전 이력
              </div>
              <ul className="divide-y divide-stone-100">
                {versions.map((v) => (
                  <li key={v.id} className="px-4 py-3 text-sm text-stone-700">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold">{v.version}</span>
                        {v.isCurrent ? (
                          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
                            최신
                          </span>
                        ) : null}
                        <span className="ml-3 text-stone-500">
                          시행일 {v.effectiveDate} · 수정일 {new Date(v.updatedAt).toLocaleString("ko-KR")}
                        </span>
                        {v.changeSummary ? (
                          <p className="mt-1 text-xs text-stone-500">{v.changeSummary}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryVersionId(v.id);
                          document
                            .getElementById("admin-legal-version-detail")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="shrink-0 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-800 hover:bg-stone-50"
                      >
                        보기
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section
              id="admin-legal-version-detail"
              className="rounded-xl border border-stone-200 bg-white p-4"
            >
              <h2 className="text-sm font-semibold text-stone-700">버전 상세 보기</h2>
              <div className="mt-2 max-w-sm">
                <label className="text-sm text-stone-700">
                  조회할 버전
                  <select
                    value={historyVersionId}
                    onChange={(e) => setHistoryVersionId(e.target.value)}
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
              {historySelected ? (
                <>
                  <div className="mt-3 text-xs text-stone-500">
                    버전 {historySelected.version} · 시행일 {historySelected.effectiveDate} · 수정일{" "}
                    {new Date(historySelected.updatedAt).toLocaleString("ko-KR")}
                  </div>
                  {historySelected.changeSummary ? (
                    <p className="mt-1 text-xs text-stone-500">
                      변경 요약: {historySelected.changeSummary}
                    </p>
                  ) : null}
                  <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50 p-3 text-xs leading-relaxed text-stone-800">
                    {historySelected.content}
                  </pre>
                </>
              ) : (
                <p className="mt-3 text-sm text-stone-500">조회할 버전이 없습니다.</p>
              )}
            </section>
          </>
        )}
      </div>
    </AdminShell>
  );
}
