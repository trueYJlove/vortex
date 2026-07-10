# Model Pricing — 模型定价设计

## 概述

利用已有的 token 用量数据和用户配置的模型定价信息，为所有模型提供统一的费用计算，让用户在费用显示区域看到准确的成本估算。

## 类型扩展

### ModelCapability 扩展（src/shared/types/model-capabilities.ts）

```typescript
export interface ModelCapability {
  displayName: string
  provider: string
  contextWindow: number
  maxOutputTokens: number
  vision: boolean
  thinking: boolean
  /** 每百万 token 输入价格（USD），可选 */
  inputPrice?: number
  /** 每百万 token 输出价格（USD），可选 */
  outputPrice?: number
  /** 每百万 token 缓存命中价格（USD），可选 */
  cacheReadPrice?: number
  /** 每百万 token 缓存写入价格（USD），可选 */
  cacheCreationPrice?: number
}
```

### ResolvedModelCapabilities 扩展

```typescript
export interface ResolvedModelCapabilities {
  maxOutputTokens: number
  contextWindow: number
  inputPrice?: number
  outputPrice?: number
  cacheReadPrice?: number
  cacheCreationPrice?: number
}
```

### TokenUsage 扩展（`src/renderer/types/index.ts` + `src/main/services/agent/types.ts`）

```typescript
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number
  contextWindow: number
  pricingSource?: 'api' | 'local'  // 可选：仅用于展示来源，不参与持久化或计算逻辑
}
```

## model-capabilities.json 预填

在现有 JSON 中为已知模型补充官方定价。价格来源以各模型供应商公开价格和用户覆盖配置为准，`model-capabilities.json` 仅提供默认值，用户配置始终优先。

- DeepSeek: deepseek-chat, deepseek-reasoner, deepseek-coder ~5 条
- Anthropic: claude-sonnet-4, claude-haiku-3.5, claude-opus-4 等 ~10 条
- OpenAI: gpt-4o, gpt-4o-mini, o3, o4-mini 等 ~8 条
- Google: gemini-2.0-flash, gemini-2.5-pro 等 ~6 条
- 其他: qwen, glm, yi 等 ~10 条

总计约 40 个模型的预设价格。pattern 前缀只填最便宜型号的价格作为安全默认值。

## 用户配置 UI

在 Settings → AI Sources → 编辑 Source → 模型配置中，复用现有的模型能力覆盖区域，新增"价格配置"区段：

- 4 个输入框：输入价格、输出价格、缓存读价格、缓存写价格（单位：USD / 1M tokens）
- 空 = 未知价格
- 预设值从 model-capabilities.json 读取并预填
- 修改后写入 AISource.modelOverrides，同现有机制
- 复用已有的模型选择下拉框，切换模型时两个区域同步变化

## 服务端价格计算

### 计算函数

```typescript
export function calculateCost(
  usage: SingleCallUsage,
  pricing: ResolvedModelCapabilities,
): number {
  return (
    (usage.inputTokens / 1_000_000) * (pricing.inputPrice ?? 0)
    + (usage.outputTokens / 1_000_000) * (pricing.outputPrice ?? 0)
    + (usage.cacheReadTokens / 1_000_000) * (pricing.cacheReadPrice ?? 0)
    + (usage.cacheCreationTokens / 1_000_000) * (pricing.cacheCreationPrice ?? 0)
  )
}
```

### buildTokenUsage 修改

优先级：
1. API 返回了 `total_cost_usd` 且 > 0 → 直接用，标记 `pricingSource: 'api'`
2. 有本地定价（`pricing.inputPrice || pricing.outputPrice`） → 手动计算，标记 `pricingSource: 'local'`
3. 都没有 → `totalCostUsd: 0`，不显示费用

调用链：`stream-processor.ts` 中 `buildTokenUsage` 调用处，从 `credentials?.capabilities` 传入定价信息。

## UI 显示

### TokenUsageIndicator 调整

- `totalCostUsd > 0` 时显示费用（不变）
- `pricingSource === 'local'` 时在费用旁显示 ⚡ 标记（tooltip: "Estimated based on local pricing config"）
- `pricingSource === 'api'` 时不额外显示标记

## 涉及修改的文件

| 文件 | 变更 |
|------|------|
| `src/shared/types/model-capabilities.ts` | ModelCapability +4 价格字段 |
| `src/shared/types/ai-sources.ts` | 无变更（modelOverrides 已是 Partial<ModelCapability>，自动继承新字段）|
| `src/shared/data/model-capabilities.json` | 约 40 个模型的定价预填 |
| `src/main/services/agent/types.ts` | ResolvedModelCapabilities +4 价格字段 |
| `src/main/services/agent/context-usage.ts` | calculateCost() 函数 + buildTokenUsage 改造 |
| `src/main/services/agent/stream-processor.ts` | 传入 pricing 参数 |
| `src/main/services/model-capabilities.service.ts` | 无变更（已自动合并所有 ModelCapability 字段）|
| `src/renderer/types/index.ts` | TokenUsage.pricingSource 字段 |
| `src/renderer/components/chat/TokenUsageIndicator.tsx` | 费用来源标记 |
| `src/renderer/pages/SettingsPage.tsx`（或对应模型配置组件）| 价格配置 UI |