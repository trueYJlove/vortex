# 多主题系统实现方案

> **给自动化工作者：** 必须使用子技能：superpowers:executing-plans 逐任务实施本方案。步骤使用复选框（`- [ ]`）语法进行追踪。

**目标：** 将现有的 light/dark/system 二元主题扩展为可插拔的多主题系统，支持任意数量的颜色主题（如 Dracula、Monokai、Solarized 等）。架构设计要求添加/删除主题时只需修改主题定义文件，不涉及 UI 组件或核心逻辑的改动。

**架构：** 采用 **Theme Registry + CSS Variable + data-theme 属性** 模式。主题定义集中在独立的 registry 文件中，每个主题提供完整的 HSL CSS 变量集合。运行时通过 `[data-theme="xxx"]` 属性选择器切换主题，不再依赖 `.light` 类名。`ThemeMode` 类型扩展为联合类型，保留 `'system'` 特殊值用于跟随系统偏好。

**技术栈：** React 18、TypeScript、CSS Custom Properties (HSL)、TailwindCSS 变量桥接、现有 Halo i18n。

---

## 文件结构

### 新增文件

- **`src/renderer/themes/registry.ts`**
  - 主题注册表。导出所有可用主题的元数据和 CSS 变量定义。
  - 包含 `ThemeRegistry` 类型、`BUILTIN_THEMES` 数组、`getTheme()` / `getAllThemes()` 辅助函数。
  - 每个主题定义：`id`、`name`（i18n key）、`type`（`'light' | 'dark'`）、`colors`（CSS 变量键值对）、`preview`（UI 预览用的 3-4 个代表色）。

- **`src/renderer/themes/builtins/dark.ts`**
  - 默认深色主题定义（当前 `:root` 中的值）。

- **`src/renderer/themes/builtins/light.ts`**
  - 默认浅色主题定义（当前 `.light` 中的值）。

- **`src/renderer/themes/builtins/dracula.ts`**
  - Dracula 主题定义。色值参考 [Dracula Official](https://draculatheme.com/contribute) 调色板。

### 修改文件

- **`src/renderer/types/index.ts`**
  - `ThemeMode` 类型扩展：`'system' | BuiltInThemeId`（`BuiltInThemeId` 从 registry 导入）。
  - `AppearanceConfig.theme` 类型同步更新。
  - `DEFAULT_CONFIG.appearance.theme` 保持 `'system'`。

- **`src/renderer/assets/styles/globals.css`**
  - 移除 `:root` 和 `.light` 中的硬编码 CSS 变量。
  - 替换为 `[data-theme="dark"]` 和 `[data-theme="light"]` 选择器。
  - 同时为 Dracula 等自定义主题添加对应的 `[data-theme="dracula"]` 选择器。
  - 或者：通过 JS 动态注入 CSS 变量（推荐，避免 CSS 文件膨胀）。

- **`src/renderer/App.tsx`**
  - `applyTheme` 函数改为读取主题 ID，从 registry 获取颜色并设置 `data-theme` 属性。
  - `THEME_COLORS` 扩展为按主题 ID 索引，或从 registry 的 `type` 字段推断 titleBarOverlay 颜色。
  - 保留 `'system'` 解析逻辑：读取 `prefers-color-scheme`，映射到默认 light/dark 主题 ID。

- **`src/renderer/index.html`**
  - Anti-flash 内联脚本改为：读取 `localStorage('halo-theme')`，如果是已知主题 ID 则设置 `data-theme` 属性，同时保留背景色内联样式按主题 `type` 动态匹配。

- **`src/renderer/overlay.html`**
  - 同步 index.html 的 anti-flash 改动。

- **`src/renderer/components/settings/AppearanceSection.tsx`**
  - 主题选择 UI 从 3 个按钮改为网格布局，展示所有可用主题。
  - 每个主题卡片显示：名称、预览色块、当前选中状态。
  - `handleThemeChange` 接受主题 ID 字符串。

- **`src/renderer/components/setup/PreferencesStep.tsx`**
  - 主题选择网格同步更新，展示所有内置主题。
  - 首次启动时默认选中 `'system'`。

---

## 主题 Registry 架构

### 类型定义

```ts
// src/renderer/themes/registry.ts

/** 主题颜色变量集合 — 键为 CSS 变量名（不含 -- 前缀），值为 HSL 字符串 */
export interface ThemeColors {
  background: string
  foreground: string
  card: string
  'card-foreground': string
  popover: string
  'popover-foreground': string
  primary: string
  'primary-foreground': string
  secondary: string
  'secondary-foreground': string
  muted: string
  'muted-foreground': string
  accent: string
  'accent-foreground': string
  destructive: string
  'destructive-foreground': string
  border: string
  input: string
  ring: string
  // Halo brand colors
  'halo-glow': string
  'halo-success': string
  'halo-warning': string
  'halo-error': string
}

export interface ThemeDefinition {
  id: string           // 唯一标识，如 'dark', 'light', 'dracula'
  name: string         // i18n key，如 'Dark', 'Light', 'Dracula'
  type: 'light' | 'dark'  // 影响 titleBarOverlay、color-scheme
  colors: ThemeColors
  /** UI 预览用的代表色（3-4 个），用于设置页面的主题卡片 */
  preview: {
    background: string
    foreground: string
    primary: string
    accent: string
  }
}

export type BuiltInThemeId = 'dark' | 'light' | 'dracula'
```

### 注册表

```ts
// src/renderer/themes/registry.ts

import { darkTheme } from './builtins/dark'
import { lightTheme } from './builtins/light'
import { draculaTheme } from './builtins/dracula'

/** 所有内置主题，按显示顺序排列 */
export const BUILTIN_THEMES: ThemeDefinition[] = [
  darkTheme,
  lightTheme,
  draculaTheme,
]

const themeMap = new Map(BUILTIN_THEMES.map(t => [t.id, t]))

export function getTheme(id: string): ThemeDefinition | undefined {
  return themeMap.get(id)
}

export function getAllThemes(): ThemeDefinition[] {
  return BUILTIN_THEMES
}

/** 解析 'system' 为实际主题 ID */
export function resolveSystemTheme(): 'dark' | 'light' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
```

### 主题定义示例（Dracula）

```ts
// src/renderer/themes/builtins/dracula.ts

import type { ThemeDefinition } from '../registry'

export const draculaTheme: ThemeDefinition = {
  id: 'dracula',
  name: 'Dracula',
  type: 'dark',
  colors: {
    background:    '231 17% 14%',    // #282a36
    foreground:    '252 100% 88%',   // #f8f8f2
    card:          '232 19% 17%',    // #2d2f3b
    'card-foreground': '252 100% 88%',
    popover:       '232 19% 17%',
    'popover-foreground': '252 100% 88%',
    primary:       '265 100% 75%',   // #bd93f9
    'primary-foreground': '0 0% 100%',
    secondary:     '231 17% 20%',    // #343746
    'secondary-foreground': '252 100% 88%',
    muted:         '231 17% 20%',
    'muted-foreground': '220 14% 56%', // #6272a4
    accent:        '326 100% 74%',   // #ff79c6
    'accent-foreground': '0 0% 100%',
    destructive:   '0 100% 68%',     // #ff5555
    'destructive-foreground': '0 0% 100%',
    border:        '231 17% 26%',    // #44475a
    input:         '231 17% 20%',
    ring:          '265 100% 75%',
    'halo-glow':   '265 100% 75%',
    'halo-success': '135 100% 63%',  // #50fa7b
    'halo-warning': '44 100% 67%',   // #f1fa8c
    'halo-error':  '0 100% 68%',     // #ff5555
  },
  preview: {
    background: '#282a36',
    foreground: '#f8f8f2',
    primary:    '#bd93f9',
    accent:     '#ff79c6',
  }
}
```

---

## CSS 策略

### 推荐方案：JS 动态注入（避免 CSS 膨胀）

不为每个主题在 CSS 文件中写 `data-theme` 选择器。而是在 `applyTheme` 时，将主题的 CSS 变量以 `style` 属性直接设置到 `document.documentElement` 上。

```ts
// App.tsx 中的 applyTheme 改造
function applyTheme(themeId: string) {
  const root = document.documentElement
  const theme = getTheme(themeId) ?? getTheme(resolveSystemTheme()) ?? getTheme('dark')!
  const isDark = theme.type === 'dark'

  // 设置 data-theme 属性（用于 CSS 选择器，如 color-scheme）
  root.setAttribute('data-theme', theme.id)

  // 移除旧的 .light 类（兼容过渡期）
  root.classList.remove('light')

  // 动态注入 CSS 变量
  const cssVars = Object.entries(theme.colors)
    .map(([key, value]) => `--${key}: ${value}`)
    .join('; ')
  root.style.cssText = cssVars

  // 设置 color-scheme
  root.style.colorScheme = isDark ? 'dark' : 'light'

  // 同步到 localStorage
  localStorage.setItem('halo-theme', themeId)

  // 更新 titleBarOverlay
  const overlayColors = isDark
    ? { color: theme.colors.background.replace(/ /g, ',').replace(/,(\d+)%/, '%$1').replace(/ /g, '') }
    // 简化：从 preview.background 取 hex 值
    : { color: theme.preview.background, symbolColor: theme.preview.foreground }
  api.setTitleBarOverlay(overlayColors).catch(() => {})
}
```

**备选方案：纯 CSS（如果希望避免 JS 运行前的闪烁）**

在 `globals.css` 中为每个内置主题添加 `[data-theme="xxx"]` 选择器。优点是 CSS 加载即生效；缺点是主题数量增多时 CSS 文件膨胀。考虑到内置主题数量有限（5-10 个），此方案也可行。最终选择可在实现时根据实际效果决定。

---

## Anti-Flash 机制改造

### index.html

```html
<style>
  /* Anti-flash: 默认深色背景 */
  html, body, #root { background-color: #0a0a0a; }
</style>
<script>
  (function() {
    try {
      var theme = localStorage.getItem('halo-theme');
      if (theme && theme !== 'system' && theme !== 'dark') {
        // 已知的自定义主题 — 设 data-theme 并用主题背景色
        document.documentElement.setAttribute('data-theme', theme);
        // 主题背景色需要内联（从预设映射表中获取）
        var bgMap = { dracula: '#282a36', /* 其他主题 */ };
        if (bgMap[theme]) {
          var bg = bgMap[theme];
          document.documentElement.style.cssText = 'background-color:' + bg;
          document.documentElement.style.colorScheme = 'dark';
        }
      } else if (theme === 'light' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.style.cssText = 'background-color:#ffffff';
        document.documentElement.style.colorScheme = 'light';
      }
      // 'dark' 或无值：保持默认 #0a0a0a
    } catch (e) {}
  })();
</script>
```

### overlay.html

同步 index.html 的 anti-flash 改动。

---

## UI 组件改造

### AppearanceSection.tsx

主题选择区域从 3 个按钮改为网格布局：

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
  {getAllThemes().map((t) => (
    <button
      key={t.id}
      onClick={() => handleThemeChange(t.id)}
      className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
        theme === t.id
          ? 'bg-primary/15 border-primary'
          : 'bg-card border-border hover:border-primary/50'
      }`}
    >
      {/* 预览色块 */}
      <div className="flex gap-1">
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.preview.background }} />
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.preview.primary }} />
        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.preview.accent }} />
      </div>
      <span className="text-xs">{t.name}</span>
    </button>
  ))}
</div>
```

同时添加 "System" 选项在网格外部或作为第一项。

### PreferencesStep.tsx

同步 AppearanceSection 的网格布局。首次启动时默认选中 `'system'`，显示所有主题卡片。

---

## 类型系统变更

```ts
// types/index.ts
import type { BuiltInThemeId } from '../themes/registry'

export type ThemeMode = 'system' | BuiltInThemeId
```

`AppearanceConfig.theme` 自动跟随 `ThemeMode` 类型。

---

## 配置持久化

- localStorage key `halo-theme` 存储主题 ID 字符串（如 `'dark'`, `'dracula'`, `'system'`）。
- `config.appearance.theme` 同步存储主题 ID。
- 主进程 `config.service.ts` 无需改动，仅存储字符串值。
- 迁移：现有用户 localStorage 中的 `'light'`/`'dark'` 值自动兼容，无需迁移逻辑。

---

## 实施任务

### 任务 1：创建主题 Registry 和内置主题定义

**文件：**
- 添加：`src/renderer/themes/registry.ts`
- 添加：`src/renderer/themes/builtins/dark.ts`
- 添加：`src/renderer/themes/builtins/light.ts`
- 添加：`src/renderer/themes/builtins/dracula.ts`

- [ ] **步骤 1：创建 registry.ts** — 定义 `ThemeColors`、`ThemeDefinition`、`BuiltInThemeId` 类型，`BUILTIN_THEMES` 数组，`getTheme()`/`getAllThemes()`/`resolveSystemTheme()` 函数。

- [ ] **步骤 2：创建 dark.ts** — 从 globals.css 的 `:root` 变量提取深色主题定义。`preview.background` 使用 `#0a0a0a`。

- [ ] **步骤 3：创建 light.ts** — 从 globals.css 的 `.light` 变量提取浅色主题定义。`preview.background` 使用 `#ffffff`。

- [ ] **步骤 4：创建 dracula.ts** — 基于 Dracula 官方调色板定义主题。色值参考：背景 `#282a36`、前景 `#f8f8f2`、主色 `#bd93f9`、强调色 `#ff79c6`。

---

### 任务 2：更新类型系统

**文件：**
- 修改：`src/renderer/types/index.ts`

- [ ] **步骤 1：导入 BuiltInThemeId**

```ts
import type { BuiltInThemeId } from '../themes/registry'
```

- [ ] **步骤 2：更新 ThemeMode**

```ts
export type ThemeMode = 'system' | BuiltInThemeId
```

- [ ] **步骤 3：验证 DEFAULT_CONFIG** — `appearance.theme: 'system'` 保持不变，类型兼容。

---

### 任务 3：改造 CSS 主题系统

**文件：**
- 修改：`src/renderer/assets/styles/globals.css`

- [ ] **步骤 1：移除硬编码变量** — 删除 `:root` 和 `.light` 中的 CSS 变量定义（保留 `--radius` 在 `:root` 中）。

- [ ] **步骤 2：添加 data-theme 选择器** — 为 `dark`、`light`、`dracula` 各添加 `[data-theme="xxx"]` 选择器及对应变量。或保留 JS 动态注入方案（在任务 4 中实现）。

- [ ] **步骤 3：更新 color-scheme 规则** — 将 `html { color-scheme: dark; }` 和 `html.light { color-scheme: light; }` 改为 `[data-theme]` 选择器。

---

### 任务 4：改造 applyTheme 函数

**文件：**
- 修改：`src/renderer/App.tsx`

- [ ] **步骤 1：导入 registry**

```ts
import { getTheme, resolveSystemTheme, BUILTIN_THEMES } from './themes/registry'
import type { ThemeMode } from './types'
```

- [ ] **步骤 2：重写 applyTheme** — 接受 `ThemeMode`，解析为实际主题 ID，从 registry 获取颜色，设置 `data-theme` 属性和 CSS 变量。

- [ ] **步骤 3：更新 THEME_COLORS** — 改为从 registry 动态获取 titleBarOverlay 颜色。

- [ ] **步骤 4：更新 useEffect** — 保持 `config?.appearance?.theme` 监听不变，调用新的 `applyTheme`。

---

### 任务 5：改造 Anti-Flash 机制

**文件：**
- 修改：`src/renderer/index.html`
- 修改：`src/renderer/overlay.html`

- [ ] **步骤 1：更新 index.html 内联脚本** — 读取 localStorage 中的主题 ID，设置 `data-theme` 属性，根据主题 type 设置背景色。

- [ ] **步骤 2：更新 index.html 内联样式** — 简化为仅保留默认深色背景，其余由 `data-theme` 控制。

- [ ] **步骤 3：同步 overlay.html** — 应用相同的 anti-flash 改动。

---

### 任务 6：更新设置页面 UI

**文件：**
- 修改：`src/renderer/components/settings/AppearanceSection.tsx`
- 修改：`src/renderer/components/setup/PreferencesStep.tsx`

- [ ] **步骤 1：更新 AppearanceSection** — 导入 `getAllThemes()`，将主题选择从 3 个按钮改为网格布局，每个主题卡片显示预览色块和名称。

- [ ] **步骤 2：更新 PreferencesStep** — 同步网格布局，保留 System 选项。

- [ ] **步骤 3：更新 i18n** — 确保 Dracula 等主题名称可通过 `t()` 翻译（或直接使用主题的 `name` 字段，因其为专有名词无需翻译）。

---

### 任务 7：验证

- [ ] **步骤 1：TypeScript 编译检查**

```bash
npx tsc --noEmit
```

- [ ] **步骤 2：i18n 提取**

```bash
npm run i18n
```

- [ ] **步骤 3：视觉验证** — 确认每个主题切换后 UI 正确渲染，无闪烁。

- [ ] **步骤 4：Anti-flash 验证** — 刷新页面确认主题在 React 挂载前生效。

- [ ] **步骤 5：后向兼容验证** — 现有用户的 `'light'`/`'dark'` 配置值正常工作。

---

## 验收标准

- 主题网格展示所有内置主题（Dark、Light、Dracula），每个显示预览色块。
- 切换主题后整个应用即时更新，无闪烁。
- Dracula 主题色值正确，视觉效果舒适。
- 刷新页面时 anti-flash 机制正常工作。
- `'system'` 模式跟随系统偏好切换到 dark/light。
- 配置持久化正常，重启后主题保持。
- 添加新主题只需：(1) 在 `builtins/` 添加定义文件，(2) 在 `registry.ts` 的 `BUILTIN_THEMES` 中注册。无需改动 UI 或核心逻辑。
- TypeScript 编译通过，无类型错误。
