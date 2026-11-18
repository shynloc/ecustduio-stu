# DeepSeek 能力升级 · 0.3.0

目标：把新模型的思考、多轮工具、官方搜索和链接阅读真正接入已有的研究、笔记和创作流程。保留三角色、来源核验、任务预算和本机凭据存储。

## 实现选择

1. 公共调用层：思考关闭/low/high/max，Flash/Pro 预设，保留 reasoning_content；结构化创作使用 JSON Output。处理 HTTP 200 内部错误、审核拒答、截断，不将失败内容提交为成果。记录缓存、思考和工具用量，不把估算当实际账单。
2. AI 探索：默认采用 Flash 官方联网工具，用户可以改用原有工作台检索。本地资料先按当前用户权限检索，再供官方搜索整合；仅本地模式绝不声明联网工具。Pro 使用原有受控检索。支持单独阅读链接、深度搜索、官方引用、首轮标题。
3. 保存官方回复协议到服务端消息上下文，原样回传签名、工具块、思考字段；前端、笔记和任务结果只展示答案、来源、操作摘要、用量。历史检索范围切换到仅本地时不带回网络上下文。
4. 设置提供默认思考强度，探索页允许逐轮覆盖；旧任务未配置时保持非思考。默认输出预算仍 8192，可调至 65536；没有自动用满模型最大上下文。

## 本次范围

不接入语音合成、语音识别、云端文件上传或视觉聊天。本机 OCR 保持现有路径。这些需要各自的上传、存储、授权和媒体交互，不能仅添加参数就视为完成。

## 验证与交付

新增协议回归：多轮思考、JSON 修复、官方引用 Unicode 偏移、签名往返、仅本地隔离、审核/HTTP 200 错误、计费字段、笔记与权限。一次类型检查和构建；少量真实 API 验证公共资料，不重复完整付费创作链。更新 Windows/macOS 联网包并上传文件站，Mac 实机测试仍由用户端自检完成。

## 官方依据（2026-11-14）

- https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
- https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/
- https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot/
- https://api-docs.deepseek.com/zh-cn/guides/web_tools/
- https://api-docs.deepseek.com/zh-cn/guides/conversation_title/
- https://api-docs.deepseek.com/zh-cn/guides/json_mode/
