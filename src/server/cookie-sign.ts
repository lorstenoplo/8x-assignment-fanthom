import { createHmac, timingSafeEqual } from "node:crypto";

export const WORKSPACE_COOKIE = "fathom_ws";

function secret() {
  return process.env.SESSION_SECRET || "insecure-dev-secret-set-SESSION_SECRET-in-.env.local";
}

export function signWorkspaceId(id: string) {
  const mac = createHmac("sha256", secret()).update(id).digest("base64url");
  return `${id}.${mac}`;
}

export function verifyWorkspaceToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(id).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}
