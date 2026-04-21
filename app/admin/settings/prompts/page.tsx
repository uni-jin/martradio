"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/app/_components/AdminShell";
import {
  DEFAULT_PROMO_SCRIPT_TEMPLATE,
  RAW_TEXT_PLACEHOLDER,
  validatePromoScriptTemplate,
} from "@/lib/promoScriptPrompt";

export default function AdminPromoScriptPromptsPage() {
  const [template, setTemplate] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [source, setSource] = useState<"db" | "default" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/promo-script-prompt", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        template?: string;
        updatedAt?: string | null;
        source?: "db" | "default";
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `불러오기 실패 (${res.status})`);
      }
      if (typeof data.template === "string") setTemplate(data.template);
      setUpdatedAt(data.updatedAt ?? null);
      setSource(data.source ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setError(null);
    setSavedMessage(null);
    const validationError = validatePromoScriptTemplate(template);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!window.confirm("저장하시겠습니까?")) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/promo-script-prompt", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        template?: string;
        updatedAt?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `저장 실패 (${res.status})`);
      }
      if (typeof data.template === "string") setTemplate(data.template);
      if (data.updatedAt) setUpdatedAt(data.updatedAt);
      setSource("db");
      setSavedMessage("저장했습니다. 이후 방송문 생성 요청부터 이 프롬프트가 적용됩니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell title="프롬프트 관리">
      <p className="mb-4 text-sm leading-relaxed text-stone-600">
        프로모션 문자 → 방송 대본 생성 시 OpenAI에 보내는 프롬프트 템플릿입니다. 아래 치환자는 반드시 포함해야
        합니다.
      </p>
      <ul className="mb-4 list-inside list-disc text-sm text-stone-600">
        <li>
          <code className="rounded bg-stone-100 px-1 font-mono text-stone-800">{RAW_TEXT_PLACEHOLDER}</code>{" "}
          — 사용자가 붙여넣은 원문 문자가 들어갑니다.
        </li>
      </ul>

      {loading ? (
        <p className="text-sm text-stone-600">불러오는 중…</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            {source === "db" && updatedAt && (
              <span>마지막 저장: {new Date(updatedAt).toLocaleString("ko-KR")}</span>
            )}
            {source === "default" && <span>아직 저장된 설정 없음 · 코드 기본값 표시 중</span>}
          </div>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="min-h-[420px] w-full rounded-lg border border-stone-200 px-3 py-3 font-mono text-sm leading-relaxed text-stone-800"
            spellCheck={false}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[#28579d] px-4 py-2.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => {
                setTemplate(DEFAULT_PROMO_SCRIPT_TEMPLATE);
                setSavedMessage(null);
              }}
              className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              프롬프트 초기화
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {savedMessage && <p className="mt-3 text-sm text-green-700">{savedMessage}</p>}
        </>
      )}
    </AdminShell>
  );
}
