# Halo → Vortex 品牌替换设计

**日期**: 2026-07-05
**状态**: 已批准
**范围**: 用户可见文本，不含代码标识符

## 背景

Fork 原 Halo 仓库后，需要将产品从 "Halo" 重新品牌为 "Vortex"。这是全新发布，无需向后兼容。

## 替换范围

### 会替换的内容

| 类别 | 文件 | 预估数量 |
|------|------|----------|
| i18n 语言文件 | `en.json`, `zh-CN.json`, `zh-TW.json`, `ja.json`, `de.json`, `fr.json`, `es.json` | ~52 字符串 × 7 文件 |
| HTML 页面标题 | `index.html`, `overlay.html` | 3-4 处 |
| Onboarding 引导 | `onboardingData.ts` | 5-10 处 |
| Android 字符串 | `strings.xml` | 3-5 处 |
| README | `resources/README.txt` | 2-3 处 |

**总计: ~380-390 处替换**

### 不会替换的内容

- 代码标识符: `HaloConfig`, `haloDir`, `window.halo`, `HaloForegroundService` 等
- 应用 ID: `com.halo.app`
- 加密密钥/盐值: HKDF 字符串
- 数据目录路径: `.halo` 目录名
- 文件路径引用: `halo/` 前缀

## 外部链接处理

所有指向 `hello-halo.cc` 和 `github.com/openkursar/hello-halo` 的 URL 将被注释掉，保留注释供后续替换：

```typescript
// 原始:
url: 'https://hello-halo.cc/docs'
// 替换后:
// url: 'https://hello-halo.cc/docs' // TODO: Replace with Vortex URL
```

## 执行方式

使用批量替换脚本，逐文件处理：

1. 遍历目标文件列表
2. 对每个文件执行文本替换
3. 跳过代码标识符（通过模式匹配排除）
4. 注释掉外部链接

### 替换规则

```typescript
// i18n 文本
"Halo" → "Vortex"
"Halo " → "Vortex " (带空格的上下文)

// 外部链接
完整 URL → 注释掉
```

## 验证

- 运行 `npm run i18n` 确保翻译文件格式正确
- 检查替换后的文件无语法错误
- Code Review 确认无遗漏或误替
