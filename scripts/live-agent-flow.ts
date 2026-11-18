import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { authenticatedSession } from './authenticated-session.js';
const dir = "test-results/live-agent";
mkdirSync(dir, { recursive: true });
const base = "http://127.0.0.1:37891/api";
const session = await authenticatedSession(base),
  cookie = session.headers.get("set-cookie")!.split(";")[0],
  { csrf } = (await session.json()) as any;
async function api(path: string, body?: any, method = body ? "POST" : "GET") {
  const r = await fetch(base + path, {
    method,
    headers: {
      cookie,
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value: any = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(value.error));
  return value;
}
const recordPath = dir + "/run.json";
let record: any;
try {
  record = JSON.parse(readFileSync(recordPath, "utf8"));
} catch {
  record = { startedAt: new Date().toISOString() };
}
function save() {
  writeFileSync(recordPath, JSON.stringify(record, null, 2));
}
async function job(input: any) {
  const j = await api("/agent/runs", input);
  record.jobs ||= {};
  record.jobs[input.kind] = j.id;
  save();
  console.log(JSON.stringify({ stage: input.kind, jobId: j.id }));
  for (let i = 0; i < 660; i++) {
    const v = await api("/jobs/" + j.id);
    if (!["queued", "running"].includes(v.state)) {
      writeFileSync(
        dir + "/" + input.kind + ".json",
        JSON.stringify(v, null, 2),
      );
      if (v.state !== "succeeded") throw new Error(JSON.stringify(v.error));
      console.log(
        JSON.stringify({
          stage: input.kind,
          state: v.state,
          usage: v.result?.usage,
          requests: v.result?.requests,
        }),
      );
      return v.result;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("job timeout");
}
const stage = process.argv[2] || "research";
try {
  const state = await api("/state");
  if (stage === "research") {
    if (!state.settings.allowExternalAI) {
      const keys = [
        "model",
        "allowExternalAI",
        "maxRequests",
        "maxTools",
        "timeoutSeconds",
        "maxInputChars",
        "maxTokens",
      ];
      await api(
        "/settings/deepseek",
        {
          revision: state.settings.revision,
          settings: Object.fromEntries(
            keys.map((k) => [
              k,
              k === "allowExternalAI" ? true : state.settings[k],
            ]),
          ),
        },
        "PATCH",
      );
    }
    record.probe = await api("/agent/probe", {});
    console.log(JSON.stringify({ probe: record.probe }));
    save();
    const source =
      state.snapshots.find(
        (s: any) => s.id === "99031601-f00a-4535-88f4-682854926564",
      ) || state.snapshots[0];
    if (!source) throw new Error("No imported material");
    record.snapshotId = source.id;
    save();
    await job({
      kind: "research",
      snapshotIds: [source.id],
      prompt:
        "真实链路验收：精读原文，提取5至8项关键事实，引用逐字原文，不修复原文中的空格或数字排版；只基于资料提出2个选题。",
    });
    const snapshot = await api("/snapshots/" + source.id);
    writeFileSync(
      dir + "/source-and-claims.json",
      JSON.stringify(snapshot, null, 2),
    );
    console.log(
      JSON.stringify({
        claims: snapshot.claims.map((c: any) => ({
          id: c.id,
          text: c.text,
          quote: c.quote,
          paragraph: c.paragraph_id,
        })),
        scope: snapshot.scope,
      }),
    );
  } else if (stage === "master") {
    const source = await api("/snapshots/" + record.snapshotId);
    if (!record.projectId) {
      const project = await api("/projects", {
        title: "2027北京初中学考报名｜DeepSeek完整流程验收",
        scope: source.scope,
        snapshotIds: [source.id],
      });
      record.projectId = project.id;
      save();
    }
    const result = await job({
      kind: "master",
      projectId: record.projectId,
      prompt:
        "为北京2027年初中学业水平考试报名建立简洁内容母稿，最多8块、1500字。只总结已有已核实claim覆盖的报名窗口、报名地点、英语机考安排及条件提示，不扩展未建事实的材料清单和特殊身份条件。原文没有年份空格排版问题，不要沿用旧候选中的相关假设。引用claimId，政策未定的日期保持拟于/另行通知表述。不要生成分镜字段。",
    });
    record.masterId = result.versionId;
    save();
  } else if (stage === "repair") {
    const result = await job({
      kind: "speech",
      projectId: record.projectId,
      masterId: record.masterId,
      duration: 90,
      prompt:
        "改为真正适合90秒的口播：正文总字数320至380字，聚焦报名时间与报名地点、英语考试两次日期三件事；不展开报考资格和审核材料。保留各区自定时间、第二次拟于2027年3月另行通知等限定。按240字/分钟估算，未实测。最多4块。引用已有claimId。",
    });
    record.speechId = result.versionId;
    save();
    const p = await api("/projects/" + record.projectId);
    const v = p.versions.find((v: any) => v.id === record.policyId);
    const body = structuredClone(v.body);
    for (const b of body.blocks) {
      delete b.duration;
      delete b.scene;
      delete b.camera;
      delete b.prompt;
    }
    const clean = await api("/versions", {
      projectId: record.projectId,
      kind: "policy",
      body,
      masterId: record.masterId,
      baseVersionId: v.id,
      expectedRevision: p.revision,
    });
    record.policyId = clean.id;
    save();
  } else if (stage === "repair-video") {
    const result = await job({
      kind: "storyboard",
      projectId: record.projectId,
      masterId: record.masterId,
      duration: 90,
      prompt:
        "重新生成可实际容纳旁白的90秒分镜，旁白正文总计320-380字，只讲报名窗口、报名地点、两次英语考试日期。最多5镜头，duration合计90秒。保留各区自定时段、第二次拟于2027年3月另行通知等限定，引用claimId。不能把整篇母稿硬塞90秒。",
    });
    record.storyboardId = result.versionId;
    save();
    const p = await api("/projects/" + record.projectId);
    const v = p.versions.find((v: any) => v.id === record.presentationId);
    const body = structuredClone(v.body);
    for (const b of body.blocks) {
      delete b.duration;
      delete b.scene;
      delete b.camera;
      delete b.prompt;
    }
    const clean = await api("/versions", {
      projectId: record.projectId,
      kind: "presentation",
      body,
      masterId: record.masterId,
      baseVersionId: v.id,
      expectedRevision: p.revision,
    });
    record.presentationId = clean.id;
    save();
  } else if (stage === "content") {
    for (const kind of [
      "policy",
      "speech",
      "wechat",
      "presentation",
      "storyboard",
    ]) {
      if (record[kind + "Id"]) continue;
      const result = await job({
        kind,
        projectId: record.projectId,
        masterId: record.masterId,
        duration: 90,
        slideCount: 6,
        prompt:
          "真实验收：基于母稿和已核对原文，保留日期、条件和例外，逐块引用claimId；禁止把语速、片长、页序等制作参数写作政策事实。内容简洁完整，适用北京2027初中学考报名。",
      });
      record[kind + "Id"] = result.versionId;
      save();
    }
  } else if (stage === "inspect") {
    const p = await api("/projects/" + record.projectId);
    writeFileSync(dir + "/project.json", JSON.stringify(p, null, 2));
    console.log(
      JSON.stringify(
        p.versions.map((v: any) => ({
          id: v.id,
          kind: v.kind,
          blocks: v.body.blocks.length,
          issues: v.issues,
          unverified: v.body.unverified,
          summary: v.body.summary,
        })),
      ),
    );
  } else if (stage === "export") {
    record.exports ||= [];
    for (const [kind, format] of [
      ["master", "docx"],
      ["policy", "pdf"],
      ["speech", "docx"],
      ["wechat", "html"],
      ["presentation", "pptx"],
      ["storyboard", "csv"],
    ]) {
      const versionId =
        kind === "master" ? record.masterId : record[kind + "Id"];
      if (!versionId) throw new Error("missing " + kind);
      const j = await api("/exports", {
        targetType: "version",
        targetId: versionId,
        format,
        mode: "draft",
      });
      for (let i = 0; i < 180; i++) {
        const v = await api("/jobs/" + j.id);
        if (v.state === "succeeded") {
          record.exports.push({
            kind,
            format,
            artifactId: v.result.id,
            jobId: j.id,
          });
          save();
          console.log(
            JSON.stringify({ export: kind, format, artifactId: v.result.id }),
          );
          break;
        }
        if (["failed", "canceled"].includes(v.state))
          throw new Error(JSON.stringify(v.error));
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
  save();
} catch (e: any) {
  record.lastError = e.message;
  save();
  console.error(e.message);
  process.exitCode = 1;
}
