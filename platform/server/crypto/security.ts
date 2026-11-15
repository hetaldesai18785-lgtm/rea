import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";
import { SERVER_CONFIG } from "../config/env.js";

export const hashPassword = (password: string): string => {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
};

export const verifyPassword = (password: string, stored: string): boolean => {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
};

export const generateSessionToken = (): string => randomBytes(32).toString("base64url");

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const encryptSecret = (plaintext: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", SERVER_CONFIG.masterKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
};

export const decryptSecret = (ciphertext: string): string => {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted secret format");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed encrypted secret");
  }
  const iv = Buffer.from(ivB64, "base64url");
  const authTag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", SERVER_CONFIG.masterKey, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};

export const maskSecretHint = (secret: string): string => {
  const trimmed = secret.trim();
  if (trimmed.length <= 6) return "••••••";
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-3)}`;
};

export const slugify = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "project";

export const resolveContainedPath = (rootDir: string, relativePath: string): string => {
  if (!relativePath || relativePath.includes("\0")) {
    throw new Error("Invalid path");
  }
  const normalizedInput = relativePath.replace(/\\/g, "/");
  if (normalizedInput.startsWith("/") || /^[A-Za-z]:\//.test(normalizedInput)) {
    throw new Error(`Absolute paths are not allowed inside sandbox: ${relativePath}`);
  }
  const canonicalRoot = realpathSync(rootDir);
  const candidate = resolve(canonicalRoot, normalizedInput);
  if (candidate !== canonicalRoot && !candidate.startsWith(canonicalRoot + sep)) {
    throw new Error(`Path escapes project sandbox root: ${relativePath}`);
  }
  try {
    const stat = lstatSync(candidate);
    if (stat.isSymbolicLink()) {
      const target = realpathSync(candidate);
      if (target !== canonicalRoot && !target.startsWith(canonicalRoot + sep)) {
        throw new Error(`Symlink escapes project sandbox root: ${relativePath}`);
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw err;
    }
  }
  return candidate;
};

export const redactSensitiveOutput = (text: string, secrets: readonly string[]): string => {
  let out = text;
  for (const val of secrets) {
    if (val && val.length >= 6) {
      out = out.split(val).join("[REDACTED]");
    }
  }
  return out;
};
