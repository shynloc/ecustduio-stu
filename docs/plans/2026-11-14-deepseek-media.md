# 0.4.0 文件、图像和语音流程

用户要求：接入 DeepSeek 文件解析、图像理解及语音功能，打通创作流程，更新 Windows/macOS 安装包并上传文件站。沿用优先交付、必要验证的偏好。

入口：文件与语音。任务类型：文档解析（Files API text/rich）、云端 OCR、图像理解、录音转写、文字配音。模型分析使用 Flash；沿用现有凭据和调用授权。

流程：上传本机暂存 → 显式开始云端处理 → 校正结果 → 私有创作笔记 / AI探索上下文 / 共享创作素材 → 现有事实提取、母稿、一键制作。保存的版本、笔记和探索回答可直接进入配音，提供 WAV 试听和下载。

语音：浏览器把可解码 MP3/M4A/WAV/录音转换为16kHz单声道16位PCM WAV，最长20分钟；服务端按110秒分段转写，保留时间范围和分段检查点。TTS采用官方stella/tide音色，明确10000计费字符上限，不添加API不支持的语速选项。

数据：媒体任务和暂存资产按账号隔离；业务员不可调用。导入素材为显式共享动作，保留原文件引用与AI处理来源。云端Files只使用本任务创建的文件，设置1小时有效期并在任务结束删除；取消上传时远端可能继续处理，过期兜底。

验证：协议、错误、权限、长音频分段、来源/流程/幂等测试；小型自制文件和合成语音的真实API检查；桌面/手机入口；构建、安装包清单、上传下载哈希。Mac原生运行仍需Mac实机检查。

官方依据：
- https://api-docs.deepseek.com/zh-cn/guides/files_api/
- https://api-docs.deepseek.com/zh-cn/guides/document_parsing/
- https://api-docs.deepseek.com/zh-cn/guides/vision/
- https://api-docs.deepseek.com/zh-cn/guides/ocr/
- https://api-docs.deepseek.com/zh-cn/guides/asr/
- https://api-docs.deepseek.com/zh-cn/guides/tts/
