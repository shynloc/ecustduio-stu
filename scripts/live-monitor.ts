import { writeFileSync } from "node:fs";
import { authenticatedSession } from './authenticated-session.js';
const base = "http://127.0.0.1:37891";
const s = await authenticatedSession(base + '/api'),
  cookie = s.headers.get("set-cookie")!.split(";")[0],
  { csrf } = (await s.json()) as any;
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
  const v: any = await r.json();
  if (!r.ok) throw new Error(v.error?.message);
  return v;
}
const job = await request("/monitor", {
  windowStart: new Date("2026-11-01T00:00:00+08:00").toISOString(),
  windowEnd: new Date().toISOString(),
});
let result: any;
for (let i = 0; i < 180; i++) {
  result = await request("/jobs/" + job.id);
  if (!["queued", "running"].includes(result.state)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
const report = result.result?.reportId
  ? await request("/reports/" + result.result.reportId)
  : null;
writeFileSync(
  "test-results/live-monitor.json",
  JSON.stringify(
    {
      jobId: job.id,
      state: result.state,
      error: result.error,
      result: result.result,
      report,
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
    result: result.result,
    statistics: report
      ? {
          sourceCount: report.payload.sourceCount,
          successfulSources: report.payload.successfulSources,
          candidates: report.payload.candidates,
          validCount: report.payload.validCount,
          verifiedCount: report.payload.verifiedCount,
          recommended: report.payload.topics.length,
          warnings: report.payload.warnings,
        }
      : null,
  }),
);
