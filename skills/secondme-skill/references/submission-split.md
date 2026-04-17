# secondme 提交切分清单

本文用于把 `secondme` 的改动拆成两类提交，避免把“构建期资产”和“运行期资产”混在一起。

## Commit A：编排层（建议先提交）

适用场景：开发者在本地继续迭代流程、门禁、治理策略。

建议包含：

- `README.md`
- `SKILL.md`
- `persona.json`
- `scripts/` 下所有脚本（`run-gates.sh`、`check-sync.sh`、`check-model-integration.sh` 等）
- `references/product-report.md`
- `references/report-template.md`
- `references/submission-split.md`
- `.gitignore`

一般不包含：

- `models/`（本地训练产物）
- `training-hf-test/`（样本与转换数据）
- `reports/data|model|deploy/*.md`（验收报告产物）

## Commit B：运行包层（可选单独提交）

适用场景：需要把“可安装可运行”的最终人格包一起交付。

建议包含：

- `generated/persona-secondme-skill/` 整个目录

说明：

- `generated/persona-secondme-skill/` 是由根 `persona.json` 生成的运行时包，与 `entrepreneur-skill/generated/` 目录结构保持一致。
- 若包含训练后模型，请确认 `generated/persona-secondme-skill/model/` 下资产完整并通过 `scripts/check-model-integration.sh`。
- 重新生成命令：`bash skills/secondme-skill/scripts/regenerate-pack.sh`

## 用户使用建议

- 开发者/维护者：优先使用 `skills/secondme-skill/`（编排层）。
- 终端用户/安装方：优先使用 `skills/secondme-skill/generated/persona-secondme-skill/`（运行包）。

## 最小发布策略（推荐）

1. 先提交 Commit A（流程与治理可复现）。
2. 若要交付即用版本，再单独提交 Commit B（运行包）。
3. 发布前执行：
   - `bash skills/secondme-skill/scripts/run-gates.sh secondme-skill`
   - `bash skills/secondme-skill/scripts/publish-check.sh`
