export type AdminMenuLeaf = {
  /** 권한·경로 매칭용 */
  href: string;
  label: string;
};

export type AdminMenuGroupDef = {
  groupTitle: string;
  items: AdminMenuLeaf[];
};

/**
 * 관리자 권한 관리(체크박스) 및 AdminShell과 동일한 depth1/2 구조.
 * hiddenPathPrefixes 전용 경로는 별도 leaf로 포함합니다.
 */
export const ADMIN_MENU_GROUPS: AdminMenuGroupDef[] = [
  {
    groupTitle: "대시보드",
    items: [{ href: "/admin", label: "대시보드" }],
  },
  {
    groupTitle: "회원관리",
    items: [
      { href: "/admin/users", label: "회원관리" },
      { href: "/admin/referrers", label: "추천인관리" },
    ],
  },
  {
    groupTitle: "결제내역/통계",
    items: [
      { href: "/admin/payments", label: "결제 상세 내역" },
      { href: "/admin/referrer-payments", label: "추천인 결제 통계" },
    ],
  },
  {
    groupTitle: "콘텐츠 관리",
    items: [
      { href: "/admin/voices", label: "음성 템플릿 관리" },
      { href: "/admin/products", label: "상품 관리" },
    ],
  },
  {
    groupTitle: "설정",
    items: [{ href: "/admin/settings/prompts", label: "프롬프트 관리" }],
  },
];

export function collectAssignableMenuHrefs(): string[] {
  const s = new Set<string>();
  for (const g of ADMIN_MENU_GROUPS) {
    for (const it of g.items) {
      s.add(it.href);
    }
  }
  return [...s];
}

export const REFERRER_ADMIN_PASSWORD_HREF = "/admin/settings/password";
