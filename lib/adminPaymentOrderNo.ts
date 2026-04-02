import type { AdminPayment } from "@/lib/adminData";

function userGroupKey(p: AdminPayment): string {
  const uid = (p.userId ?? "").trim();
  if (uid) return `uid:${uid}`;
  return `un:${(p.username ?? "").trim()}`;
}

/**
 * 회원 상세 결제 내역과 동일: 결제일(로컬 YYYYMMDD) + 해당 회원 결제 이력(오래된 순)에서의 순번 5자리.
 */
export function buildPaymentOrderNoMap(payments: AdminPayment[]): Map<string, string> {
  const byGroup = new Map<string, AdminPayment[]>();
  for (const p of payments) {
    const k = userGroupKey(p);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k)!.push(p);
  }
  const out = new Map<string, string>();
  for (const [, plist] of byGroup) {
    const asc = [...plist].sort(
      (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
    );
    asc.forEach((p, idx) => {
      const d = new Date(p.paidAt);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const orderNo = `${y}${m}${day}${String(idx + 1).padStart(5, "0")}`;
      out.set(p.id, orderNo);
    });
  }
  return out;
}
