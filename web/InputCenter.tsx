import {InputForm} from './InputForm';
import React from "react";
export function InputCenter({ go, setModal, data }: any) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">INPUT · COLLECT</span>
          <h1>资料输入</h1>
          <p>
            从网址、文件、文字或一个问题开始，识别整理后进入知识库，再用于创作。
          </p>
        </div>
      </div>
      <InputForm go={go}/>
      <div className="template-grid lower">
        {[
          [
            "网址与公开文章",
            "保留正文与配图；受限网页会说明原因。导入结果进入工作台共享资料。",
            "导入网址",
            () => setModal({ type: "import", title: "导入网址或原文" }),
          ],
          [
            "文档、图片与录音",
            "智能识别图片、扫描件及混排 PDF；长文档自动拆分，可对照原件核对。",
            "上传并识别",
            () => go("media"),
          ],
          [
            "文字与想法",
            "直接写入自己的笔记，支持标题、列表、表格，随时整理分类。",
            "新建笔记",
            () => go("notes"),
          ],
          [
            "AI 对话与搜索",
            "结合本地资料与已允许的联网检索，带来源的回答可以保存成笔记。",
            "开始探索",
            () => go("explore"),
          ],
        ].map(([title, description, button, action]: any) => (
          <section className="panel template-card" key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
            <button className="btn" onClick={action}>
              {button}
            </button>
          </section>
        ))}
      </div>
      <section className="panel lower">
        <h2>继续处理</h2>
        <p>
          当前共享资料 {data.snapshots.length}{" "}
          份。私人笔记需由你明确选择共享后，才会作为团队创作资料。
        </p>
        <div className="button-row">
          <button className="btn secondary" onClick={() => go("notes")}>
            打开知识库
          </button>
          <button className="btn secondary" onClick={() => go("policies")}>
            查看政策与共享资料
          </button>
          <button className="btn" onClick={() => go("deliver")}>
            开始制作成果
          </button>
        </div>
      </section>
    </>
  );
}
