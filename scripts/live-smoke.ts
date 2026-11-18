import { writeFileSync, mkdirSync } from "node:fs";
import { authenticatedSession } from './authenticated-session.js';
const base = "http://127.0.0.1:37891";
const session = await authenticatedSession(base + '/api');
const cookie = session.headers.get("set-cookie")!.split(";")[0];
const { csrf } = (await session.json()) as any;
async function request(path: string, body?: any) {
  const r = await fetch(base + "/api" + path, {
    method: body ? "POST" : "GET",
    headers: {
      cookie,
      "x-csrf-token": csrf,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result: any = await r.json();
  if (!r.ok) throw new Error(result.error?.message);
  return result;
}
const job = await request("/imports", {
  url: "https://www.bjeea.cn/html/zkzz/zkzc/2026/1102/88448.html",
  title: "北京教育考试院关于做好2027年初中学业水平考试报名工作的通知",
  publisher: "北京教育考试院",
  published: "2026-11-02",
  documentType: "正式文件",
  scope: {
    region: "北京",
    district: "全市",
    stage: "中考",
    year: 2027,
    audience: "北京初三家长",
  },
});
let result: any;
for (let i = 0; i < 90; i++) {
  result = await request("/jobs/" + job.id);
  if (!["queued", "running"].includes(result.state)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
mkdirSync("test-results", { recursive: true });
writeFileSync(
  "test-results/live-import.json",
  JSON.stringify(
    {
      jobId: job.id,
      state: result.state,
      error: result.error,
      snapshotId: result.result?.id,
      source: result.result?.url,
      title: result.result?.title,
      paragraphCount: result.result?.paragraphs?.length,
      hash: result.result?.hash,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    jobId: job.id,
    state: result.state,
    error: result.error,
    snapshotId: result.result?.id,
    title: result.result?.title,
    paragraphCount: result.result?.paragraphs?.length,
  }),
);
