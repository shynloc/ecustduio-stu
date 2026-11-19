export const productionTemplates = [
  {
    id: "policy",
    name: "报告与解读",
    description: "从原文提取候选事实，形成母稿与政策解读，直接制作研究文档。",
    prompt:
      "核对适用地区、年度、学段和条件，保留准确引文，区分确定事项和待核实项。",
    formats: ["docx", "pdf", "md"],
  },
  {
    id: "speech",
    name: "演讲与口播稿",
    description: "基于资料生成母稿与口播稿，控制时长，保留条件与事实引用。",
    prompt:
      "面向所选资料和用户指定的读者，专业亲切，以一个明确主题展开，口语自然，保留条件、例外与待核实提示。",
    formats: ["docx", "md"],
  },
  {
    id: "wechat",
    name: "公众号图文",
    description: "生成标题、摘要、正文及配图建议，制作可下载文档。",
    prompt:
      "写一篇面向目标读者的公众号文章，回答读者的实际问题，层次清楚，附配图建议和来源。",
    formats: ["docx", "html", "md"],
  },
  {
    id: "presentation",
    name: "演示 PPT",
    description: "从研究、母稿到可编辑 PPTX，附讲者备注与引用，共用设计生成网页和演示 PDF。",
    prompt:
      "根据资料与用户目标制作教学或分享演示，逐页安排主题、要点和讲者备注，保持事实、条件与来源一致。",
    formats: ["pptx", "docx", "pdf", "html", "md"],
  },
  {
    id: "storyboard",
    name: "视频脚本",
    description: "生成角色一致的文字分镜、台词和画面提示，制作分镜文档。",
    prompt:
      "生成文字分镜方案，包含台词、场景、景别、运镜、连续性和画面提示词，时长合计符合目标。",
    formats: ["docx", "json", "md"],
  },
] as const;
