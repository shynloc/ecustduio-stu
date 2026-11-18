import "./setup.js";
import { buildApp } from "./app.js";
import { networkMode, networkInfo } from "./network.js";
const app = await buildApp(true);
const port = Number(process.env.PORT || 37891);
try {
  await app.listen({
    host: networkMode() === "lan" ? "0.0.0.0" : "127.0.0.1",
    port,
  });
  console.log(`EcuStudio教创工作台已启动：http://127.0.0.1:${port}`);
  if (networkMode() === "lan")
    console.log(
      "局域网地址：" +
        networkInfo()
          .lanUrls.map((v) => v.url)
          .join("，"),
    );
} catch (e: any) {
  console.error(
    e.code === "EADDRINUSE"
      ? `端口 ${port} 已被占用，请关闭旧实例或设置 PORT。`
      : e.message,
  );
  process.exit(1);
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
