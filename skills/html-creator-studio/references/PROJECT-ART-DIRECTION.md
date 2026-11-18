# Project Art Direction｜同一审美，多种作品

每个新项目按 `设计内核（长期） × 本次内容（临时） × 用户用途/受众 × 设备/性能` 创作。不要把长期 Design DNA 等同于固定色板或 CSS 模板。

## 设计取舍

1. 读取 `design-profile.json` 的用户已确认信号；`INFERRED` 仅可作为**标记清楚的候选**，不可当成品牌硬约束。
2. 读取本项目文档、受众、事实来源与隐私范围。根据内容判断主视觉（照片、图表、年表、故事、3D/运动）的合理性；不得为了炫技牺牲信息。
3. 写 `project-art-direction.json`：`profile_id/revision`、`confirmed_signal_ids`、`temporary_direction`、`decisions`、`avoid`、`privacy_boundary`、`approval_state`。每个设计决策都要说明对应用户确认的偏好，或注明仅因本项目需要。
4. 提交 Quick 两套 / Studio 三套实际可打开的 HTML。差异至少出现在 **构图、字体、主体素材、交互/运动** 四项中的三项，不能把换色看成不同提案。
5. 视觉意见和观众文案意见分别记录。用户只批准了视觉，不能自行批准标题、经历、数据或部署。
6. 对同一个用户的简历、摄影作品集、汽车项目，允许完全不同的临时艺术指导，只要能解释哪些稳定审美规则得到了保留。

## 实际生成与验证

`python scripts/project_art_direction.py --profile <design-profile.json> --brief <project-brief.json> --out <new-art-direction.json>`

此工具只构造可审计的项目艺术指导合约，不调用模型或自动生成高水平创意。真正的 HTML 视觉方案由支持本 Skill 的 Agent 生成，并用 `references/VISUAL-PITCH.md` 与 `references/VISUAL-QA.md` 检查。没有用户确认的档案只允许 `draft`/概念提案。

同文档换三个 Design DNA，须在超过配色的维度上出现实质差异；同一 Design DNA 换三个项目，须保留稳定审美约束但不复刻同一布局。由用户判定是否符合个人品味；脚本结构测试不能替代人类审美验收。

