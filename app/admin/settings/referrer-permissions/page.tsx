"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "@/app/_components/AdminShell";
import { ADMIN_MENU_GROUPS } from "@/lib/adminMenuCatalog";
import { getCurrentAdmin } from "@/lib/adminAuth";
import { fetchAdminJsonCached, invalidateAdminClientCache } from "@/lib/adminClientCache";

type MenuGroupsPayload = typeof ADMIN_MENU_GROUPS;

export default function ReferrerAdminPermissionsPage() {
  const session = getCurrentAdmin();
  const isSuper = session?.role === "admin";

  const [menuGroups, setMenuGroups] = useState<MenuGroupsPayload>(ADMIN_MENU_GROUPS);
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminJsonCached<{
        menuGroups?: MenuGroupsPayload;
        allowedHrefs?: string[];
      }>("/api/admin/settings/referrer-admin-permissions", { force: true });
      if (Array.isArray(data.menuGroups) && data.menuGroups.length > 0) {
        setMenuGroups(data.menuGroups as MenuGroupsPayload);
      }
      setAllowed(new Set(Array.isArray(data.allowedHrefs) ? data.allowedHrefs : []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flatLeaves = useMemo(() => {
    const rows: { groupTitle: string; href: string; label: string }[] = [];
    for (const g of menuGroups) {
      for (const it of g.items) {
        rows.push({ groupTitle: g.groupTitle, href: it.href, label: it.label });
      }
    }
    return rows;
  }, [menuGroups]);

  const toggle = (href: string) => {
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  };

  const onSave = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/referrer-admin-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ allowedHrefs: [...allowed] }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; allowedHrefs?: string[] };
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "저장에 실패했습니다.");
        return;
      }
      invalidateAdminClientCache("/api/admin/settings/referrer-admin-permissions");
      if (Array.isArray(data.allowedHrefs)) {
        setAllowed(new Set(data.allowedHrefs));
      }
      setMessage("저장되었습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (!isSuper) {
    return (
      <AdminShell title="관리자 권한 관리">
        <p className="text-sm text-stone-600">최고 관리자만 접근할 수 있습니다.</p>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="관리자 권한 관리">
      <p className="mb-4 text-sm text-stone-600">
        추천인 관리자에게 허용할 메뉴를 선택합니다. 비밀번호 변경 화면은 항상 허용됩니다.
      </p>
      {loading ? (
        <p className="text-sm text-stone-500">불러오는 중…</p>
      ) : (
        <div className="space-y-6">
          {menuGroups.map((g) => (
            <div key={g.groupTitle} className="rounded-xl border border-stone-200 p-4">
              <h2 className="mb-3 text-sm font-semibold text-stone-800">{g.groupTitle}</h2>
              <ul className="space-y-2 pl-1">
                {g.items.map((it) => (
                  <li key={it.href} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      id={`perm-${it.href}`}
                      checked={allowed.has(it.href)}
                      onChange={() => toggle(it.href)}
                      className="mt-0.5"
                    />
                    <label htmlFor={`perm-${it.href}`} className="cursor-pointer text-stone-700">
                      {it.label}{" "}
                      <span className="text-xs text-stone-400">({it.href})</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={saving}
              className="rounded-lg bg-stone-800 px-5 py-2 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
            <button
              type="button"
              onClick={() => setAllowed(new Set(flatLeaves.map((x) => x.href)))}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              전체 선택
            </button>
            <button
              type="button"
              onClick={() => setAllowed(new Set())}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              전체 해제
            </button>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
