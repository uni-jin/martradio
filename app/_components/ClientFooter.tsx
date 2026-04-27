"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ClientFooter() {
  const pathname = usePathname() ?? "";
  if (pathname.startsWith("/admin")) return null;
  return (
    <footer className="border-t border-stone-200 bg-white/80 px-4 py-4 text-sm text-stone-500 sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <Link href="/legal/terms" className="hover:text-stone-700 hover:underline">
          이용약관
        </Link>
        <Link href="/legal/privacy" className="hover:text-stone-700 hover:underline">
          개인정보처리방침
        </Link>
        <span className="text-stone-300">|</span>
        <span>Copyright ©UNIWIZ. All rights reserved.</span>
      </div>
    </footer>
  );
}
