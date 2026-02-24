"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSession, saveSession } from "@/lib/store";
import { buildScript } from "@/lib/templates";
import { generateId } from "@/lib/utils";
import type { EventType, Session, BroadcastItem } from "@/lib/types";

const EVENT_LABELS: Record<EventType, string> = {
  TIME_SALE: "타임세일",
  CLEARANCE: "마감재고",
  TODAY_DISCOUNT: "오늘 할인",
  FREE: "자유입력",
};

const DEFAULT_REPEAT_MINUTES = 5;

function parsePaste(text: string): { name: string; unit: string; price: number; originalPrice?: number | null; isSelected: boolean }[] {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((r) => r.split(/\t|,/).map((c) => c.trim()));
  const result: { name: string; unit: string; price: number; originalPrice?: number | null; isSelected: boolean }[] = [];
  for (const row of rows) {
    if (row.length < 3) continue;
    let name: string, unit: string, price: number, originalPrice: number | null = null, isSelected = true;
    if (row.length >= 5) {
      const [sel, n, u, orig, sale] = row;
      isSelected = /^(1|예|o|y|v|✓|체크)$/i.test(sel ?? "") || !sel;
      name = n ?? "";
      unit = u ?? "";
      originalPrice = parseInt(String(orig).replace(/[^0-9]/g, ""), 10) || null;
      if (originalPrice === 0) originalPrice = null;
      price = parseInt(String(sale).replace(/[^0-9]/g, ""), 10) || 0;
    } else if (row.length === 4) {
      const [n, u, orig, sale] = row;
      name = n ?? "";
      unit = u ?? "";
      originalPrice = parseInt(String(orig).replace(/[^0-9]/g, ""), 10) || null;
      if (originalPrice === 0) originalPrice = null;
      price = parseInt(String(sale).replace(/[^0-9]/g, ""), 10) || 0;
    } else if (row.length >= 4) {
      const [sel, n, u, p] = row;
      isSelected = /^(1|예|o|y|v|✓|체크)$/i.test(sel ?? "") || !sel;
      name = n ?? "";
      unit = u ?? "";
      price = parseInt(String(p).replace(/[^0-9]/g, ""), 10) || 0;
    } else {
      name = row[0] ?? "";
      unit = row[1] ?? "";
      price = parseInt(String(row[2]).replace(/[^0-9]/g, ""), 10) || 0;
    }
    if (name) result.push({ name, unit, price, originalPrice: originalPrice ?? undefined, isSelected });
  }
  return result;
}

export default function EditBroadcastPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [loaded, setLoaded] = useState(false);
  const [eventType, setEventType] = useState<EventType>("TIME_SALE");
  const [customOpening, setCustomOpening] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduledEndAt, setScheduledEndAt] = useState("");
  const [repeatMinutes, setRepeatMinutes] = useState(DEFAULT_REPEAT_MINUTES);
  const [itemSuffixIsnida, setItemSuffixIsnida] = useState(true);
  const [items, setItems] = useState<
    { id: string; name: string; unit: string; price: number; originalPrice?: number | null; isSelected: boolean; sortOrder: number }[]
  >([]);
  const [eventItems, setEventItems] = useState<
    { id: string; name: string; unit: string; price: number; originalPrice?: number | null; isSelected: boolean; sortOrder: number }[]
  >([]);
  const [scriptText, setScriptText] = useState("");
  const [scriptTouched, setScriptTouched] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initialCreatedAt, setInitialCreatedAt] = useState<string>("");

  const toScriptItem = (i: { name: string; unit: string; price: number; originalPrice?: number | null; isSelected: boolean }) =>
    ({ name: i.name, unit: i.unit, price: i.price, originalPrice: i.originalPrice, isSelected: i.isSelected });
  const generated = buildScript(
    eventType,
    customOpening,
    items.map(toScriptItem),
    eventItems.map(toScriptItem),
    itemSuffixIsnida
  );
  const displayScript = scriptTouched ? scriptText : generated;

  useEffect(() => {
    if (!id) return;
    const s = getSession(id);
    if (s) {
      setEventType(s.eventType);
      setCustomOpening(s.customOpening ?? "");
      setTitle(s.title);
      setScheduledAt(s.scheduledAt ? s.scheduledAt.slice(0, 16) : "");
      setScheduledEndAt(s.scheduledEndAt ? s.scheduledEndAt.slice(0, 16) : "");
      setRepeatMinutes(s.repeatMinutes);
      setItemSuffixIsnida(s.itemSuffixIsnida);
      setItems(
        s.items.map((it, i) => ({
          id: it.id,
          name: it.name,
          unit: it.unit,
          price: it.price,
          originalPrice: it.originalPrice ?? undefined,
          isSelected: it.isSelected,
          sortOrder: i,
        }))
      );
      setEventItems(
        (s.eventItems ?? []).map((it, i) => ({
          id: it.id,
          name: it.name,
          unit: it.unit,
          price: it.price,
          originalPrice: it.originalPrice ?? undefined,
          isSelected: it.isSelected,
          sortOrder: i,
        }))
      );
      setScriptText(s.generatedText ?? "");
      setScriptTouched(!!s.generatedText);
      setInitialCreatedAt(s.createdAt);
    }
    setLoaded(true);
  }, [id]);

  const updateScriptFromItems = useCallback(() => {
    if (!scriptTouched) {
      setScriptText(
        buildScript(
          eventType,
          customOpening,
          items.map(toScriptItem),
          eventItems.map(toScriptItem),
          itemSuffixIsnida
        )
      );
    }
  }, [eventType, customOpening, items, eventItems, itemSuffixIsnida, scriptTouched]);

  const handlePaste = (target: "super" | "event") => (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    const parsed = parsePaste(text);
    if (parsed.length > 0) {
      e.preventDefault();
      const list = target === "super" ? items : eventItems;
      const next = parsed.map((p, i) => ({
        id: generateId(),
        name: p.name,
        unit: p.unit,
        price: p.price,
        originalPrice: p.originalPrice,
        isSelected: p.isSelected,
        sortOrder: list.length + i,
      }));
      if (target === "super") setItems((prev) => [...prev, ...next]);
      else setEventItems((prev) => [...prev, ...next]);
      setScriptTouched(false);
    }
  };

  const addRow = (target: "super" | "event") => () => {
    const updater = target === "super"
      ? (prev: typeof items) => [...prev, { id: generateId(), name: "", unit: "", price: 0, originalPrice: null, isSelected: true, sortOrder: prev.length }]
      : (prev: typeof eventItems) => [...prev, { id: generateId(), name: "", unit: "", price: 0, originalPrice: null, isSelected: true, sortOrder: prev.length }];
    if (target === "super") setItems(updater);
    else setEventItems(updater);
  };

  const updateItem = (target: "super" | "event") => (id: string, field: string, value: string | number | boolean | null) => {
    const updater = (prev: typeof items) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it));
    if (target === "super") setItems(updater);
    else setEventItems(updater);
    setScriptTouched(false);
  };

  const removeItem = (target: "super" | "event") => (itemId: string) => {
    if (target === "super") setItems((prev) => prev.filter((it) => it.id !== itemId));
    else setEventItems((prev) => prev.filter((it) => it.id !== itemId));
    setScriptTouched(false);
  };

  const generateScriptClick = () => {
    setScriptText(generated);
    setScriptTouched(false);
  };

  const handleSave = () => {
    const now = new Date().toISOString();
    const session: Session = {
      id,
      title: title || "제목 없음",
      eventType,
      customOpening: eventType === "FREE" ? customOpening : undefined,
      scheduledAt: scheduledAt || null,
      scheduledEndAt: scheduledEndAt || null,
      repeatMinutes,
      itemSuffixIsnida,
      lastGeneratedAt: now,
      lastPlayedAt: null,
      latestAudioUrl: null,
      generatedText: displayScript,
      createdAt: initialCreatedAt || now,
      updatedAt: now,
    };
    const toBroadcastItem = (
      it: { id: string; name: string; unit: string; price: number; originalPrice?: number | null; isSelected: boolean },
      i: number
    ): BroadcastItem => ({
      id: it.id,
      sessionId: id,
      isSelected: it.isSelected,
      name: it.name,
      unit: it.unit,
      price: it.price,
      originalPrice: it.originalPrice ?? undefined,
      sortOrder: i,
      createdAt: now,
      updatedAt: now,
    });
    const sessionItems = items.map((it, i) => toBroadcastItem(it, i));
    const sessionEventItems = eventItems.map((it, i) => toBroadcastItem(it, i));
    saveSession(session, sessionItems, sessionEventItems);
    setSaved(true);
    router.push(`/broadcast/${id}/play`);
  };

  if (!id) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-stone-500">잘못된 경로입니다.</p>
        <Link href="/" className="mt-2 inline-block text-amber-600 hover:underline">← 첫 화면</Link>
      </main>
    );
  }

  if (!loaded) {
    return (
      <main className="min-h-screen bg-[var(--bg)] p-8">
        <p className="text-stone-500">불러오는 중...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link href="/" className="text-sm text-stone-500 hover:text-stone-700">
          ← 첫 화면으로
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-stone-800">방송 수정</h1>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">1. 기본 정보</h2>
          <div className="mt-4 space-y-4">
            <div>
              <span className="text-sm text-stone-600">행사 유형</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["TIME_SALE", "CLEARANCE", "TODAY_DISCOUNT", "FREE"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEventType(t)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      eventType === t ? "bg-amber-500 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {EVENT_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
            {eventType === "FREE" && (
              <div>
                <label className="text-sm text-stone-600">시작 문구 (직접 입력)</label>
                <input
                  type="text"
                  value={customOpening}
                  onChange={(e) => setCustomOpening(e.target.value)}
                  placeholder="예: 오늘의 특가 상품을 안내드립니다."
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-stone-800"
                />
              </div>
            )}
            <div>
              <label className="text-sm text-stone-600">방송 제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 오후 3시 타임세일"
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-stone-800"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm text-stone-600">예정 시작 (표시용)</label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => {
                  const v = e.target.value;
                  setScheduledAt(v);
                  setScheduledEndAt(v);
                }}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-stone-800"
                />
              </div>
              <div>
                <label className="text-sm text-stone-600">예정 종료 (표시용)</label>
                <input
                  type="datetime-local"
                  value={scheduledEndAt}
                  onChange={(e) => setScheduledEndAt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-stone-800"
                />
              </div>
            </div>
            {/* 반복 간격은 재생 화면에서 설정·활용 예정 (세션에는 기존값 유지) */}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">2. 상품</h2>
          <div className="mt-1 space-y-0.5 text-xs text-amber-700">
            <p>행을 추가해서 상품을 등록하세요.</p>
            <p>정상가는 입력하지 않으면 방송에 나오지 않는 선택 항목입니다.</p>
            <p>단위는 한글로 적으면 음성이 더 자연스럽게 나옵니다.</p>
          </div>

          <div className="mt-6">
            <h3 className="text-base font-medium text-stone-700">초특가 상품</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="w-12 py-2 text-left font-medium text-stone-600">선택</th>
                    <th className="py-2 text-left font-medium text-stone-600">상품명</th>
                    <th className="w-24 py-2 text-left font-medium text-stone-600">단위</th>
                    <th className="w-28 py-2 text-left font-medium text-stone-600">정상가(선택)</th>
                    <th className="w-24 py-2 text-left font-medium text-stone-600">할인가</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b border-stone-100">
                      <td className="py-1.5">
                        <input
                          type="checkbox"
                          checked={it.isSelected}
                          onChange={(e) => updateItem("super")(it.id, "isSelected", e.target.checked)}
                          className="h-4 w-4 rounded border-stone-300"
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          value={it.name}
                          onChange={(e) => updateItem("super")(it.id, "name", e.target.value)}
                          className="w-full rounded border border-stone-200 px-2 py-1 text-stone-800"
                          placeholder="상품명"
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          value={it.unit}
                          onChange={(e) => updateItem("super")(it.id, "unit", e.target.value)}
                          className="w-full rounded border border-stone-200 px-2 py-1 text-stone-800"
                          placeholder="100그람"
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          type="number"
                          value={it.originalPrice ?? ""}
                          onChange={(e) => updateItem("super")(it.id, "originalPrice", e.target.value ? parseInt(e.target.value, 10) : null)}
                          className="w-full rounded border border-stone-200 px-2 py-1 text-stone-800"
                          placeholder="—"
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          type="number"
                          value={it.price || ""}
                          onChange={(e) => updateItem("super")(it.id, "price", parseInt(e.target.value, 10) || 0)}
                          className="w-full rounded border border-stone-200 px-2 py-1 text-stone-800"
                          placeholder="0"
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => removeItem("super")(it.id)}
                          className="text-stone-400 hover:text-red-600"
                          aria-label="삭제"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2">
              <button
                type="button"
                onClick={addRow("super")}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                + 행 추가
              </button>
            </div>
          </div>

          <div className="mt-8 border-t border-stone-100 pt-6">
            <h3 className="text-base font-medium text-stone-700">행사 상품</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="w-12 py-2 text-left font-medium text-stone-600">선택</th>
                    <th className="py-2 text-left font-medium text-stone-600">상품명</th>
                    <th className="w-24 py-2 text-left font-medium text-stone-600">단위</th>
                    <th className="w-28 py-2 text-left font-medium text-stone-600">정상가(선택)</th>
                    <th className="w-24 py-2 text-left font-medium text-stone-600">할인가</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {eventItems.map((it) => (
                    <tr key={it.id} className="border-b border-stone-100">
                      <td className="py-1.5">
                        <input
                          type="checkbox"
                          checked={it.isSelected}
                          onChange={(e) => updateItem("event")(it.id, "isSelected", e.target.checked)}
                          className="h-4 w-4 rounded border-stone-300"
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          value={it.name}
                          onChange={(e) => updateItem("event")(it.id, "name", e.target.value)}
                          className="w-full rounded border border-stone-200 px-2 py-1 text-stone-800"
                          placeholder="상품명"
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          value={it.unit}
                          onChange={(e) => updateItem("event")(it.id, "unit", e.target.value)}
                          className="w-full rounded border border-stone-200 px-2 py-1 text-stone-800"
                          placeholder="100그람"
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          type="number"
                          value={it.originalPrice ?? ""}
                          onChange={(e) => updateItem("event")(it.id, "originalPrice", e.target.value ? parseInt(e.target.value, 10) : null)}
                          className="w-full rounded border border-stone-200 px-2 py-1 text-stone-800"
                          placeholder="—"
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          type="number"
                          value={it.price || ""}
                          onChange={(e) => updateItem("event")(it.id, "price", parseInt(e.target.value, 10) || 0)}
                          className="w-full rounded border border-stone-200 px-2 py-1 text-stone-800"
                          placeholder="0"
                        />
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => removeItem("event")(it.id)}
                          className="text-stone-400 hover:text-red-600"
                          aria-label="삭제"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2">
              <button
                type="button"
                onClick={addRow("event")}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
              >
                + 행 추가
              </button>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">3. 방송 멘트</h2>
          <div className="mt-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={itemSuffixIsnida}
                onChange={(e) => {
                  setItemSuffixIsnida(e.target.checked);
                  setScriptTouched(false);
                }}
                className="h-4 w-4 rounded border-stone-300"
              />
              상품 끝에 &quot;입니다&quot; 붙이기
            </label>
            <button
              type="button"
              onClick={generateScriptClick}
              className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200"
            >
              멘트 다시 생성
            </button>
          </div>
          <textarea
            value={displayScript}
            onChange={(e) => {
              setScriptText(e.target.value);
              setScriptTouched(true);
            }}
            onBlur={updateScriptFromItems}
            className="mt-4 min-h-[180px] w-full rounded-lg border border-stone-200 px-3 py-3 text-stone-800"
            placeholder="멘트를 생성하거나 직접 수정하세요."
          />
        </section>

        <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-800">4. 저장 및 재생</h2>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-amber-500 px-5 py-2.5 font-medium text-white hover:bg-amber-600"
            >
              변경 사항 저장
            </button>
            {saved && (
              <span className="text-sm text-green-600">저장되었습니다.</span>
            )}
          </div>
          </section>
      </div>
    </main>
  );
}
