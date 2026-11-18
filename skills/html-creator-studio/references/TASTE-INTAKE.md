# Taste Intake｜把喜欢的东西翻译为审美线索

## 三种入口

1. **一句话**：用户只说需求，采用 Quick；提出最多三个关键问题或给可看样稿，不强迫填写设计术语。没有视觉参考时依赖内容驱动的临时 Art Direction。
2. **参考素材**：用户提供图片、服装、车辆、建筑、风景、网页或文字。允许一口气上传多份；用户说“上传完成”后核对实际可访问数量，再等“开始分析”。两阶段操作不能合并成模型的自作主张。
3. **偏好对比**：用户说不清喜欢什么时，提供 2–4 对实物设计差异明显的可看方案，逐项问“喜欢什么/不喜欢什么/只喜欢哪个部分”，确认具体维度。请勿用风格名字或心理画像替代真正的页面。

## 每份参考的必要信息

`id`、`kind`（image/outfit/vehicle/landscape/architecture/website/text/other）、`attitude`（core/positive/partial/negative/neutral）、`liked_aspects`、`disliked_aspects`、`source_kind`（user_text/actual_image/other）、`vision_state`（not_applicable/unverified/verified/unavailable）、`analysis_permission`、`external_transfer_permission`、`private`、`note`。

照片可有多个局部偏好；例如“喜欢车漆材质，不喜欢图片中的排版”和“喜欢卡其衣服的质感，但不要做成时装电商网站”。来源仅提供文件名而缺少图像像素时，必须标记 `unverified`，不能编造 `OBSERVED` 视觉内容。

## 结果交付

生成 `DESIGN-DNA-REVIEW.md`，至少包含：

| 信号 | 已观察证据 | 推断 | 置信度 | 用户确认 |
|---|---|---|---|---|
| 调色倾向 | 参考 01 的实际色相/用户原话 | 可能偏好低饱和暖色 | 0–1 | 待确认 |

同时给出“明确讨厌的设计”“证据相互矛盾的地方”“仍需用户确认的前三项”。不把审美预测写成事实。用户批准后才在 Profile 中记录 `CONFIRMED` 信号。

## 隐私与撤回

原始参考与 Design DNA 文件分开存储。导出默认只携带用户确认的抽象偏好；随时允许删除参考，删除时处理相关证据关联并询问是否撤销由其支持的信号。不要在公开作品中使用私人相册、人像、车辆牌照或第三方截图，除非另有授权。

