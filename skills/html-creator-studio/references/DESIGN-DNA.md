# Personal Design DNA｜可追溯的个人审美基因（v1.8）

适用于个人、品牌及项目审美档案。**长期 Design DNA 是用户已确认的偏好约束；项目 Art Direction 仍需结合内容、目标受众、设备重新创作。** 不得把档案固定成一种配色模板。

## 核心状态

每条审美信号使用独立状态：

- `OBSERVED`：参考图中确实看见的视觉特征，或用户实际提供的原话。它只是观察，**不等于喜欢**。
- `INFERRED`：Agent 根据一项或多项观察作出的审美假设。置信度高也不能自动写入长期核心。
- `CONFIRMED`：用户明确确认了某个**具体维度的偏好**，保留确认话语及证据 ID。只有这种信号允许进入可复用的 Design Kernel。

参考素材态度是 `core / positive / partial / negative / neutral`。允许用户仅喜欢一张图片的排版、讨厌其中配色；**严禁把“喜欢图片”推导成“喜欢图片里每个属性”**。一张图的观察条目和偏好确认必须分开。

## 完整流程（先采集，再分析）

1. **Intake**：按 `references/TASTE-INTAKE.md` 收集文字、图片、穿搭、景观、汽车、网站截图等，记录每份素材的身份、局部好恶、访问方式与隐私授权。
2. **Upload Gate**：用户还在上传、素材不可访问、用户未明确说“开始分析”，停止分析。移动端不得强迫用户提供本地文件夹路径。Agent 应在用户说上传完成后核对文件数量/可读性，再等待“开始分析”。
3. **Vision Gate**：仅当实际得到像素/可理解的图像内容时，才填 `vision_state=verified` 并给出 `OBSERVED` 图像证据。文件名、缩略描述、URL 字符串、路径和占位符都不构成视觉访问。无法看图时明确说明，只做基于用户文字的初步假设。
4. **Analysis**：抽取颜色、明度/对比、形态、比例、留白、节奏、材质、摄影语言、字体气质、动效偏好和 anti-style。不要猜测人物身份、性格、财富、职业、心理状态或敏感属性。
5. **Confirmation**：把推断压缩为可选择的 2–3 个审美假设，列出来源证据，询问用户准确与否。用户明确确认具体偏好后，记录 `CONFIRMED` 和 `user_evidence`；不能代替用户点击/编造批准。
6. **Kernel**：建立 `design-profile.json`，保存可解释的确认信号、禁用项、Tokens、来源映射、版本历史。对引用媒体只保留授权且必要的描述；原图与抽象档案分离。
7. **Project Translation**：按 `references/PROJECT-ART-DIRECTION.md` 从 `Design DNA × 内容语义 × 用户/受众目标 × 设备限制` 形成本项目独立视觉指导。先做真实 HTML 方案，审核后才制作成品。
8. **Feedback**：区分 `project_only` 与 `long_term` 反馈。长期变更需用户明确确认、生成新修订并可回退；不得静默覆盖原档案。

## 文件合约

- 模板：`templates/TASTE-INTAKE.json`、`templates/DESIGN-DNA.json`、`templates/DNA-FEEDBACK.json`。
- 命令：`python scripts/design_dna.py validate --profile <file> [--production]`。
- 可携带导出：`python scripts/design_dna.py export --profile <file> --out <different-file>`，只导出确认信号与抽象 Tokens；移除原始素材索引、用户确认原话、身份规则及未经确认的推断。明显的邮件、手机号、URL、私有绝对路径会被拦截，须先在本地提炼为一般性偏好。但自动过滤**无法保证任意自由文字已经完全匿名**，所以导出文件标记 `review_before_share: true`，用户检查后才可主动分享。导出操作本身不会上传或公开文件。
- 反馈修订：`python scripts/design_dna.py revise --profile <file> --feedback <file> --out <new-file>`，仅写新文件、保存历史、清空整体已批准状态，等待用户重新确认修订版。

## 真实性与安全门禁

- 结构验证仅证明 JSON 合规，无法验证图片实际上是否被某模型看见，也无法验证审美判断真实属于该用户。分析报告必须记录实际使用的工具/模型或人工来源和测试边界。
- 用户确认审美 `G1D DNA` 与选择本次视觉提案 `G1 VISUAL`、审核面向观众的文案 `G2 COPY`、公开部署 `G6 PUBLISH` 是相互独立的决定。
- 字体、强调色、次要文字与容器表面的组合也可能产生对比度问题；生产检查会分别核查 foreground/background、foreground/surface、muted/background、accent/background 的最低可读性。漂亮的配色不能抵消阅读障碍。
- 默认本地存档与离线执行；若要把参考图、简历或私有资料发往云端视觉模型，必须先得到**针对内容和目的地的明确授权**。同意本地分析不等于同意外传。
- 参考作品只能借鉴审美原则，禁止直接复刻第三方网站、商标、独有图案、未经授权字体或私人肖像。
- 当用户没有明确偏好时，Agent 可以提供试探性的视觉候选，但必须标记为 `INFERRED`，不能写入长期内核。

