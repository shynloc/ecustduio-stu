# 来源与事实质量检查（v1.7）

## 什么时候读

只要输入包含事实、数值、法规、研究、公司、日期、引语或图表，就应在创意制作前读取本文件。Visual Master 采用 `source-map.json` 时，还必须运行来源覆盖检查。

## 内容处理边界

1. 把每条候选信息分成 `source_fact`（源材料明确有）、`verified_external`（已在权威来源核查）、`inference`（有依据的推断）、`placeholder`（演示占位）和 `unresolved`（冲突/缺漏）。
2. 原始数据、单位、时间范围、口径、实体正式名称与引用出处保持精确。任何压缩摘要都应允许追溯原章节、页码/段落或可访问 URL；无法确认就写“待核实”，不编造页码和引文。
3. 每个数值或统计图表记录分母、单位、时间、四舍五入规则与计算来源。复杂计算使用独立脚本/工具复算，再人工审阅。
4. 涉及法律/政策/医学/金融或新近事实，先查权威且有日期的来源。公开网页可以引用的内容，仍受著作权与隐私约束；不能将网页检索结果等同于可自由公开原文。
5. 面向观众的文案先按 `references/AUDIENCE-COPY.md` 送审；来源映射与事实核查不会替代观众稿批准。

## 使用来源覆盖工具

当项目有 `visual-master/content.json` 的 `scenes[].id` 和 `visual-master/source-map.json` 的 `source_mapping`、`source_files` 时运行：

```bash
python scripts/check_source_coverage.py \
  --content path/to/visual-master/content.json \
  --source-map path/to/visual-master/source-map.json \
  --out path/to/source-coverage.json --strict
```

- `PASS`：章节 ID 和来源映射结构齐全。**不证明信息为真。**
- `REVIEW`：有孤儿映射、缺少来源或隐私范围声明不完整；需人工决策。
- `FAIL`：缺少章节映射、重复 ID 或输入结构无效；修改后重跑。

测试示例使用公开的 HTML Creator Studio 产品介绍。用户提供的新材料必须重新建立来源映射，不得复制示例的通过状态。
