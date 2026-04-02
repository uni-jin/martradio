export function verifyAdminCredentials(username: string, password: string): boolean {
  const u = (process.env.ADMIN_USERNAME?.trim() || "admin").toLowerCase();
  const inUser = username.trim().toLowerCase();
  if (inUser !== u) return false;

  const configured = process.env.ADMIN_PASSWORD?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured) return false;
    return password === configured;
  }
  const effective = configured ?? "123qwe";
  return password === effective;
}
