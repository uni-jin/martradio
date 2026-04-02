"use client";

import { useState } from "react";
import AdminShell from "@/app/_components/AdminShell";
import { getAdminProducts, saveAdminProducts, type AdminProduct } from "@/lib/adminData";

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>(() => getAdminProducts());

  const persist = (next: AdminProduct[]) => {
    setProducts(next);
    saveAdminProducts(next);
  };

  return (
    <AdminShell title="구독 상품 관리">
      <div className="space-y-3">
        {products.map((p) => (
          <div key={p.id} className="rounded-xl border border-stone-200 p-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-5">
              <input
                value={p.name}
                onChange={(e) => persist(products.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
                className="rounded-lg border border-stone-200 px-3 py-2"
              />
              <input
                type="number"
                value={p.maxChars ?? ""}
                placeholder="무제한은 빈값"
                onChange={(e) =>
                  persist(
                    products.map((x) =>
                      x.id === p.id ? { ...x, maxChars: e.target.value === "" ? null : Number(e.target.value) } : x
                    )
                  )
                }
                className="rounded-lg border border-stone-200 px-3 py-2"
              />
              <input
                type="number"
                value={p.priceMonthly}
                onChange={(e) => persist(products.map((x) => (x.id === p.id ? { ...x, priceMonthly: Number(e.target.value) } : x)))}
                className="rounded-lg border border-stone-200 px-3 py-2"
              />
              <input
                type="number"
                value={p.visibleSessionLimit ?? ""}
                placeholder="방송 개수 무제한은 빈값"
                onChange={(e) =>
                  persist(
                    products.map((x) =>
                      x.id === p.id
                        ? {
                            ...x,
                            visibleSessionLimit:
                              e.target.value === "" ? null : Number(e.target.value),
                          }
                        : x
                    )
                  )
                }
                className="rounded-lg border border-stone-200 px-3 py-2"
              />
              <label className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={p.isActive}
                  onChange={(e) =>
                    persist(products.map((x) => (x.id === p.id ? { ...x, isActive: e.target.checked } : x)))
                  }
                />
                상품 활성
              </label>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              정책 필드: 플랜명 / 글자수 제한 / 월 요금 / 기존 방송 표시 개수 / 활성 여부
            </p>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}

