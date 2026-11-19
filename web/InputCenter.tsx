import React from "react";
import { InputForm } from "./InputForm";
export function InputCenter({ go, setModal }: any) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>导入资料</h1>
          <p>文字和识别后的笔记可保存到个人知识库；公开网址导入原始资料库。</p>
        </div>
      </div>
      <InputForm go={go} />
      <details className="panel lower material-tools">
        <summary>更多导入方式</summary>
        <div className="button-row">
          <button
            className="btn secondary"
            onClick={() =>
              setModal({ type: "import", title: "导入团队研究资料" })
            }
          >
            导入团队研究资料并填写来源
          </button>
          <button className="btn secondary" onClick={() => go("media")}>
            选择识别方式或校正转写
          </button>
        </div>
      </details>
    </>
  );
}
