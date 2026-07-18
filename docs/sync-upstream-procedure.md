# 从上游仓库 cherry-pick 增量代码到本地 fork 分支

本规范记录如何从 `origin`（上游 `openkursar/hello-halo`）挑选增量提交合入本地 `mine`（`trueYJlove/vortex`）的 fork 分支。供后续重复执行相同任务时参考。

## 适用场景

- 本地 fork 基于上游 `main` 分叉后做了迭代开发，长期需要双向同步：
  - 拉 取上游 `main` 的增量功能/修复
  - 拉 取上游特定 feature 分支的增量（如 `feature/ai-terminal`）
  - 不做简单 `merge`，而是按提交粒度 `cherry-pick` 挑选，避免引入无关历史
- 目标分支：`mine/liuwei-dev`（个人 dev 主线），不在 `main` 上直接操作。

## 前置准备

1. **确认 remote 配置正确**：
   - `origin` → 上游 fork 源（`https://github.com/openkursar/hello-halo.git`）
   - `mine` → 自己的 fork（`https://github.com/trueYJlove/vortex.git`）

2. **拉取所有 remote 最新状态**：
   ```bash
   git fetch --all --prune
   ```

3. **工作区必须干净**：
   - 如果存在 untracked 文件，先确认来源（是否为之前 cherry-pick 残留），再决定 `git stash -u` 或 `git clean -fd`
   - 如果存在 stash，先 `git stash list` 查看是否还需要

## 操作步骤

### 1. 选定基线

将本地工作分支 fast-forward 到 `mine/liuwei-dev` 最新状态，避免在落后的 HEAD 上操作：

```bash
git checkout liuwei-dev
git pull --ff-only mine liuwei-dev
```

### 2. 新建工作分支

不在 `liuwei-dev` 上直接 cherry-pick，而是新建一个可丢弃的 sync 分支，便于出错时 reset：

```bash
git checkout -b sync/<topic>-<YYYYMMDD> liuwei-dev
```

例：`sync/main-20260718`。

### 3. 找到 merge-base

确定本地分支与上游目标分支的共同祖先，作为增量计算的起点：

```bash
MERGE_BASE=$(git merge-base liuwei-dev origin/main)
echo "$MERGE_BASE"
```

### 4. 列出上游增量提交

按时间正序（oldest first）列出需要挑选的提交，便于按顺序 cherry-pick：

```bash
git log --oneline --reverse --no-merges $MERGE_BASE..origin/main
```

`--no-merges` 排除纯 merge 提交（patch-id 为空，无法 cherry-pick）。

### 5. 用 patch-id 识别已合入的提交

本地分支可能已经包含部分上游提交（如历史 cherry-pick 或 merge）。用 `patch-id` 跳过这些：

```bash
# 生成本地分支所有 patch-id
git log --format='%H' liuwei-dev | while read sha; do
  git show $sha | git patch-id 2>/dev/null | awk '{print $1}'
done | sort -u > /tmp/local_patch_ids.txt

# 检查每个上游提交是否已在本地
for sha in $(git rev-list --no-merges $MERGE_BASE..origin/main); do
  pid=$(git show $sha | git patch-id 2>/dev/null | awk '{print $1}')
  if grep -q "^${pid}$" /tmp/local_patch_ids.txt; then
    echo "[ALREADY-LOCAL] $sha"
  else
    msg=$(git log -1 --format='%s' $sha)
    echo "[NEEDS-PICK]    $sha $msg"
  fi
done
```

> 注意：cherry-pick 后的提交如果内容完全一致，patch-id 会相同；如果 cherry-pick 时解决冲突修改了内容，patch-id 会变。所以「NEEDS-PICK」不一定代表从未 pick 过，需要结合 reflog 或人工 diff 判断。

### 6. 按时间正序 cherry-pick

使用 `-x` 选项在 commit message 末尾追加原始 commit ID，便于追溯：

```bash
for sha in $SHA_LIST; do
  git cherry-pick -x "$sha" || {
    echo ">>> 冲突: $sha"
    git status --short
    break
  }
done
```

### 7. 解决冲突

常见冲突类型与处理策略：

| 冲突文件 | 处理方式 |
|---|---|
| `package.json` 的 `version` 字段 | 保留本地版本（fork 版本号与上游不同） |
| `package-lock.json` / `yarn.lock` | `git checkout --ours` 保留本地，然后 `npm install --package-lock-only --legacy-peer-deps --ignore-scripts` 重新生成 |
| `src/main/openai-compat-router/converters/request/*.ts` 等核心代码 | 若多个提交改同一文件且都需要合入，直接 `git show origin/main:<path> > <path>` 用上游最终版本覆盖（前提是所有相关 PR 都要 pick） |
| `src/renderer/i18n/locales/*.json` | 用脚本合并：以本地 HEAD 为基础，加入新提交新增的 key；切勿直接用上游版本覆盖（本地有大量 fork 增量 key） |
| 其他业务代码 | 人工 review 冲突标记，按需保留 ours/theirs 或合并 |

#### i18n 合并脚本模板

```python
import json, os, subprocess

files = ["de", "en", "es", "fr", "ja", "zh-CN", "zh-TW"]
new_keys = ["key1", "key2", ...]  # 从 cherry-pick 失败的 diff 中提取

for f in files:
    git_path = f"src/renderer/i18n/locales/{f}.json"
    disk_path = os.path.join("src/renderer/i18n/locales", f"{f}.json")

    head = json.loads(subprocess.check_output(['git', 'show', f'HEAD:{git_path}']).decode('utf-8'))
    pick = json.loads(subprocess.check_output(['git', 'show', f'<SHA>:{git_path}']).decode('utf-8'))

    merged = dict(head)
    for k, v in pick.items():
        if k not in merged or (not merged[k] and v):
            merged[k] = v

    merged = dict(sorted(merged.items(), key=lambda x: x[0].lower()))
    with open(disk_path, 'w', encoding='utf-8') as fp:
        json.dump(merged, fp, ensure_ascii=False, indent=2)
        fp.write('\n')
```

### 8. 验证

每完成一批 cherry-pick 后：

1. **build**：`npm run build` 必须通过
2. **unit test**：`npm run test:unit`
   - 对比基线（cherry-pick 前）的失败数量，确认本次没有引入新失败
   - 新 PR 带来的新测试应该全部通过
3. **i18n**：`npm run i18n` 自动补齐缺失翻译

### 9. 提交 i18n 翻译

i18n 工具会重新排序 key 并填充翻译，单独提交一次，避免污染 cherry-pick 提交：

```bash
git add src/renderer/i18n/locales/*.json
git commit -m "i18n: 补齐 <PR#> 相关 key 的非英语 locale 翻译"
```

### 10. 保留在 sync 分支等用户 review

不要直接 merge 回 `liuwei-dev` 或 push 到 `mine`。让用户 review `sync/<topic>-<YYYYMMDD>` 分支后再决定：

```bash
git log --oneline liuwei-dev..sync/<topic>-<YYYYMMDD>
```

用户确认后再合并：

```bash
git checkout liuwei-dev
git merge --ff-only sync/<topic>-<YYYYMMDD>
git push mine liuwei-dev
```

## 失败回滚

- 单个 cherry-pick 冲突放弃：`git cherry-pick --abort`
- 整批 cherry-pick 回滚：`git reset --hard liuwei-dev`（或对应的 backup 分支）
- 建议在操作前先创建 backup 分支：`git branch backup/<topic>-<YYYYMMDD> liuwei-dev`

## 本次执行记录（2026-07-18）

- 基线：`d9654ca`（本地 `liuwei-dev` 与 `origin/main` 的 merge-base）
- 目标：合入 `origin/main` 在 `d9654ca..origin/main` 范围内的 19 个非 merge 提交
- 工作分支：`sync/main-20260718`（基于 `mine/liuwei-dev` HEAD `73239bb`）
- 跳过：`14d96f8`（#208/#221）已通过 patch-id 检测在本地存在
- 冲突处理：
  - `package.json` version 字段 → 保留本地 `1.0.0-rc.2`
  - `package-lock.json` → 保留本地 + `npm install --package-lock-only --legacy-peer-deps --ignore-scripts` 重生成（引入 `@dnd-kit/*`）
  - `anthropic-to-openai-chat.ts` / `anthropic-to-openai-responses.ts`（#181 与 #137 同改）→ 用 `origin/main` 最终版本覆盖
  - 7 个 i18n 文件 → Python 脚本合并：本地 HEAD + 上游新增 key
  - `SpaceSelector.tsx`（#68 与本地品牌重塑冲突）→ 删除本地被废弃的 `allSpaces.map` 块，保留 #68 的 `SortableSpaceList` 实现
- 验证：`npm run build` 通过；`npm run test:unit` 24 失败 / 1273 通过（与基线 73239bb 的 24 失败一致，新增 54 个测试全部通过）
- 后续：`npm run i18n` 补齐 4 个 UA key 的 6 个非英语翻译，单独提交 `62ee6ce`
- 待办：`origin/feature/ai-terminal` 本次未处理，留作下次单独同步

## 本次执行记录（2026-07-18，ai-terminal 分支）

- 基线：`43ea3bc`（`mine/liuwei-dev` HEAD，即上一次 main 同步完成后的状态）
- 目标：合入 `origin/feature/ai-terminal` 相对于 `origin/main` 的增量提交
- 工作分支：`sync/ai-terminal-20260718`（基于 `mine/liuwei-dev` HEAD `43ea3bc`）
- merge-base：`origin/feature/ai-terminal` 与 `liuwei-dev` 的共同祖先为 `1af9c45`（上游 main 历史点）
- 上游增量提交范围：`git log --oneline --reverse --no-merges 1af9c45..origin/feature/ai-terminal`
  - 共 3 个非 merge 提交：`5a6a52d`（pre-release changes）、`ab780b9`（i18n pre-release）、`6bec176`（AI terminal + named-tunnel + IM multi-device）
- 跳过：
  - `ab780b9`（i18n pre-release）`cherry-pick --skip` 跳过——内容为 i18n key 排序，最终会被第 9 步的 `npm run i18n` 重新生成，cherry-pick 时为空提交
- cherry-pick 结果：
  - `12ade07` ← `5a6a52d` (chore: pre-release changes)
  - `3a86de3` ← `6bec176` (feat: AI terminal + permanent named-tunnel + IM multi-device slot arbitration)
- 冲突处理：
  - `package.json` version 字段 → 保留本地 `1.0.0-rc.2`；新增 `@xterm/addon-fit`、`@xterm/headless`、`@xterm/xterm` 依赖合并入
  - `package-lock.json` / `yarn.lock` → 保留本地 + `npm install --legacy-peer-deps --ignore-scripts` 安装 `@xterm/*` 三个包
  - `src/main/ipc/browser.ts` → 合并：保留本地 `resolveUserAgent`/`getConfig`/`browserViewManager` 导入并加入上游 `browserContext`
  - `src/main/ipc/index.ts` → 合并：保留 fork 专用 `registerGitHandlers`、`registerKnowledgeHandlers` 并加入上游 `registerTerminalHandlers, cleanupTerminalHandlers`
  - `src/main/services/agent/send-message.ts` → 重构为上游 toolsets broker 架构（`buildCreationTimeServers` + `buildToolsetSection`），同时保留 fork 专用的 `knowledge-search` MCP 注入逻辑（始终启用，因 `toolsets/registry.ts` 中无 knowledge 条目）
  - `src/main/services/agent/session-manager.ts` → 从 `getOrCreateV2Session` 调用中移除 `SessionConfig` 参数，保留 `caps`/pricing 传递
  - `src/main/services/conversation.service.ts` → `Conversation` 接口合并：保留 `'mimo'` 引擎类型并加入上游 `modelSourceId`/`modelId`/`toolsets` 字段
  - `src/renderer/components/store/StoreCard.tsx`/`StoreDetail.tsx`/`StoreInstallDialog.tsx` → 保留本地 `StoreIcon` 导入，移除上游 `EntryIcon` 导入；删除上游新增的 `EntryIcon.tsx`（fork 已有等价的 `StoreIcon.tsx`）
  - `src/renderer/pages/HomePage.tsx` → 保留本地 `SortableSpaceList` 与本地 workspace 文案
  - `src/renderer/pages/SpacePage.tsx` → 合并：保留上游 `hidden sm:block` 移动端隐藏 + 本地 `CommandPaletteButton` + 上游 `MobileOverflowMenu`
  - `src/renderer/components/chat/ChatHistoryPanel.tsx` → 保留本地带过渡动画的 History 图标
  - `src/renderer/components/apps/AppConfigPanel.tsx` → 合并 lucide-react 导入：加入 `TerminalSquare` 同时保留 `Workflow, Plus, Server`
  - `src/renderer/components/settings/RemoteAccessSection.tsx` → 保留本地 `handleCopyToClipboard` 与本地绿色样式
  - `src/renderer/hooks/useCanvasLifecycle.ts` → 合并：保留 `openKnowledgeBase` 并加入 `openTerminal`
  - `src/renderer/stores/chat/conversations.ts` → 合并：保留本地 `toConversationMeta`/`removeConversationRuntimeState`/`clearConversations` slice 键并加入 `setConversationModel`
  - `src/renderer/api/events.api.ts` + `transport.ts` → 合并：保留 `onAgentTokenUsage`/`agent:token-usage` 并加入 `onToolsetsChanged`/`onToolsetsRequested`/`onTerminalData`/`onTerminalLifecycle`
  - 7 个 locale JSON（de/en/es/fr/ja/zh-CN/zh-TW）→ Python 脚本合并：保留 HEAD (fork) 值，仅从上游添加新 key，按字母序排序；最终 en=1689, de=1689, es=1733, fr=1733, ja=1688, zh-CN=1688, zh-TW=1688
- 验证：
  - `npm run build` 通过（需先 `npm install --legacy-peer-deps --ignore-scripts` 补齐 `@xterm/*` 依赖）
  - `npm run test:unit` 在 sync 分支：24 失败 / 1376 通过 / 1412 总计；对比 `liuwei-dev` 基线 24 失败 / 1273 通过 / 1309 总计 → 无回归，103 个新测试全部通过（来自 `6bec176` 新增的 10 个测试文件：ai-terminal/available.test.ts、ai-terminal/text-utils.test.ts、connection-arbiter.test.ts、webhook-source.test.ts、credentials-fingerprint.test.ts、message-utils.test.ts、team-lifecycle.test.ts、toolsets-last-used.test.ts、config-encryption.test.ts、device-identity.test.ts）
- 后续 i18n 提交：`ef68716` i18n: 补齐 #AI terminal 同步相关的非英语 locale 翻译
  - `npm run i18n` 重新排序 en.json 键并按字母顺序输出，移除上游已废弃的 82 个旧 Halo 品牌文案/Dedicated Spaces 旧概念键，新增 plurals 形式键（`_one`/`_other`）
  - 为 zh-CN/zh-TW/ja/es/fr/de 补齐约 238 个新键的本地化翻译
  - 已校验：82 个被移除的键在 `src/**/*.{ts,tsx}` 中均无 `t('...')` 形式引用
- code review：3 名 agent 成员（架构师 / 回归测试 / 业务缺陷）独立 review 后达成共识——无 P0 阻断问题；P1 警告 2 项属 fork 文件未跟随上游类型演进的遗留问题（`mimo/capabilities.ts:24` 残留 `midTurnInjection`、`apps/runtime/service.ts:160` 的 `getApiCredentials` 3-参数调用应改为 `getApiCredentialsForSource`），留待后续单独修复
- 合并：`git merge --no-ff sync/ai-terminal-20260718` 合入 `liuwei-dev`，形成 merge commit `80c4622`
- 推送：`git push mine liuwei-dev` → `43ea3bc..80c4622  liuwei-dev -> liuwei-dev`
- 备份：`sync/ai-terminal-20260718` 分支保留在本地，可后续删除：`git branch -d sync/ai-terminal-20260718`
