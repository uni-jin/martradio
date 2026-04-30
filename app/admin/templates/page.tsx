"use client";

import { useEffect, useState } from "react";
import AdminShell from "@/app/_components/AdminShell";
import type { AdminTemplate } from "@/lib/adminData";
import { getCurrentAdmin } from "@/lib/adminAuth";
import { fetchAdminJsonCached, invalidateAdminClientCache } from "@/lib/adminClientCache";

export default function AdminTemplatesPage() {
  const session = getCurrentAdmin();
  const canWrite = session?.role === "super" || (session?.role === "admin" && session.canManageVoiceTemplates === true);
  const [templates, setTemplates] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [paidOnly, setPaidOnly] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchAdminJsonCached<{ templates?: AdminTemplate[] }>(
          "/api/admin/data/templates",
          { force: true }
        );
        if (cancelled) return;
        setTemplates(Array.isArray(data.templates) ? data.templates : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = (next: AdminTemplate[]) => {
    setTemplates(next);
    invalidateAdminClientCache("/api/admin/data/templates");
    void fetch("/api/admin/data/templates", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templates: next }),
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setContent("");
    setPaidOnly(false);
  };

  const openAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (t: AdminTemplate) => {
    setEditingId(t.id);
    setName(t.name);
    setContent(t.content);
    setPaidOnly(Boolean(t.paidOnly));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError(null);
    resetForm();
  };

  const saveTemplate = () => {
    setFormError(null);
    if (!name.trim()) {
      const msg = "템플릿명을 입력해 주세요.";
      setFormError(msg);
      window.alert(msg);
      return;
    }
    if (!content.trim()) {
      const msg = "템플릿 내용을 입력해 주세요.";
      setFormError(msg);
      window.alert(msg);
      return;
    }
    const now = new Date().toISOString();
    if (editingId) {
      persist(
        templates.map((x) =>
          x.id === editingId
            ? {
                ...x,
                name: name.trim(),
                content: content.trim(),
                paidOnly,
                updatedAt: now,
              }
            : x
        )
      );
    } else {
      persist([
        ...templates,
        {
          id: `tpl-${Date.now()}`,
          name: name.trim(),
          content: content.trim(),
          enabled: true,
          paidOnly,
          createdAt: now,
          updatedAt: now,
        },
      ]);
    }
    closeModal();
  };

  return (
    <AdminShell title="">
      {canWrite ? (
        <div className="mb-4 flex justify-start">
          <button
            type="button"
            onClick={openAddModal}
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-900"
          >
            방송 템플릿 추가
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {loading ? <p className="text-sm text-stone-500">불러오는 중…</p> : null}
        {templates.map((t) => (
          <div key={t.id} className="rounded-xl border border-stone-200 p-3">
            <p className="text-sm font-medium text-stone-800">{t.name}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-stone-600">{t.content}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-xs text-stone-700">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={t.enabled !== false}
                    onChange={(e) =>
                      persist(
                        templates.map((x) =>
                          x.id === t.id
                            ? {
                                ...x,
                                enabled: e.target.checked,
                                updatedAt: new Date().toISOString(),
                              }
                            : x
                        )
                      )
                    }
                  />
                  노출
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={t.paidOnly}
                    onChange={(e) =>
                      persist(
                        templates.map((x) =>
                          x.id === t.id
                            ? {
                                ...x,
                                paidOnly: e.target.checked,
                                updatedAt: new Date().toISOString(),
                              }
                            : x
                        )
                      )
                    }
                  />
                  유료 사용자 전용
                </label>
              </div>
              {canWrite ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(t.id)}
                    className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-600"
                  >
                    삭제
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditModal(t)}
                    className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-50"
                  >
                    수정
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-stone-800">
              {editingId ? "방송 템플릿 수정" : "방송 템플릿 추가"}
            </h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveTemplate();
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="템플릿명"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="템플릿 내용"
                className="min-h-[160px] w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={paidOnly}
                  onChange={(e) => setPaidOnly(e.target.checked)}
                />
                유료 사용자 전용
              </label>
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
                >
                  추가
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingDeleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-stone-800">삭제 확인</h2>
            <p className="mt-2 text-sm text-stone-700">이 템플릿을 삭제하시겠습니까?</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  persist(templates.filter((x) => x.id !== pendingDeleteId));
                  setPendingDeleteId(null);
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

