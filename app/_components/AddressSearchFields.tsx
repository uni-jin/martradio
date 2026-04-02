"use client";

import { useState } from "react";
import { openDaumPostcode } from "@/lib/daumPostcode";

type Props = {
  baseLabel?: string;
  baseValue: string;
  detailValue: string;
  onBaseChange: (v: string) => void;
  onDetailChange: (v: string) => void;
  disabled?: boolean;
  /** 기본·상세 주소를 비우는 버튼 (회원정보 수정 등) */
  allowClear?: boolean;
};

export default function AddressSearchFields({
  baseLabel = "마트 주소",
  baseValue,
  detailValue,
  onBaseChange,
  onDetailChange,
  disabled,
  allowClear,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSearch = async () => {
    setErr(null);
    setLoading(true);
    try {
      await openDaumPostcode((data) => {
        const addr = data.roadAddress?.trim() || data.jibunAddress?.trim() || "";
        onBaseChange(addr);
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "주소 검색을 열 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm text-stone-600">
        {baseLabel}{" "}
        <span className="text-xs text-stone-400">(선택)</span>
      </label>
      <div className="flex flex-wrap items-stretch gap-2">
        <input
          type="text"
          readOnly
          value={baseValue}
          placeholder="주소검색 버튼으로 도로명 주소를 입력하세요"
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={disabled || loading}
          className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {loading ? "열기 중…" : "주소검색"}
        </button>
        {allowClear && (baseValue.trim() !== "" || detailValue.trim() !== "") && (
          <button
            type="button"
            onClick={() => {
              onBaseChange("");
              onDetailChange("");
            }}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-50"
          >
            주소 초기화
          </button>
        )}
      </div>
      <div>
        <input
          type="text"
          value={detailValue}
          onChange={(e) => onDetailChange(e.target.value)}
          placeholder="상세주소 입력"
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-800"
          disabled={disabled}
        />
      </div>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
}
