import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const PREFIX = "scrypt1";

export async function hashAdminPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${PREFIX}:${salt}:${derived.toString("hex")}`;
}

export async function verifyAdminPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== PREFIX) return false;
  const [, salt, hashHex] = parts;
  if (!salt || !hashHex) return false;
  let expected: Buffer;
  try {
    expected = (await scryptAsync(plain, salt, 64)) as Buffer;
  } catch {
    return false;
  }
  let actual: Buffer;
  try {
    actual = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
