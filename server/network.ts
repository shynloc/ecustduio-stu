import { networkInterfaces, hostname } from "node:os";
import ipaddr from "ipaddr.js";
import { err } from "./db.js";
export const networkMode = () =>
  process.env.ECUSTUDIO_NETWORK_MODE === "lan" ? "lan" : "local";
export function privateClient(address: string) {
  try {
    let a = ipaddr.parse(address);
    if (a.kind() === "ipv6" && (a as any).isIPv4MappedAddress())
      a = (a as any).toIPv4Address();
    return ["loopback", "private", "linkLocal", "uniqueLocal"].includes(
      a.range(),
    );
  } catch {
    return false;
  }
}
export function loopbackClient(address: string) {
  try {
    let a = ipaddr.parse(address);
    if (a.kind() === "ipv6" && (a as any).isIPv4MappedAddress())
      a = (a as any).toIPv4Address();
    return a.range() === "loopback";
  } catch {
    return false;
  }
}
export function localAddresses() {
  return Object.entries(networkInterfaces())
    .flatMap(([name, items]) =>
      (items || [])
        .filter(
          (i) =>
            !i.internal &&
            i.family === "IPv4" &&
            privateClient(i.address) &&
            !i.address.startsWith("169.254."),
        )
        .map((i) => ({ name, address: i.address })),
    )
    .sort(
      (a, b) =>
        Number(/clash|tun|tap|veth|wsl|vpn/i.test(a.name)) -
        Number(/clash|tun|tap|veth|wsl|vpn/i.test(b.name)),
    );
}
export function networkInfo() {
  const port = Number(process.env.PORT || 37891);
  return {
    mode: networkMode(),
    port,
    localUrl: `http://127.0.0.1:${port}`,
    lanUrls:
      networkMode() === "lan"
        ? localAddresses().map((i) => ({
            interface: i.name,
            url: `http://${i.address}:${port}`,
          }))
        : [],
  };
}
export function guardNetwork(req: any) {
  let target: URL;
  try {
    target = new URL("http://" + req.headers.host);
  } catch {
    err("INVALID_HOST", "无效的访问地址", 403);
  }
  const name = target!.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const allowed = new Set(["127.0.0.1", "localhost", "::1"]);
  if (networkMode() === "lan") {
    for (const i of localAddresses()) allowed.add(i.address);
    allowed.add(hostname().toLowerCase());
    for (const h of (process.env.ECUSTUDIO_ALLOWED_HOSTS || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean))
      allowed.add(h);
    if (!privateClient(req.ip))
      err("NETWORK_FORBIDDEN", "仅允许本机或局域网访问", 403);
  } else if (!loopbackClient(req.ip))
    err("NETWORK_FORBIDDEN", "当前仅启用本机访问", 403);
  if (!allowed.has(name))
    err("INVALID_HOST", "访问地址不属于此工作台服务器", 403);
  if (req.headers.origin) {
    let origin: URL;
    try {
      origin = new URL(req.headers.origin);
    } catch {
      err("INVALID_ORIGIN", "跨站请求被拒绝", 403);
    }
    if (origin!.origin !== target!.origin)
      err(
        "INVALID_ORIGIN",
        "请使用同一工作台地址提交操作，跨站请求被拒绝",
        403,
      );
  }
  if (req.headers["sec-fetch-site"] === "cross-site")
    err("INVALID_ORIGIN", "跨站请求被拒绝", 403);
}
