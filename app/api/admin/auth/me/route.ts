import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/requireAdminApi.server";

export async function GET() {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ ok: true, username: admin.username, role: "admin" as const });
}
