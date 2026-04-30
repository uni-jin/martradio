export function getSuperAdminUsernameNormalized(): string {
  return (process.env.SUPER_ADMIN_USERNAME?.trim() || "super").toLowerCase();
}

export function getAdminUsernameNormalized(): string {
  return (process.env.ADMIN_USERNAME?.trim() || "admin").toLowerCase();
}

export function verifySuperAdminCredentials(username: string, password: string): boolean {
  const u = getSuperAdminUsernameNormalized();
  const inUser = username.trim().toLowerCase();
  if (inUser !== u) return false;

  const configured = process.env.SUPER_ADMIN_PASSWORD?.trim();
  if (process.env.NODE_ENV === "production") {
    if (!configured) return false;
    return password === configured;
  }
  const effective = configured ?? "123qwe";
  return password === effective;
}

export function verifyAdminCredentials(username: string, password: string): boolean {
  const u = getAdminUsernameNormalized();
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
