// Derive defaults only from selected source metadata; never invent missing facts.
export function creationDefaults(sources: any[], templateName: string) {
  const first = sources[0];
  if (!first) return null;
  const teaching = sources.some((s) =>
    /教案|教学|课程|课时|学习目标|教材/.test(s.title),
  );
  const policy = sources.some((s) =>
    /政策|通知|招生|中考|高考|录取|报名/.test(s.title),
  );
  const domain = teaching ? "teaching" : policy ? "policy" : "general";
  const scope = {
    ...first.scope,
    domain,
    ...(domain !== "policy"
      ? {
          region: "不限地区",
          district: "",
          stage: "综合",
          audience: domain === "teaching" ? "教师与学习者" : "相关读者",
        }
      : {}),
  };
  return {
    title: (first.title + " · " + templateName).slice(0, 200),
    scope,
    evidenceRefs: sources.map((s) => ({
      snapshotId: s.id,
      field: "title/scope",
    })),
  };
}
