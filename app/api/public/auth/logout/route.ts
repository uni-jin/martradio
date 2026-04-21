import { NextResponse } from "next/server";
import { revokeSessionFromCookie } from "@/lib/userSession.server";

export async function POST() {
  await revokeSessionFromCookie("logout");
  return NextResponse.json({ ok: true });
}

