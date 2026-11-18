import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { homedir, networkInterfaces } from "node:os";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { stopMacService } from "./upgrade.mjs";
if (process.platform !== "darwin")
  throw new Error("This service manager is for macOS.");
const root = resolve(import.meta.dirname, "../.."),
  app = join(root, "app"),
  data = join(root, "data"),
  logs = join(data, "logs");
mkdirSync(logs, { recursive: true, mode: 0o700 });
const id = createHash("sha256").update(data).digest("hex").slice(0, 16),
  label = "cn.ecustudio." + id;
const plist = join(homedir(), "Library", "LaunchAgents", label + ".plist"),
  domain = "gui/" + process.getuid();
const configFile = join(root, "ecustudio.json"),
  pidFile = join(logs, "mac-server.json"),
  entry = join(app, "dist-server/server/index.js");
let cfg = existsSync(configFile)
  ? JSON.parse(readFileSync(configFile, "utf8"))
  : { port: 37891, networkMode: "lan", autoStart: true };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function health(port = cfg.port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return await r.json();
  } catch {
    return null;
  }
}
function environment() {
  return {
    ...process.env,
    ECUSTUDIO_DATA_DIR: data,
    ECUSTUDIO_NETWORK_MODE: cfg.networkMode,
    PORT: String(cfg.port),
    PLAYWRIGHT_BROWSERS_PATH: join(root, "runtime/browsers"),
  };
}
function addresses() {
  return Object.entries(networkInterfaces()).flatMap(([name, items]) =>
    (items || [])
      .filter(
        (i) =>
          !i.internal && i.family === "IPv4" && !/^169\.254\./.test(i.address),
      )
      .map((i) => ({
        interface: name,
        url: `http://${i.address}:${cfg.port}`,
      })),
  );
}
function xml(v) {
  return String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
}
function arguments_() {
  return [
    ...(existsSync(join(app, ".env"))
      ? ["--env-file=" + join(app, ".env")]
      : []),
    entry,
  ];
}
function writePlist() {
  mkdirSync(resolve(plist, ".."), { recursive: true });
  const env = environment(),
    keys = [
      "ECUSTUDIO_DATA_DIR",
      "ECUSTUDIO_NETWORK_MODE",
      "PORT",
      "PLAYWRIGHT_BROWSERS_PATH",
    ];
  const text = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${[process.execPath, ...arguments_()].map((a) => "<string>" + xml(a) + "</string>").join("")}</array><key>WorkingDirectory</key><string>${xml(app)}</string><key>EnvironmentVariables</key><dict>${keys.map((k) => "<key>" + k + "</key><string>" + xml(env[k]) + "</string>").join("")}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${xml(join(logs, "mac-service-stdout.log"))}</string><key>StandardErrorPath</key><string>${xml(join(logs, "mac-service-stderr.log"))}</string></dict></plist>`;
  writeFileSync(plist, text, { mode: 0o600 });
}
async function free(port) {
  return await new Promise((ok) => {
    const s = createServer();
    s.once("error", () => ok(false));
    s.listen(port, "0.0.0.0", () => s.close(() => ok(true)));
  });
}
async function stop() {
  await stopMacService(root);
  console.log("已停止本安装实例，业务数据保留。");
}
async function configure() {
  cfg.port = Number(process.env.ECUSTUDIO_PORT || cfg.port);
  if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65505)
    throw new Error("端口须为1024–65505");
  cfg.networkMode = process.env.ECUSTUDIO_NETWORK_MODE || cfg.networkMode;
  if (!["lan", "local"].includes(cfg.networkMode))
    throw new Error("网络模式须为lan或local");
  cfg.autoStart =
    process.env.ECUSTUDIO_NO_AUTOSTART === "1"
      ? false
      : cfg.autoStart !== false;
  const h = await health();
  if (h?.instanceId !== id) {
    let n = 0;
    while (!(await free(cfg.port)) && n++ < 30) cfg.port++;
    if (!(await free(cfg.port))) throw new Error("没有找到可用服务端口");
  }
  writeFileSync(configFile, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  if (cfg.autoStart) writePlist();
  console.log(
    JSON.stringify(
      {
        version: JSON.parse(readFileSync(join(app,"package.json"),"utf8")).version,
        installDir: root,
        ...cfg,
        localUrl: `http://127.0.0.1:${cfg.port}`,
        lanUrls: addresses(),
      },
      null,
      2,
    ),
  );
}
async function start() {
  if ((await health())?.instanceId === id) {
    console.log("工作台已在运行。");
    if (process.env.ECUSTUDIO_NO_BROWSER !== "1")
      spawnSync("/usr/bin/open", [`http://127.0.0.1:${cfg.port}`]);
    return;
  }
  if (!(await free(cfg.port)))
    throw new Error("端口被其他程序占用，请重跑安装或修改ecustudio.json");
  let launchAgent = false;
  if (cfg.autoStart) {
    writePlist();
    spawnSync("/bin/launchctl", ["bootout", domain + "/" + label], {
      stdio: "ignore",
    });
    launchAgent =
      spawnSync("/bin/launchctl", ["bootstrap", domain, plist], {
        encoding: "utf8",
      }).status === 0;
  }
  if (!launchAgent) {
    if (cfg.autoStart)
      console.warn(
        "当前GUI会话未能加载LaunchAgent，改为普通后台启动；登录自启需在Mac图形用户会话验证。",
      );
    const stdout = openSync(join(logs, "mac-service-stdout.log"), "a", 0o600),
      stderr = openSync(join(logs, "mac-service-stderr.log"), "a", 0o600);
    const child = spawn(process.execPath, arguments_(), {
      cwd: app,
      env: environment(),
      detached: true,
      stdio: ["ignore", stdout, stderr],
    });
    writeFileSync(pidFile, JSON.stringify({ pid: child.pid, entry }), {
      mode: 0o600,
    });
    child.unref();
    closeSync(stdout);
    closeSync(stderr);
  }
  for (let n = 0; n < 100; n++) {
    if ((await health())?.instanceId === id) {
      const result = {
        version: JSON.parse(readFileSync(join(app,"package.json"),"utf8")).version,
        installDir: root,
        localUrl: `http://127.0.0.1:${cfg.port}`,
        networkMode: cfg.networkMode,
        lanUrls: cfg.networkMode === "lan" ? addresses() : [],
        launchAgent,
        autoStartRequested: cfg.autoStart,
      };
      writeFileSync(
        join(root, "installation-result.json"),
        JSON.stringify(result, null, 2),
      );
      console.log(JSON.stringify(result, null, 2));
      if (process.env.ECUSTUDIO_NO_BROWSER !== "1")
        spawnSync("/usr/bin/open", [result.localUrl]);
      return;
    }
    await delay(300);
  }
  throw new Error("启动未成功，请查看data/logs/mac-service-stderr.log");
}
const command = process.argv[2] || "status";
try {
  if (command === "configure") await configure();
  else if (command === "start") await start();
  else if (command === "stop") await stop();
  else if (command === "status")
    console.log(
      JSON.stringify(
        {
          health: await health(),
          config: cfg,
          installDir: root,
          label,
          launchAgentPath: plist,
          lanUrls: addresses(),
        },
        null,
        2,
      ),
    );
  else throw new Error("未知命令");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}
