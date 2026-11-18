# EcuStudio 接手提示词

复制下段到新的开发聊天：

```text
请接手 EcuStudio 教创工作台，实际检查、开发并验证。公开仓库是 https://github.com/shynloc/ecustduio-stu，拼写保留 ecustduio-stu。

先寻找并复用已有工作副本，检查适用的 AGENTS.md、当前分支、工作区、远端 main 和 Actions。保留他人的改动；干净工作区用 git pull --ff-only 同步。没有副本时再克隆。按 README.md、HANDOFF.md、docs/DEVELOPMENT_DIRECTION.md 和当前代码接手。Mac 启动入口为 bash Dev.command，已有开发服务先复用，端口冲突使用文档中的替代端口。

主线是让普通用户在同一场 AI 创作对话中从需求、资料走到成稿、附件与后续改版。现有 #explore 已能交付 PPTX、DOCX、PDF、Markdown、HTML，旧回答可本地转格式；笔记本、共享素材、任务恢复和公众号排版已有实现。优先执行我这一轮指定的目标。若没有另行指定，先做开发方向第 1 包：用合成课程材料一次索取教师 PPT 和学生 Word 活动单，续写修改，检查附件内容、引用、刷新恢复和跨账号隔离。依据实际失败集中修复并回归。缺真实模型账户时，继续做能独立验证的文件质量和恢复工作，单列真实验收。

开发只使用仓库内 .local-data 和隔离测试数据。真实凭据由我在设置页填写。不得读取或输出真实密钥、钥匙串条目、生产数据库或更新签名私钥。保留服务端权限、共享确认、来源链、幂等和历史成果。公众号写入、发布安装包、签名或修改线上更新源须有单独授权。

按改动运行 npm run check、npm run build、npm run test:core、npm run test:dev、npm run test:ui，浏览器测试在构建后运行。区分模型协议夹具、真实本地生成的文件和外部服务实测。交付时列出分支与提交、实际访问地址、可复现的结果、剩余事项，并更新 HANDOFF.md。
```
