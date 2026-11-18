import { get, run, id, json, settings, root, dataDir } from "./db.js";
import { registerSkill } from "./agent.js";
export function setup() {
  const scope = {
    region: "北京",
    district: "全市",
    stage: "中考",
    year: 2026,
    audience: "北京初三家长",
  };
  for (const [name, url, stage] of [
    [
      "北京教育考试院 · 中考政策",
      "https://www.bjeea.cn/html/zkzz/zkzc/index.html",
      "中考",
    ],
    [
      "北京教育考试院 · 高考通知",
      "https://www.bjeea.cn/html/gkgz/tzgg/index.html",
      "高考",
    ],
  ])
    if (!get("SELECT id FROM sources WHERE url=?", url))
      run(
        "INSERT INTO sources(id,name,url,scope) VALUES(?,?,?,?)",
        id(),
        name,
        url,
        json({ ...scope, stage }),
      );
  registerSkill();
}
setup();
if (
  process.argv[1]?.endsWith("setup.ts") ||
  process.argv[1]?.endsWith("setup.js")
)
  console.log("数据目录已初始化：" + dataDir);
