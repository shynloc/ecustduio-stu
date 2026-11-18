# DeepSeek Agent 接入

执行器 `deepseek-controlled`；工作流 `educontent-studio`，版本1.0.0。三份原始文件是需求提示词，没有找到可比较的原 WorkBuddy Skill 本体，本次新建包并登记为 `project-built`。

API 校验后冻结资料、事实、母稿、已有内容、角色、配置、Skill文件与哈希。任务入库后调用 DeepSeek 官方 Chat Completions，使用非思考模式和工具调用；服务端记录实际事件，不伪造进度。

工具只有 `read_source`、`search_materials`、`read_master`、`read_claims`，参数严格校验且只能访问冻结范围。公开采集由独立监测器负责，模型不能任意联网、执行 Shell、读数据库或发送消息。

默认上限：8轮请求、30次工具调用、600秒、100000字符上下文、8192输出token。JSON修复轮次也计入预算；空结果、截断、越界引用和错误结构明确失败。费用未知保持 null。

研究引用必须逐字存在于指定段落，所有新事实仍待核实。内容引用必须属于项目。补丁仅接受选定未锁定块的 title/text/notes；完整再生成保留锁定块。提交前写检查点，再按 revision 创建新版本；原确认不会继承。

工作流覆盖 research/master/policy/speech/wechat/presentation/storyboard/patch。角色身份、外貌、声音、造型按文本传入；参考图片保存在本机，没有声称文本模型可以看图。

Skill ZIP 只接受 Markdown，不执行脚本；导入、注册与实际运行分别记录。每次任务坚持冻结的 Skill hash。外部任务包可导出、外部内容 JSON 可导入候选。

Windows DPAPI 子进程显式使用系统安全模块路径，避免继承 PowerShell 7 模块路径导致解密失败。环境变量优先，密钥不进备份。当前只有协议与隔离测试通过；真实连接、研究和多成果内容质量需配置 DeepSeek 后验收。
