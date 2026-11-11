/**
 * Скачивание фида только с внешних адресов (защита от SSRF).
 * Хост резолвится в IP до запроса; приватные, loopback, link-local и CGNAT-адреса запрещены.
 * Редиректы проходим вручную (до 3) и проверяем каждый адрес заново.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function isPrivateIp(ip) {
  const h = String(ip).toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(h) === 4) {
    const [a, b] = h.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (isIP(h) === 6) {
    if (h.startsWith("::ffff:")) return isPrivateIp(h.slice(7));
    return h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
  }
  return false;
}

export async function assertPublicUrl(rawUrl) {
  const u = new URL(rawUrl);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error(`Feed URL protocol not allowed: ${u.protocol}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error(`Feed host is internal: ${host}`);
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(`Feed host resolves to an internal address: ${host}`);
  return u;
}

export async function safeFetch(rawUrl, init = {}, maxRedirects = 3) {
  let url = rawUrl;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertPublicUrl(url);
    const res = await fetch(url, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location"), url).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}
