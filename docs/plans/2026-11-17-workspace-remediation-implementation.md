# EcuStudio 输入、处理、输出整改 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> 上行是 writing-plans 模板的执行约定。本项目当前为 Codex 工作区，按下列依赖顺序实施；不要求另建会话或启用并行代理。本文是实施方案，不是本轮执行记录。

**Goal:** 修复资料误识别与 Agent 执行阻断，并把资料输入、知识整理、多格式创作整合成可追溯、可恢复的连续流程。

**Architecture:** 复用 Fastify/SQLite 作业、账号、资产、内容版本及导出器；在其上增加统一摄取与分片、页面证据、知识文档、创作编排的适配层。先做0.8.4可靠性补丁，再按0.9.0与0.9.1增量迁移，旧接口和旧资料通过适配器兼容。

**Tech Stack:** 现有 TypeScript、React、Fastify、node:sqlite、PDF.js、平台OCR、DeepSeek、marked、sanitize-html、Playwright、PptxGenJS、docx、FFmpeg。富文本拟用Tiptap开源核心及所需扩展，固定验证后的版本；本次不安装依赖。PDF分片先比较页图像方案与可保留文本层的拆页库，再锁定依赖，禁止自行拼接PDF字节。

---

日期：2026-11-17。关联产品方案：`D:/EduStudio/app/docs/plans/2026-11-17-workspace-remediation-design.md`。

## 0. 执行规则与范围

- 工作目录为 `D:/EduStudio/app`。下文文件路径均相对于该目录，新增文件仅为计划；执行前确认名称未被其他工作占用。
- 当前版本0.8.3；用户故障截图0.8.2。尚无失败原文件、公众号URL、当时任务的脱敏日志。协议兼容缺陷可静态确认，真实故障根因须另作复现记录。
- 计划结束不启动开发、不修改生产数据库、不发布更新。执行阶段先建立数据库与代码快照；当前目录无Git时不强行初始化，也不写无法执行的提交命令。
- 每个Task按“必要失败用例→复现→最小实现→定向检查→记录改动”推进。代码已有覆盖时扩展现有测试；纯文案/可逆布局用浏览器验证，不写复制实现的单元测试。
- 下列测试路径/命令包含拟新增文件，实施后才存在；本文不声称这些检查已运行。
- 新表迁移、资产访问和任务执行均复用三角色授权；部署使用原签名更新通道，保留数据及凭据。

## 1. 核心数据契约

### 1.1 原件、证据与知识文档

```ts
type SourceIdentity = {
  assetId: string; sha256: string; bytes: number;
  ownerId: string; originalName: string; mime: string;
  originalUrl?: string; fetchedAt?: string; pageCount?: number;
};
type EvidenceBlock = {
  id: string; extractionRevision: number;
  sourceAssetId: string; sourceHash: string;
  page?: number; domAnchor?: string;
  bbox?: [number, number, number, number]; // normalized 0..1000
  kind: 'text'|'table'|'image'|'chart';
  text: string; imageAssetId?: string;
  method: 'text-layer'|'native-ocr'|'cloud-ocr'|'vision'|'manual';
  status: 'extracted'|'needs-review'|'confirmed';
  warnings: string[];
};
type KnowledgeDocument = {
  id: string; revision: number; ownerId: string;
  visibility: 'private'|'shared';
  title: string; documentJson: unknown; schemaVersion: 1;
  legacyMarkdown?: string; plainText: string;
  folderId?: string; tags: string[]; purposes: string[];
  state: 'inbox'|'organized'|'needs-review'|'archived';
  sourceRefs: Array<{sourceAssetId: string; extractionRevision: number;
    blockIds: string[]; kind: 'quote'|'analysis'|'user-writing'}>;
};
```

`extracted`只代表识别完成，不等同人工事实核实。`confirmed`需要记录确认人、时间与原证据版本。不要把全部历史笔记转换成“可信原文”。来源字段由服务器授权资产生成，不能相信客户端自报ownerId/sha256。

### 1.2 分片任务

```ts
type ProcessingPart = {
  id: string; jobId: string; sourceHash: string;
  originalPageStart: number; originalPageEnd: number;
  region?: [number, number, number, number]; partHash: string;
  engine: string; engineVersion: string; purpose: string;
  parameterHash: string;
  state: 'queued'|'running'|'succeeded'|'failed'|'unknown'|'cancelled';
  attempts: number; resultAssetId?: string; remoteFileId?: string;
  errorCode?: string; startedAt?: string; finishedAt?: string;
};
```

缓存与复用键包含授权范围、sourceHash、页区间、区域、参数、引擎/版本。相同文件名不可命中缓存。终态不完整时返回 coverage（总页数、成功页、失败页、未处理页），只有覆盖完整且通过结构验证才允许称“全文已识别”。断网后远端是否执行未知，记录unknown，不假定请求没有发生。

### 1.3 创作任务

计划状态为 `ready | needs-material | needs-clarification`。ready才要求有可用材料；创意草稿路径显式有 `evidenceMode: 'creative'`，事实型为`grounded`。`sourceRefs`冻结资产/笔记修订号；`outputSpecs`记录格式、篇幅、版式与媒介选项。步骤结果采用已有jobs.checkpoint并扩展，不另建互不关联的后台队列。

来源链：资产 → 识别修订/证据块 → 笔记修订 → claim/母稿版本 → 内容版本 → visual版本 → artifact。原文更新产生新修订并标记依赖失效，不覆盖旧结果。

## Task 1：增加可定位的模型错误与兼容请求构造（F03 / P0）

**Files**
- Modify: `server/deepseek.ts`, `server/workflow-agent.ts`, `server/tasks.ts`
- Create: `server/model-request.ts`
- Test: `tests/deepseek-upgrade.test.ts`, `tests/workflows.test.ts`

1. 添加失败用例：thinking enabled + named tool；400不同错误param；工具历史reasoning为空字符串；敏感错误消息包含伪造密钥。
2. 运行 `npx tsx --test tests/deepseek-upgrade.test.ts tests/workflows.test.ts`，确认新约束在修改前失败。
3. 新建统一构造器。必须技能由宿主预装为system上下文，附版本/哈希；仍保留按需read_skill，工具选择auto，最后结果收敛为JSON。不要在Chat Completions历史中伪造模型未返回过的tool_calls。
4. 在发送前拒绝不合法请求；兼容旧强制调用场景时仅该轮关闭thinking。参考约束：

```ts
export function validateToolMode(request: any) {
  const forced = request.tool_choice === 'required' ||
    (request.tool_choice && typeof request.tool_choice === 'object');
  if (request.thinking?.type === 'enabled' && forced) {
    throw Object.assign(new Error('当前步骤需要调整工具调用方式'),
      { code: 'INCOMPATIBLE_TOOL_MODE' });
  }
}
```

5. 保存安全诊断 `{jobId,step,model,thinkingMode,httpStatus,providerCode,param,requestId}`。仅白名单字段进入UI；原错误内容脱敏、截断后留管理员诊断，禁止写密钥/全文/完整prompt。
6. 复跑定向检查。执行阶段再做最小真实协议矩阵：Flash/Pro、思考关/开、技能读取与最终JSON。记下实际model与requestId，不能用mock验证声称远端成功。

**Done:** 不产生思考+强制工具的请求；真实规划成功；400给出具体可恢复阶段，已存在正确历史回传不回退。

## Task 2：修正无材料与无关材料兜底（F03 / P0）

**Files**
- Modify: `shared/workflows.ts`, `server/workflows.ts`, `web/WorkflowStudio.tsx`, `server/workflow-agent.ts`
- Test: `tests/workflows.test.ts`

1. 覆盖选择1份材料、不选但有匹配、知识库为空、只有无关资料四种状态。
2. 删除runPlan“没有相关材料选最接近”提示；WorkflowPlan使用状态区分资料缺失与可执行计划。
3. `freezePlan`只冻结用户指定资料或权限内检索候选，不直接把最新150份当默认授权的模型上下文。检索结果只先发必要元信息，再按需读授权全文。
4. needs-material的页面可直接上传、选笔记或触发已允许的联网补充，保留原任务要求；不创建空项目或标记failed。
5. grounded没有相关证据时禁止执行事实生成；creative需明确草稿属性与缺证据提示，不能自动套政策事实模板。
6. 运行 `npx tsx --test tests/workflows.test.ts`；真实矩阵与Task1合并，不重复发相同收费请求。

**Done:** 无资料不再只能报错；不相关资料不被默认选中；用户能在同一任务继续补料。

## Task 3：原件预览、身份绑定与错文阻断（F06 / P0）

**Files**
- Modify: `server/media.ts`, `server/media-access.ts`, `web/MediaStudio.tsx`, `server/domain.ts`
- Create: `server/document-quality.ts`, `web/SourceComparison.tsx`
- Test: `tests/document-integrity.test.ts`, `tests/media.test.ts`, `tests/media.e2e.ts`

1. 建立合成夹具：同名教育/无人机PDF、文字层与可见页不一致PDF、两个任务乱序返回。原学生文件仅在获准后留本地私有测试目录。
2. `npx tsx --test tests/document-integrity.test.ts tests/media.test.ts`复现跨任务覆盖/一致性检查缺失。
3. 上传即显示页缩略图、名称/页数；提交冻结源hash与参数，处理读取时维持已有hash校验。结果返回同一身份，UI仅接收当前jobId；切换任务时abort或忽略旧响应。
4. Files上传后校验返回名称/bytes/purpose并记录file_id映射；不把元信息相同当成远端内容正确。添加逐页证据层与原图比对入口。
5. deterministic检查引用是否存在、页码合法、数字能否定位；模型解释与直接摘录分层。语义跑题检查只能标warning/needs-review，不能自行纠正原文。
6. 不一致结果允许“保存待复核笔记”，阻止作为原文/已核验事实直接入库；历史结果修复创建新版本，展示受影响引用。
7. `npx tsx tests/media.e2e.ts`验证原件对照、任务切换和失败保留；原教学PDF拿到后补一次本机原页与结果人工对照。

**Done:** 无来源的无人机内容不会自动成为教学材料事实；保留原错误结果供定位，不靠文件名约束模型掩盖问题。

## Task 4：先恢复阅读体验与格式布局（F04/F08 / P1）

**Files**
- Modify: `web/Answer.tsx`, `web/MediaStudio.tsx`, `web/workspace.tsx`, `web/Production.tsx`, `web/workspace.css`, `web/media.css`
- Create: `web/DocumentReader.tsx`
- Test: `tests/content-reading.e2e.ts`

1. 复用Answer的安全渲染，统一媒体/笔记默认阅读视图；编辑与Markdown源码为显式模式。已有AI探索渲染不重复改造。
2. 保留h1/h2/h3语义；长表横向局部滚动，图片只取有权限的资产URL；链接安全协议验证，禁用原始脚本HTML。
3. 输出格式改为grid卡片，`minmax(0,1fr)`、固定复选框、足够标签宽度；小侧栏单列。200%缩放不能遮住选项。
4. 只跑一次 `npx tsx tests/content-reading.e2e.ts`：桌面1440、平板768、手机390，两主题；旧笔记、长标题、表格与输出选项；发生布局失败才增加针对性检查。

**Done:** 默认页不出现Markdown标题符号/表格源码；点击编辑保留原内容；右侧选项可读可点。

## Task 5：统一资料摄取与页面证据（F01/F02 / P1）

**Files**
- Modify: `server/domain.ts`, `server/ocr.ts`, `server/media.ts`, `server/app.ts`, `server/security.ts`, `server/db.ts`
- Create: `server/ingestion.ts`, `server/ingestion-web.ts`, `server/document-layout.ts`, `shared/documents.ts`, `migrations/005_documents.sql`
- Test: `tests/ingestion.test.ts`, `tests/ocr.test.ts`

1. 添加HTML文字+表格+data-src长图、PDF文本+图表、矢量图、扫描页夹具，断言阅读顺序、图片和引用区域保存。
2. 引入sources/extractions/evidence_blocks/knowledge_links等新增表；旧snapshots保留id，通过适配器映射，事务迁移失败回滚。
3. ingestion输入可为URL/asset/text/note-revision；统一身份、所有者、权限、状态、数据流向。`domain.extract`等旧入口委托新管线，返回旧字段兼容。
4. 网页提取保留结构，公众号适配后验证不是验证页；所有图片HTTP同样调用安全获取器。浏览器后备须过滤主请求、子资源、iframe、重定向、下载/localhost访问；具备等效网络边界后才能启用。
5. PDF布局分析同时考虑文字、位图和矢量内容；智能模式按区域使用文本层、OCR或图文解析，所有证据有来源页。把OCR能力检查延迟到确实需要本机识别时。
6. 云端未授权时不得自动上传；本机可识别部分标明覆盖能力，缺少图像理解保留可见提醒。
7. `npx tsx --test tests/ingestion.test.ts tests/ocr.test.ts`，然后真实一个可公开获取公众号和一个混排PDF，不把平台阻断算成功。

**Done:** 普通用户选“智能识别”即可获得正文+图像证据；可继续用原导入入口；受限链接可恢复。

## Task 6：大文件流式上传、分片、续跑（F07 / P1）

**Files**
- Modify: `server/app.ts`, `server/media.ts`, `server/media-provider.ts`, `server/tasks.ts`, `server/ocr.ts`, `web/MediaStudio.tsx`
- Create: `server/document-parts.ts`, `server/uploads.ts`, `migrations/006_processing_parts.sql`
- Test: `tests/document-parts.test.ts`, `tests/document-parts.e2e.ts`

1. 夹具覆盖31/120页、超过50MB、单页超预算、部分页length、HTTP200里error、429/413/504、取消及服务重启。
2. 新上传端点流式落盘计算hash，校验mime、配额、空文件及未完成上传；设置管理员可配置的原件上限，建议初始500MiB/2000页并先做内存/磁盘验证，不声称无限大文件。
3. 拆页库选型用一份含中文字体、表格与旋转页PDF验证保留能力；无法保留文本层时转页图识别，标明方法。切片不重写原件。
4. 调度策略：先按10页/20MiB切；并发默认2；失败片遇413/504逐半缩小至单页，再区域切；429退避；401/402立即停止；每片重试有界。
5. 成功页保存证据/usage/原始响应资产；失败不丢已完成页。重启后只调度未完成片，先核查unknown片可否查回远端结果，避免重复上传成本。
6. 合并按originalPage顺序；单页分区先去重重叠内容再排版；分页摘要再合成总览，不能把所有原文重新塞入一次模型请求。
7. `npx tsx --test tests/document-parts.test.ts`与 `npx tsx tests/document-parts.e2e.ts`；一个真实长PDF覆盖拆分、失败恢复和逐页核对，保留使用量记录。

**Done:** 正常支持范围内用户无须手动拆分；清楚展示缺页；成功页不重复处理；资源受控。

## Task 7：知识库分类、富文本编辑与旧笔记兼容（R01/F04）

**Files**
- Modify: `web/workspace.tsx`, `web/Answer.tsx`, `server/app.ts`, `server/explore.ts`, `server/native-explore.ts`, `server/auth.ts`, `server/db.ts`, `package.json`, `package-lock.json`
- Create: `web/KnowledgeLibrary.tsx`, `web/DocumentEditor.tsx`, `server/knowledge.ts`, `shared/document-content.ts`, `migrations/007_knowledge.sql`
- Test: `tests/knowledge.test.ts`, `tests/document-editor.e2e.ts`

1. 对旧Markdown笔记、来源、修订号、私人/共享权限建回归夹具。
2. Tiptap开源核心+表格/图片/链接适配器先跑中文IME、Safari、粘贴、撤销、超长正文小验证；依赖锁定后接入现有主题。无需Tiptap云服务与其AI服务。
3. 统一JSON文档；旧body留存，读取时适配；首次编辑再产生JSON新版本。不支持块保留原文节点，不能丢弃。
4. 自动保存使用expectedRevision与防抖；IME组合过程中不提交截断文本；冲突留两版。导出/全文搜索由同一JSON派生，不能分别编辑HTML和Markdown两份主数据。
5. 新增文件夹、标签、用途、收件箱、批量移动与撤销。检索先过滤ACL再排序；图片、页图、笔记/任务/导出都检查所有者。
6. “作为上下文/用于创作”传ID+revision，不传伪造scope；私有笔记转共享需要明确可见范围，保持已有业务员只读边界。
7. `npx tsx --test tests/knowledge.test.ts tests/accounts-explore.test.ts`；`npx tsx tests/document-editor.e2e.ts`。

**Done:** 无须懂Markdown即可读写；旧内容无损；分类可用；不会泄漏私人笔记。

官方依据：[Tiptap 概览](https://tiptap.dev/docs/editor/getting-started/overview)、[JSON/HTML内容存取](https://tiptap.dev/docs/guides/output-json-html)。本计划只选用需要的开源扩展，版本历史继续用本地数据库。

## Task 8：统一创作编排与资料自动填充（F05/R01）

**Files**
- Modify: `server/production.ts`, `server/workflows.ts`, `server/agent.ts`, `shared/schema.ts`, `shared/production.ts`, `shared/workflows.ts`, `web/Production.tsx`, `web/WorkflowStudio.tsx`, `web/main.tsx`
- Create: `server/creation.ts`, `shared/creation.ts`, `web/CreationCenter.tsx`
- Test: `tests/creation.test.ts`, `tests/creation.e2e.ts`

1. 明确当前自动链作为底座；两个旧API委托creation服务。旧生产任务/检查点使用适配器续跑，新任务schemaVersion区分。
2. 建立 `prepare → research → master → variants → review → render → package` 阶段契约，每步有输入revision、结果引用与幂等key；输出重试不重新抽取事实。
3. 用户选知识库记录自动解析sourceRefs。领域区分policy/teaching/general：旧政策Scope原样保留，教学新增年级/学科/目标等可选字段；不能全局给旧政策数据抹掉年度地区约束。
4. 结构建议返回fields+value+evidenceRefs+origin(extracted/suggested/user)；缺失显示待补充，禁止编造考试时间、学习目标已来自原文等。
5. 用户只需挑材料、目标、格式；默认自动初稿，事实/母稿可展开复核；局部改稿保护锁定块和稳定ID。
6. 统一成果状态到每种格式。GIF/视频已被明确请求且文案满足当前审核要求时，接入已有渲染器；否则显示待确认/待渲染，并允许继续，禁止把母版算成成片。
7. `npx tsx --test tests/creation.test.ts tests/visual-unified.test.ts`；一个真实教学样本跑到可编辑PPT与讲义，另一个政策样本跑到公众号稿与有声视频。失败只重试相关阶段。

**Done:** 主要模板自动填正文；无需先手动提取事实再跳母稿页；不同入口产物、来源与状态一致。

## Task 9：导航与跨页连续操作（R01）

**Files**
- Modify: `web/main.tsx`, `web/workspace.tsx`, `web/compat.ts`, `web/style.css`, `web/themes.css`
- Create: `web/InputCenter.tsx`, `web/navigation.ts`
- Test: `tests/workspace-navigation.e2e.ts`

1. 按产品方案增加输入/处理/输出分组，保留老hash路由到新页面的映射；已有收藏链接仍指向原任务/笔记。
2. 统一跨页ContextRef与返回位置；上传→笔记→对话→创作使用同一资料ID，不依赖多个sessionStorage字符串互相覆盖。
3. 首页按用户角色显示继续任务、待复核与成果；销售隐藏创建入口并维持后端403。
4. 手机主导航/原文对照/长表格/输出网格按390/768/1440及200%缩放验证，书院/曜石各跑一次。
5. `npx tsx tests/workspace-navigation.e2e.ts`，验证老链接、刷新、浏览器后退与跨页编辑未保存提醒。

**Done:** 一份素材无需反复复制、重新选取或重新上传；桌面/手机都能完成主要路径。

## Task 10：公众号编辑与内容出口（新增输出能力）

**Files**
- Modify: `server/render.ts`, `server/exports.ts`, `server/production.ts`, `web/main.tsx`
- Create: `web/WechatEditor.tsx`, `server/wechat-export.ts`
- Test: `tests/wechat-export.test.ts`, `tests/wechat-editor.e2e.ts`

1. 先盘点可用旧项目代码、许可证、依赖与素材权利；没有找到前按现有渲染器扩展，不依赖当前Codex会话的公众号连接器。
2. 同一文档JSON映射公众号可用的内联样式；本地图片绑定真实assetId，预览与导出一致；复制提供text/html+text/plain。
3. 建立封面、摘要、图文编辑、手机预览、导出；非支持布局转换为保守样式并提示，不丢正文。
4. `npx tsx --test tests/wechat-export.test.ts`及 `npx tsx tests/wechat-editor.e2e.ts`；实际粘贴到用户有权使用的公众号草稿页观察样式，不自动发布。
5. 公众号授权和保存远端草稿为后续独立适配：确定凭据管理、素材上传、账号权限、状态查询和失败补偿之后接入。

**Done:** 首期本地排版、预览和复制/导出完整；没有公众号凭据也能用。

## Task 11：自动任务、来源变化与成果库（R01）

**Files**
- Modify: `server/tasks.ts`, `server/source-review.ts`, `server/workflows.ts`, `web/WorkflowStudio.tsx`, `web/main.tsx`
- Create: `web/ArtifactLibrary.tsx`, `tests/automation-pipeline.test.ts`

1. 定时抓取复用ingestion，新增资料进知识库；日报引用实际成功来源，保留失败来源、覆盖时窗和缺失说明。
2. 原件重新识别/政策更新沿依赖链找受影响内容；知识笔记和成果均有待复核状态，旧文件不自动替换。
3. 成果库按项目、格式、版本、来源状态筛选，预览/下载/再编辑/整包沿用现有资产；清楚区分草稿、待渲染、已导出。
4. `npx tsx --test tests/automation-pipeline.test.ts tests/workflows.test.ts`，覆盖失败来源不造日报、重复执行不重复导入、销售只能看已授权成果。

**Done:** 自动任务是共用流程的定时运行，日报和成果可查真实依据与执行记录。

## Task 12：迁移、发布与定向验收

**Files**
- Modify: `server/db.ts`, `server/updates.ts`, `scripts/package-online.py`, `scripts/package-macos.py`, `deployment/详细使用指南.md`, `deployment/macos/Mac安装与使用指南.md`
- Create per release: `docs/releases/<version>.json`, `tests/online-update-v084.e2e.mjs`等对应版本测试与脱敏验收报告

1. 发布前运行 `npm run check`、`npm run build`及各阶段受影响测试；禁止对原生产库跑夹具初始化。
2. 从真实旧包复制隔离安装，记录原账号密码验证结果、原记录/配置/密钥文件hash，再走页面在线升级与重启；新增表事务迁移，旧标识不变。
3. 重构阶段在任务空闲后升级，正在执行旧任务先完成/保存检查点；恢复逻辑识别schemaVersion。回滚不得丢掉升级后新写入资料，必要时导出新增记录再恢复备份。
4. Win本机与Mac本机分别验证文件预览、OCR/Keychain、Safari富文本、升级。无Mac实机则明确标“待原生验证”，不能据Windows测试宣布两端通过。
5. 包不含业务库、私人文档、密钥、诊断原文与临时片段；公共下载校验与签名通过后才更新stable feed。
6. 发布说明同步产品截图、入口名称和能力矩阵；更新已过时的部署产品说明，不能让“已支持视频”和旧文档“无视频”同时出现。

**Done:** 每阶段有真实场景结果、明确限制与可恢复升级；无数据/凭据丢失。

## 2. 最小验收矩阵与依赖

依赖：Task1→2；Task3阻断错文；Task4可独立发布；Task5→6→7；Task1/2/3/5/7→8；Task7/8→9；Task7/8→10；Task5/8→11；每阶段经过Task12。

| 类别 | 样本/动作 | 验证重点 |
|---|---|---|
| 协议 | 指定技能+开关思考+Flash/Pro | 合法payload、历史回传、JSON、脱敏错误 |
| 文档 | 原教学PDF；混排、扫描、错文本层、同名不同内容 | 原件对应、关键页、数字和图表、无跨任务污染 |
| 自动拆分 | 超30页/50MB、单页巨图、半途失败、重启 | 上传受控、页数/顺序、续跑幂等、无伪完整结果 |
| 网页 | 公众号正常图文/长图/验证页、动态页 | 正文与图保留、受限原因、恢复方式 |
| 内容 | 旧Markdown→富文本→保存→导出 | 内容不丢、引用可点、输入法与撤销、冲突保护 |
| 端到端 | 资料→笔记→对话→教学PPT/讲义/公众号稿/有声视频 | 不重复填写、可编辑与可播放、来源与实际产物一致 |
| 权限/升级 | 三角色、旧包在线升、Mac与Windows | 不越权、不公开私密资料、不重置凭据 |

原学生PDF/URL尚缺时，先用合成夹具修机制，验收表明确留待真实样本回归；不能把“测试夹具通过”写成“学生问题复现并解决”。

## 3. 实施前待补充信息

只在需要真实回归时补充：原PDF资产、失败URL、任务ID与模型/思考配置、脱敏provider错误。接口参数和初始分片阈值由上述方案决定，普通用户无须理解技术设置。每个阶段范围已经足够明确，可按依赖顺序落地，不需要逐个按钮反复确认。
