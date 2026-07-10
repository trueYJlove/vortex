# 模型定价 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务执行。步骤使用 checkbox（`- [ ]`）记录进度。

**Goal:** 把模型能力里的价格字段、AI Source 的按模型覆盖价格、服务端按 token 计费、以及前端费用来源标记串成一条完整链路，让费用显示同时支持 API 返回值和本地估算。

**Architecture:** 价格元数据继续放在 `model-capabilities.json` 作为默认值，用户编辑时通过现有 `AISource.modelOverrides` 覆盖单个模型。服务端在 `buildTokenUsage` 中先使用 API 返回的 `total_cost_usd`，否则基于模型定价本地计算；renderer 只消费统一的 `TokenUsage`，根据 `pricingSource` 决定是否展示估算标记。

**Tech Stack:** TypeScript、React、Zustand、Vitest、JSON preset 数据、现有 i18n 机制

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `src/shared/types/model-capabilities.ts` | 扩展模型能力定义，新增价格字段 |
| `src/shared/data/model-capabilities.json` | 预填已知模型的默认价格 |
| `src/main/services/agent/types.ts` | 扩展服务端解析后的能力类型与 token usage 类型 |
| `src/main/services/model-capabilities.service.ts` | 确保 preset + override 合并链路可透传价格字段 |
| `src/main/services/agent/helpers.ts` | 把解析后的模型能力传给后续 token usage 计算 |
| `src/main/services/agent/context-usage.ts` | 本地费用计算与 `buildTokenUsage` 优先级逻辑 |
| `src/main/services/agent/stream-processor.ts` | 调用 `buildTokenUsage` 时传入定价信息 |
| `src/renderer/types/index.ts` | 扩展前端 `TokenUsage` 结构 |
| `src/renderer/components/settings/ModelConfigPanel.tsx` | 在模型配置里新增价格编辑区 |
| `src/renderer/components/chat/TokenUsageIndicator.tsx` | 展示本地估算标记 |
| `tests/unit/**` | 覆盖类型透传、费用计算、UI 展示的单测 |

---

### Task 1：扩展模型能力与解析链路

**Files:**
- Modify: `src/shared/types/model-capabilities.ts`
- Modify: `src/main/services/agent/types.ts`
- Modify: `src/renderer/types/index.ts`
- Modify: `src/main/services/model-capabilities.service.ts`（仅在当前实现存在字段丢失时）
- Create: `tests/unit/services/agent/helpers.test.ts`
- Create: `tests/unit/shared/model-capabilities.test.ts`

- [ ] **Step 1: 先写失败测试**

在 `tests/unit/services/agent/helpers.test.ts` 里断言：某个模型覆盖中设置的 `inputPrice/outputPrice/cacheReadPrice/cacheCreationPrice` 能被 `resolveCapabilitiesFromSource` 原样带出。

在 `tests/unit/shared/model-capabilities.test.ts` 里断言：`ModelCapability`、`ResolvedModelCapabilities`、`TokenUsage` 的价格字段在运行时路径上可被正常消费。

- [ ] **Step 2: 运行测试确认失败**

运行：`npx vitest run tests/unit/services/agent/helpers.test.ts tests/unit/shared/model-capabilities.test.ts`

预期：失败，报出价格字段未透传或字段缺失。

- [ ] **Step 3: 实现最小修改**

在 `ModelCapability` / `ResolvedModelCapabilities` / `TokenUsage` 中补齐价格字段。

检查 `model-capabilities.service.ts` 是否需要同步透传这些字段；如果当前就是深浅合并即可，不额外重构。

- [ ] **Step 4: 再次运行测试**

运行：`npx vitest run tests/unit/services/agent/helpers.test.ts tests/unit/shared/model-capabilities.test.ts`

预期：通过。

- [ ] **Step 5: 提交**

提交粒度建议：`git commit -m "feat: 扩展模型能力价格字段"`

如果这一步引入了新的可见文案，先执行 `npm run i18n` 再提交。

---

### Task 2：预填模型默认价格数据

**Files:**
- Modify: `src/shared/data/model-capabilities.json`
- Create: `tests/unit/shared/model-capabilities-preset.test.ts`

- [ ] **Step 1: 先写失败测试**

在 `tests/unit/shared/model-capabilities-preset.test.ts` 里断言几个代表性模型（如 DeepSeek、Anthropic、OpenAI、Google）都有价格字段，且 `pattern` 前缀只保留保守默认值。

- [ ] **Step 2: 运行测试确认失败**

运行：`npx vitest run tests/unit/shared/model-capabilities-preset.test.ts`

预期：失败，提示价格缺失。

- [ ] **Step 3: 实现最小修改**

为已知模型补齐默认定价。

保持“用户覆盖优先于 preset”的原则不变。

对家族前缀只填最便宜型号的保守默认值，避免高估。

- [ ] **Step 4: 再次运行测试**

运行：`npx vitest run tests/unit/shared/model-capabilities-preset.test.ts`

预期：通过。

- [ ] **Step 5: 提交**

提交粒度建议：`git commit -m "feat: 预填模型默认价格"`

---

### Task 3：在模型配置 UI 中加入价格编辑区

**Files:**
- Modify: `src/renderer/components/settings/ModelConfigPanel.tsx`
- Modify: `src/renderer/components/settings/AISourcesSection.tsx`（仅在需要补充传参或状态流转时）
- Modify: 相关 i18n 文案所在文件（按现有自动翻译流程更新）
- Create: `tests/unit/components/settings/ModelConfigPanel.test.tsx`

- [ ] **Step 1: 先写失败测试**

在 `tests/unit/components/settings/ModelConfigPanel.test.tsx` 里断言：

- 选中某个模型后，价格输入框会从 preset 预填。
- 修改价格后会写回 `AISource.modelOverrides`。
- 切换模型时，价格区和现有模型能力区同步切换。

- [ ] **Step 2: 运行测试确认失败**

运行：`npx vitest run tests/unit/components/settings/ModelConfigPanel.test.tsx`

预期：失败，提示价格输入区不存在或没有预填。

- [ ] **Step 3: 实现最小修改**

在模型能力编辑区域下方新增“价格配置”区。

增加 4 个输入框：输入价格、输出价格、缓存读价格、缓存写价格。

单位显示为 `USD / 1M tokens`。

空值保持为未设置，不强行写 0。

复用现有模型选择下拉框，切换模型时同步刷新能力与价格表单。

- [ ] **Step 4: 再次运行测试**

运行：`npx vitest run tests/unit/components/settings/ModelConfigPanel.test.tsx`

预期：通过。

- [ ] **Step 5: 提交**

提交粒度建议：`git commit -m "feat: 增加模型价格配置界面"`

如果新增文案，先执行 `npm run i18n`。

---

### Task 4：实现服务端本地费用计算与 token usage 产出

**Files:**
- Modify: `src/main/services/agent/context-usage.ts`
- Modify: `src/main/services/agent/stream-processor.ts`
- Modify: `src/main/services/agent/helpers.ts`
- Modify: `src/main/services/agent/types.ts`（如果任务 1 还没完全覆盖到这里）
- Create: `tests/unit/services/agent/context-usage.test.ts`
- Create: `tests/unit/services/agent/stream-processor.test.ts`（如需要验证传参链路）

- [ ] **Step 1: 先写失败测试**

在 `tests/unit/services/agent/context-usage.test.ts` 里覆盖三种优先级：

1. API 返回 `total_cost_usd > 0` 时直接使用 API 值，标记为 `api`
2. API 没有费用但存在本地价格时，按 token * price 计算，标记为 `local`
3. 两者都没有时，`totalCostUsd = 0`

如需验证链路完整性，再在 `tests/unit/services/agent/stream-processor.test.ts` 里断言 `credentials?.capabilities` 被传给 token usage 构建函数。

- [ ] **Step 2: 运行测试确认失败**

运行：`npx vitest run tests/unit/services/agent/context-usage.test.ts tests/unit/services/agent/stream-processor.test.ts`

预期：失败，提示计算函数或 `pricingSource` 不存在。

- [ ] **Step 3: 实现最小修改**

在 `context-usage.ts` 新增 `calculateCost()`，按百万 token 口径计算输入、输出、缓存读、缓存写费用。

调整 `buildTokenUsage()`：

1. 优先使用 `resultMsg.total_cost_usd`
2. 否则使用本地定价计算
3. 再否则返回 0

在 `helpers.ts` 和 `stream-processor.ts` 中把解析后的定价能力一路传入。

- [ ] **Step 4: 再次运行测试**

运行：`npx vitest run tests/unit/services/agent/context-usage.test.ts tests/unit/services/agent/stream-processor.test.ts`

预期：通过。

- [ ] **Step 5: 提交**

提交粒度建议：`git commit -m "feat: 添加本地费用计算链路"`

---

### Task 5：在聊天费用区展示本地估算标记

**Files:**
- Modify: `src/renderer/components/chat/TokenUsageIndicator.tsx`
- Modify: `src/renderer/types/index.ts`（如任务 1 尚未完成）
- Create: `tests/unit/components/chat/TokenUsageIndicator.test.tsx`

- [ ] **Step 1: 先写失败测试**

在 `tests/unit/components/chat/TokenUsageIndicator.test.tsx` 里断言：

- `pricingSource === 'local'` 时，费用旁会出现估算标记。
- `pricingSource === 'api'` 时，不显示额外标记。
- `totalCostUsd > 0` 的原有展示行为不变。

- [ ] **Step 2: 运行测试确认失败**

运行：`npx vitest run tests/unit/components/chat/TokenUsageIndicator.test.tsx`

预期：失败，提示标记不存在。

- [ ] **Step 3: 实现最小修改**

在费用旁增加本地估算提示标记。

仅当 `pricingSource === 'local'` 时显示。

保持当前费用格式和现有展示布局不变。

- [ ] **Step 4: 再次运行测试**

运行：`npx vitest run tests/unit/components/chat/TokenUsageIndicator.test.tsx`

预期：通过。

- [ ] **Step 5: 提交**

提交粒度建议：`git commit -m "feat: 标记本地估算费用来源"`

---

### Task 6：全量验证与收尾

**Files:**
- 无新增业务文件；只做验证与必要的文案同步。

- [ ] **Step 1: 运行 i18n 同步**

运行：`npm run i18n`

预期：无错误，生成/更新翻译资源。

- [ ] **Step 2: 运行类型检查**

运行：`npx tsc --noEmit`

预期：通过。

- [ ] **Step 3: 运行关键单测**

运行：
`npx vitest run tests/unit/shared/model-capabilities.test.ts tests/unit/shared/model-capabilities-preset.test.ts tests/unit/services/agent/helpers.test.ts tests/unit/services/agent/context-usage.test.ts tests/unit/components/settings/ModelConfigPanel.test.tsx tests/unit/components/chat/TokenUsageIndicator.test.tsx`

预期：全部通过。

- [ ] **Step 4: 做一次手工冒烟**

打开设置里的 AI Sources，检查价格预填、编辑、保存、切换模型是否正常。

打开聊天窗口，检查当费用来自本地估算时是否显示标记。

- [ ] **Step 5: 提交**

如果前面已按任务分提交，这一步只做最终整理；如需合并提交，保持提交信息为中文，聚焦“模型定价链路完成”。

---

## 依赖关系与实现顺序

1. **任务 1** 先做，提供所有后续所需的类型基础。
2. **任务 2** 可在任务 1 完成后独立推进，依赖类型已扩展。
3. **任务 3** 依赖任务 1；UI 要能读写新增价格字段。
4. **任务 4** 依赖任务 1；费用计算和 `pricingSource` 需要统一类型。
5. **任务 5** 依赖任务 4；前端要消费新的 `pricingSource`。
6. **任务 6** 在前面所有任务完成后做最终校验。

---

## 规格覆盖检查

- 模型能力新增价格字段：**任务 1**
- `ResolvedModelCapabilities` 新增价格字段：**任务 1**
- `TokenUsage` 新增 `pricingSource`：**任务 1**
- `model-capabilities.json` 预填价格：**任务 2**
- Settings → AI Sources → 模型配置 → 价格配置 UI：**任务 3**
- `calculateCost()`：**任务 4**
- `buildTokenUsage` 三段式优先级：**任务 4**
- `stream-processor.ts` 传入 pricing：**任务 4**
- `TokenUsageIndicator` 本地估算标记：**任务 5**
- 全量验证与 i18n：**任务 6**
