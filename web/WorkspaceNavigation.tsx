import React from "react";
import {
  Activity,
  Files,
  FolderOpen,
  LayoutDashboard,
  Library,
  MessageSquare,
  NotebookPen,
  PencilLine,
  Settings,
} from "lucide-react";

const destinations = [
  ["dashboard", "工作台", LayoutDashboard],
  ["policies", "资料库", Library],
  ["notes", "笔记本", NotebookPen],
  ["explore", "AI 创作对话", MessageSquare],
  ["library", "内容创作", PencilLine],
  ["projects", "项目", FolderOpen],
  ["results", "成果库", Files],
  ["tasks", "任务中心", Activity],
  ["settings", "设置", Settings],
] as const;

const sections: Record<string, readonly [string, string, ...string[]][]> = {
  policies: [
    ["policies", "团队原文", "snapshot"],
    ["input", "导入资料"],
    ["media", "识别与转写"],
    ["impacts", "更新与影响"],
    ["reports", "监测日报", "report"],
  ],
  library: [
    ["library", "使用模板", "make"],
    ["steward", "描述需求"],
    ["deliver", "从素材制作", "visual"],
    ["wechat", "公众号编辑器"],
    ["speech", "文字配音"],
  ],
  projects: [
    ["projects", "项目列表", "project"],
    ["topics", "选题池"],
  ],
  settings: [
    ["settings", "工作台设置"],
    ["accounts", "成员与权限"],
  ],
};

export function workspaceNavigation(page: string, role?: string) {
  const sales = role === "sales";
  const items = destinations.filter(
    ([id]) => !sales || id === "policies" || id === "results",
  );
  const group = Object.keys(sections).find((key) =>
    sections[key].some(
      ([id, , ...aliases]) => page === id || aliases.includes(page),
    ),
  );
  const active =
    sales && page === "report"
      ? "results"
      : page === "job"
        ? "tasks"
        : group || page;
  const name = (id: string, label: string) =>
    sales ? (id === "policies" ? "政策资料" : "可用成果") : label;
  const parent = items.find(([id]) => id === active);
  const tabs = sales
    ? []
    : (sections[active] || []).filter(
        ([id]) => id !== "accounts" || role === "admin",
      );
  return {
    items,
    active,
    name,
    label: parent ? name(parent[0], parent[1]) : "",
    tabs,
  };
}

type Navigation = ReturnType<typeof workspaceNavigation>;
function linkClick(
  event: React.MouseEvent<HTMLAnchorElement>,
  id: string,
  go: (id: string) => void,
) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  go(id);
}

export function WorkspaceLinks({
  nav,
  go,
  activeJobs,
  failedJobs,
}: {
  nav: Navigation;
  go: (id: string) => void;
  activeJobs: number;
  failedJobs: number;
}) {
  return (
    <nav aria-label="主导航" className="workspace-links">
      {nav.items.map(([id, label, Icon]) => (
        <a
          key={id}
          href={"#" + id}
          onClick={(e) => linkClick(e, id, go)}
          className={nav.active === id ? "active" : ""}
          aria-current={nav.active === id ? "page" : undefined}
          data-utility={id === "tasks" || undefined}
        >
          <Icon size={19} aria-hidden="true" />
          <span>{nav.name(id, label)}</span>
          {id === "tasks" && (activeJobs > 0 || failedJobs > 0) && (
            <small
              className="task-count"
              aria-label={activeJobs + " 项进行中，" + failedJobs + " 项失败"}
              title={activeJobs + " 项进行中，" + failedJobs + " 项失败"}
            >
              {activeJobs + failedJobs}
            </small>
          )}
        </a>
      ))}
    </nav>
  );
}

export function SectionLinks({
  nav,
  page,
  go,
}: {
  nav: Navigation;
  page: string;
  go: (id: string) => void;
}) {
  if (nav.tabs.length < 2) return null;
  return (
    <nav className="section-links" aria-label={nav.label + "栏目"}>
      {nav.tabs.map(([id, label, ...aliases]) => {
        const selected = id === page || aliases.includes(page);
        return (
          <a
            key={id}
            href={"#" + id}
            className={selected ? "active" : ""}
            aria-current={selected ? "page" : undefined}
            onClick={(e) => linkClick(e, id, go)}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
