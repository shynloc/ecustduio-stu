import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch as secureFetch } from "undici";
import { resolve, relative, isAbsolute } from "node:path";
import { realpathSync } from "node:fs";
import { err } from "./db.js";
import AdmZip from "adm-zip";
export function validateArchive(buffer: Buffer, maxBytes = 100 * 1024 * 1024) {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    err("INVALID_ARCHIVE", "无法读取压缩文件", 422);
  }
  const entries = zip!.getEntries();
  if (
    entries.length > 5000 ||
    entries.reduce((n, e) => n + e.header.size, 0) > maxBytes
  )
    err("ZIP_LIMIT", "压缩文件解压规模超出限制", 422);
  for (const e of entries) {
    if (
      e.entryName.includes("\\") ||
      e.entryName.startsWith("/") ||
      e.entryName.split("/").includes("..") ||
      e.entryName.includes(":") ||
      ((e.attr >>> 16) & 0xf000) === 0xa000
    )
      err("UNSAFE_PATH", "压缩文件包含不安全路径", 422);
  }
  return zip!;
}
export function isPublicAddress(address: string) {
  try {
    let a = ipaddr.parse(address);
    if (a.kind() === "ipv6" && (a as any).isIPv4MappedAddress())
      a = (a as any).toIPv4Address();
    return a.range() === "unicast";
  } catch {
    return false;
  }
}
export async function publicUrl(input: string) {
  const u = new URL(input);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    !["", "80", "443"].includes(u.port)
  )
    err("UNSAFE_URL", "只允许公开 HTTP/HTTPS 资料网址");
  const hostname = u.hostname.replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (isIP(hostname) && !isPublicAddress(hostname))
  )
    err("UNSAFE_URL", "禁止访问本机或内网地址");
  let addresses = await lookup(hostname, {
    all: true,
  });
  // Some local network tunnels synthesize private DNS answers for public names.
  // Independently resolve the public name, then pin the resulting public IP.
  // Never connect to the synthesized private address or relax the SSRF boundary.
  if (!isIP(hostname) && addresses.some((a) => !isPublicAddress(a.address))) {
    const response = await fetch(
      "https://dns.google/resolve?type=A&name=" + encodeURIComponent(hostname),
      { signal: AbortSignal.timeout(10000), redirect: "error" },
    );
    const answer: any = await response.json();
    addresses = (answer.Answer || [])
      .filter((a: any) => a.type === 1)
      .map((a: any) => ({ address: a.data, family: 4 }));
  }
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    err("UNSAFE_URL", "禁止访问本机、内网或保留地址");
  return { u, addresses };
}
export async function fetchPublic(
  input: string,
  signal?: AbortSignal,
  maxBytes = 8 * 1024 * 1024,
) {
  let url = input;
  for (let hop = 0; hop < 5; hop++) {
    const { u, addresses } = await publicUrl(url);
    const address = addresses[0];
    const agent = new Agent({
      connect: {
        lookup: ((hostname: any, options: any, callback: any) => {
          if (options?.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        }) as any,
      },
    });
    try {
      const res = await secureFetch(u, {
        dispatcher: agent,
        redirect: "manual",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000),
        headers: { "user-agent": "EcuStudio/0.1 local education research" },
      });
      if (
        res.status >= 300 &&
        res.status < 400 &&
        res.headers.get("location")
      ) {
        url = new URL(res.headers.get("location")!, u).href;
        await res.body?.cancel();
        continue;
      }
      if (!res.ok)
        err("SOURCE_UNAVAILABLE", `资料请求失败 HTTP ${res.status}`, 502);
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of res.body as any) {
        total += chunk.length;
        if (total > maxBytes) err("PAYLOAD_TOO_LARGE", "资料超过大小限制", 413);
        chunks.push(chunk);
      }
      return {
        url: u.href,
        buffer: Buffer.concat(chunks),
        type: res.headers.get("content-type") || "",
      };
    } finally {
      await agent.close();
    }
  }
  err("REDIRECT_LIMIT", "跳转次数过多");
}
export function inside(root: string, path: string) {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel))
    err("UNSAFE_PATH", "文件路径越界");
  return target;
}
export function existingInside(root: string, path: string) {
  const target = inside(root, path);
  const real = realpathSync(target);
  inside(realpathSync(root), real);
  return real;
}
export function canonicalUrl(raw: string) {
  const u = new URL(raw);
  u.hash = "";
  for (const k of [...u.searchParams.keys()])
    if (k.startsWith("utm_") || ["spm", "from"].includes(k))
      u.searchParams.delete(k);
  u.searchParams.sort();
  return u.href;
}
