import React from "react";
import * as Icons from "lucide-react";
import { creationActions } from "../../shared/actions";
export function CreationLauncher({ go, data }: any) {
  return (
    <section className="creation-launcher">
      <div className="creation-intro">
        <h2>你想做出什么？</h2>
        <p>
          选择一个成品类型，再放入资料。标题、受众和结构会根据资料自动建议。
        </p>
      </div>
      <div className="creation-grid">
        {creationActions.map((a) => {
          const Icon = (Icons as any)[a.icon] || Icons.FileText;
          return (
            <button
              key={a.id}
              className={"creation-card creation-" + a.id}
              onClick={() =>
                go(
                  a.route === "explore"
                    ? "explore?task=" + a.id
                    : a.route === "deliver"
                      ? "deliver?format=" + a.formats[0]
                      : a.route,
                )
              }
            >
              <div className="creation-card-sample">
                <Icon size={32} />
                <span>{a.formats.join(" · ").toUpperCase()}</span>
              </div>
              <h3>{a.label}</h3>
              <p>{a.description}</p>
              <span className="creation-card-start">
                开始制作 <Icons.ArrowUpRight size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
