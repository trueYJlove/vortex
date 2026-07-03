# Halo Architecture

> For AI developers: Read this file to understand the project's complete technical architecture.
> Primary source of truth for structure, conventions, and contracts.

## 1) Layer Model

Tiers are ordered bottom-up; each tier may depend only on the tiers **below** it.

```
Renderer (src/renderer)
  - pages/components/stores; desktop UI and remote web UI

Transport (src/main/ipc, src/main/http, src/preload)
  - thin request/response + event plumbing; NO business logic
  - http/routes is split per domain (config/space/agent/artifact/apps/store/im/...)

Apps Layer (src/main/apps)
  - spec            : App YAML parse + validate
  - manager         : install/config/status persistence + skill-sync
  - runtime         : activation/execution/activity/escalation
                      + im-channels/ (IM provider plugins)
                      + sources/ (file-watcher, schedule-bridge, webhook event sources)
                      + dispatch-inbound (IM → app-chat/prompt-chat)
                      + registers services/app-bridge at init (see §2)
  - conversation-mcp: in-process MCP server for app management tools

Services Layer (src/main/services)
  - domain services: agent, ai-browser, ai-sources, space, conversation,
    artifact, analytics, remote, etc.
  - app-bridge.ts   : DI seam so services reach Apps data without importing up

Platform Layer (src/main/platform)
  - store       : SQLite manager + migrations foundation
  - scheduler   : persistent job engine
  - event       : event routing/filter/dedup
  - memory      : scoped memory tools + files (SDK primitives injected via memory/sdk)
  - background  : keep-alive + tray + daemon browser

Foundation Layer (src/main/foundation)  ← bedrock, zero upward deps
  - config.service, config-encryption, crypto-envelope, credential-safety
  - secure-storage, window, protocol, logging/, product-config
```

## 2) Dependency Direction (Must Hold)

- Dependencies flow **downward only**:
  `renderer -> transport -> apps -> services -> platform -> foundation`.
- **foundation** is the bedrock: it imports only Electron/Node/`shared` — never
  `platform/services/apps/http`. Anything config/log/window/crypto/product-config
  belongs here. A foundation file importing an upper tier is always a bug.
- `apps/runtime` is the orchestration boundary; do not push runtime orchestration
  into transport layers.
- `platform/*` stay generic infrastructure (not renderer-specific, not UI-coupled),
  and must not import `services/apps`. (Two legacy exceptions remain and are
  tracked as debt: `platform/background/daemon-browser` reuses `services/stealth`
  + `services/ai-browser/download-utils` — daemon-browser is browser-domain code
  co-located in background for lifecycle reasons.)
- **Dependency inversion seams** keep the direction clean where a lower tier needs
  a higher tier's behavior at runtime:
  - `services/app-bridge.ts` — the agent engine and space service reach the App
    manager / `halo-apps` MCP server / MCP-change events through this seam;
    `apps/runtime` registers the concrete impls at startup (`registerAppBridge`).
  - `platform/memory/sdk.ts` — the agent-SDK `tool()`/`createSdkMcpServer()`
    primitives are injected by bootstrap (`setMemorySdk`) so memory never imports
    `services/agent`.
  - Pattern mirrors `apps/runtime/im-channels`'s `setActiveImChannelManager`.
  - Type-only imports across a boundary are erased at runtime and are allowed.
- Shared renderer-safe types belong in `src/shared/*`.

## 3) Engineering Baseline (Non-Negotiable)

- **Modularity and boundary clarity are mandatory.**
- **High quality and maintainability are first priority.**
- **Performance must be preserved or improved** — no startup/runtime/memory regressions.
- Essential startup path remains minimal; heavy work stays in extended/lazy flows.

## 4) Directory Structure

```
src/
├── main/                              # Electron Main Process
│   ├── index.ts                       # Main entry, app lifecycle
│   ├── bootstrap/                     # essential.ts (sync) + extended.ts (async)
│   ├── foundation/                    # Bedrock tier (zero upward deps): config.service,
│   │                                  #   config-encryption, crypto-envelope,
│   │                                  #   credential-safety, secure-storage, window,
│   │                                  #   protocol, logging/, product-config
│   ├── controllers/                   # Business logic shared by IPC & HTTP
│   ├── http/                          # Remote Access: Express + WebSocket
│   │   └── routes/                    #   Per-domain route modules (*.routes.ts) +
│   │                                  #   _shared.ts (imports/helpers barrel) +
│   │                                  #   index.ts (thin aggregator). NO business logic.
│   ├── ipc/                           # IPC handlers (one module per domain)
│   │   └── rpc.ts                     #   registerRpcHandlers() — typed-RPC registrar
│   ├── apps/                          # Apps Layer (spec, manager, runtime, conversation-mcp)
│   ├── platform/                      # Platform Layer (store, scheduler, event, memory, background)
│   ├── openai-compat-router/          # Anthropic <-> OpenAI bridge
│   └── services/                      # Domain services — grouped by role:
│       ├── agent/                     # Agent engine — largest subsystem. See agent/DESIGN.md
│       ├── ai-browser/                # AI Browser + tools/
│       ├── ai-sources/                # Multi-provider auth + providers/
│       ├── analytics/                 # Usage analytics
│       ├── email-mcp/                 # Email-as-MCP tool server
│       ├── health/                    # Diagnostics & recovery
│       ├── logging/                   # Logging subsystem: controller (Developer Mode toggle)
│       │                              #   + transports (http-raw.log, halo-sdk.log) + redact utils.
│       │                              #   Single subscriber for config.agent.developerMode;
│       │                              #   transports expose setLevel/setEnabled only.
│       ├── notify-channels/           # Outbound notification channels (Email/WeCom/DingTalk/Feishu/Webhook)
│       ├── perf/                      # Performance monitoring
│       ├── stealth/                   # Anti-detection evasions
│       ├── web-search/                # Web search MCP server
│       └── *.service.ts + utilities   # Domain singletons: config, conversation, space,
│                                      #   artifact, artifact-cache, search, remote, tunnel,
│                                      #   window, overlay, onboarding, updater, notification,
│                                      #   protocol, api-validator, model-capabilities,
│                                      #   secure-storage, git-bash, git-bash-installer,
│                                      #   mock-bash, browser-view, browser-policy,
│                                      #   watcher-host
│                                      #   (+ utilities: browser-login-pages, proxy-fetch)
│
├── worker/                            # Utility processes (file-watcher)
├── shared/                            # Cross-process types, constants, protocols
│   ├── types/                         # ai-sources, artifact, health, notification-channels
│   ├── apps/                          # app-types, spec-types
│   └── constants/                     # providers, ignore-patterns
│
├── preload/
│   └── index.ts                       # Exposes HaloAPI to renderer (source of truth for IPC)
│
└── renderer/                          # React Frontend
    ├── App.tsx, main.tsx
    ├── api/                           # Unified API adapter (IPC or HTTP transport)
    ├── pages/                         # **All full-screen views** (one file per renderView case):
    │   │                              #   Convention: every case in App.tsx renderView()
    │   │                              #   must correspond to a file in pages/.
    │   ├── HomePage.tsx               #   Main conversation view
    │   ├── SpacePage.tsx              #   Space/project view
    │   ├── SettingsPage.tsx           #   App settings
    │   ├── AppsPage.tsx              #   Digital humans management
    │   ├── SplashPage.tsx             #   Startup splash screen
    │   ├── SetupPage.tsx              #   First-time login flow
    │   ├── GitBashSetupPage.tsx       #   Windows Git Bash installer
    │   ├── ServerConnectPage.tsx      #   Capacitor: add/connect to server
    │   └── ServerListPage.tsx         #   Capacitor: multi-server list
    ├── components/                    # UI sub-components by domain (NOT full-screen views):
    │   ├── apps/                      #   Apps management
    │   ├── canvas/                    #   Content Canvas + viewers/
    │   ├── chat/                      #   Chat stream + tool-result/
    │   ├── layout/                    #   Header, ModelSelector, SpaceSelector, etc.
    │   ├── settings/                  #   Settings sections
    │   ├── setup/                     #   Sub-components: LoginSelector, ApiSetup, ServerConnect
    │   ├── store/                     #   App Store UI
    │   ├── ui/                        #   Cross-domain interaction primitives (ConfirmDialog,
    │   │                              #   ContextMenu, ...). Not shadcn-generated, but follows
    │   │                              #   the same theme-token pattern. Home for any future
    │   │                              #   generic primitive (Toast, Popover, Tooltip, ...)
    │   ├── brand/, icons/, tool/, updater/, notification/
    │   ├── diff/, search/, pulse/, onboarding/, artifact/
    │   └── ErrorBoundary.tsx
    ├── stores/                        # Zustand stores (one per domain: app, chat, space, canvas,
    │   │                              # search, apps, apps-page, ai-browser, notification,
    │   │                              # onboarding, perf, server)
    │   └── server.store.ts            # Multi-server list for Capacitor (ServerEntry[])
    ├── hooks/                         # useIsMobile, useCanvasLifecycle, useLayoutPreferences,
    │                                  # useConfirmDialog, useFileOperations, useRemoteSubscription,
    │                                  # useMigration, useSmartScroll, useAsyncHighlight,
    │                                  # useAutoResize, useDataContent, useLazyVisible,
    │                                  # useSearchShortcuts
    ├── types/index.ts                 # All shared renderer types
    ├── lib/                           # utils (cn()), codemirror, highlight, perf
    ├── i18n/                          # Internationalization
    └── assets/styles/                 # globals.css, syntax-theme.css, canvas-tabs.css, browser-task-card.css
```

## 5) Data Types

**Primary source**: `src/renderer/types/index.ts` + `src/shared/types/`

Key types:

| Type | Description |
|------|-------------|
| `HaloConfig` | App config: `api`, `aiSources`, `permissions`, `appearance`, `system`, `remoteAccess`, `mcpServers`, `notifications`, `notificationChannels`, `agent`, `layout`, `chat` |
| `AISourcesConfig` | Multi-provider v2 format: `version`, `currentId`, `sources[]` |
| `ConversationMeta` | Lightweight list item (no messages) |
| `Conversation` | Full conversation with `messages`, `sessionId`, `version` |
| `Message` | Contains `content`, `toolCalls`, `thoughts` (null=separated), `images`, `tokenUsage`, `thoughtsSummary`, `metadata.fileChanges`, `error` |
| `Thought` | Agent reasoning: `thinking`, `text`, `tool_use`, `tool_result`, `system`, `result`, `error` |
| `ThoughtsSummary` | Lightweight summary: `count`, `types`, `duration` (for collapsed display without loading thoughts) |
| `ToolCall` | Tool invocation: `id`, `name`, `status`, `input`, `output`, `requiresApproval`, `description` |
| `Artifact` / `ArtifactTreeNode` | Files in space |
| `Space` | `id`, `name`, `icon`, `path`, `isTemp`, `workingDir?`, `preferences?` |
| `McpServerConfig` | MCP server: `stdio` / `http` / `sse` types |
| `CanvasContext` | AI awareness of open Canvas tabs |
| `PulseItem` / `TaskStatus` | Pulse panel task status tracking |
| `PendingQuestion` / `Question` | AskUserQuestion types |
| `TokenUsage` | Token usage stats: input/output/cache/cost |
| `CompactInfo` | Context compression notification |
| `FileChangesSummary` | Lightweight file changes in message metadata |

**Three-state `thoughts` field** in Message:
- `undefined` = no thoughts
- `null` = stored separately (not loaded yet)
- `Thought[]` = loaded or inline

## 6) IPC Channels

**Source of truth**: `src/preload/index.ts`. Read it for the complete channel list — it is the authoritative contract.

### Naming Convention

All channels follow `module:action` format. Modules are organized by functional area:

| Area | IPC modules |
|------|-------------|
| Auth & config | `auth`, `config`, `cli-config`, `model-capabilities` |
| Conversation & agent | `conversation`, `agent` |
| Space & artifact | `space`, `artifact`, `search` |
| Browser | `browser`, `browser-policy`, `ai-browser`, `overlay` |
| Apps & store | `app`, `store`, `onboarding` |
| IM channels | `im-channels`, `im-sessions`, `wecom-bot`, `weixin-ilink` |
| Transport & remote | `remote`, `notification-channels` |
| System & diag | `system`, `perf`, `health`, `git-bash` |

New IM/platform IPC modules should be added under the matching area. See §22 for the IM-specific rule (generic lifecycle vs brand-specific setup).

Two types:
- **Request/Response** (renderer → main): registered via `ipcMain.handle()`
- **Events** (main → renderer): pushed via `sendToRenderer()` / `broadcastToAll()`

### IPC Sync Checklist (Critical)

When adding a new IPC channel, update these files in sync:

| Action | Files |
|--------|-------|
| **New request API** | main handler (`ipc/*.ts`) + `preload/index.ts` + `renderer/api/index.ts` + HTTP route if remote-capable |
| **New event channel** | emitter in main + `preload/index.ts` listener + `renderer/api/transport.ts` methodMap + `renderer/api/index.ts` |

**Missing any of these will cause events to silently not reach the renderer process.**

## 7) State Flow & Multi-Platform Architecture

### Data Flow

```
Renderer (UI)
  → api adapter (IPC in Electron, HTTP in Web/Capacitor)
  → Main Process (controllers/services)
  → Agent Loop (@anthropic-ai/claude-code)
  → Events (IPC or WebSocket for remote/Capacitor)
  → UI Update
```

### Multi-Platform (Three Modes)

```
┌──────────────────────────────────────────────────────────┐
│                     Electron App                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐    │
│  │ Renderer │    │   Main   │    │   HTTP Server    │    │
│  │ (React)  │◄──►│ Process  │◄──►│   (Express)      │    │
│  │          │IPC │          │    │ ┌──────────────┐  │    │
│  └──────────┘    └──────────┘    │ │  WebSocket   │  │    │
│                                  │ │  REST API    │  │    │
│                                  └──────────────────┘    │
└──────────────────────────────────────────────────────────┘
                           ▲
                           │ HTTP/WS (data only)
                  ┌────────┴────────┐
                  ▼                 ▼
┌─────────────────────────┐  ┌────────────────────────────┐
│  Remote Web Client      │  │  Capacitor App (Mobile)    │
│  Same React App         │  │  Same React App            │
│  origin = server URL    │  │  Local assets (offline)    │
│  isRemoteClient() = ✓   │  │  Server URL = user config  │
└─────────────────────────┘  │  isCapacitor() = ✓         │
                             │  + Native: Notifications,  │
                             │    Camera, Preferences     │
                             └────────────────────────────┘
```

### Transport Layer (src/renderer/api/transport.ts)

Three-mode detection:

```typescript
isElectron():      'halo' in window                    → IPC
isCapacitor():     Capacitor.isNativePlatform()        → HTTP (configured URL)
isRemoteClient():  neither                             → HTTP (window.origin)
```

Capacitor-specific functions:
- `setServerUrl()` / `getServerUrl()` / `restoreServerUrl()` / `clearServerUrl()` — persist user-configured server address
- 401 handler dispatches `halo:auth-expired` DOM event (no page reload)
- WebSocket uses exponential backoff (1s→2s→4s→...→30s cap)
- `onWsStateChange()` — connection state events for UI reconnection banner

### API Adapter Pattern

```typescript
// src/renderer/api/index.ts
export const api = {
  getConfig: async () => {
    if (isElectron()) return window.halo.getConfig()  // IPC
    return httpRequest('GET', '/api/config')           // HTTP (remote + Capacitor)
  }
}
```

### Authentication (Remote & Capacitor)

1. Server generates 6-digit PIN on start
2. User enters PIN on login page → receives Token
3. Token stored in localStorage
4. All API requests include `Authorization: Bearer <token>`
5. On 401: Remote reloads page; Capacitor dispatches `halo:auth-expired` → server list

### Capacitor Mobile App

- **Build**: `vite.config.mobile.ts` → `dist-mobile/` → Capacitor syncs to `android/`
- **Entry point**: Same `src/renderer/` SPA, electron-log stubbed via alias
- **Multi-server management**: `server.store.ts` stores a list of `ServerEntry[]` (id, name, url, token)
  - `ServerListPage` shows all saved servers with online/offline status
  - `ServerConnectPage` handles the add-server flow (URL input + QR scan + access code)
  - Switching servers: disconnect WS → set active → reconnect + reinitialize
- **Notifications**: WebSocket events → `@capacitor/local-notifications` when `document.hidden`
- **Android back button**: navigates back from settings/apps/serverConnect, no-op on home/serverList
- **Scripts**: `npm run build:mobile`, `npm run cap:sync`, `npm run cap:run:android`

### WebSocket Events (Remote & Capacitor)

- Subscribe: `{ type: 'subscribe', payload: { conversationId } }`
- Receive: `{ type: 'event', channel: 'agent:thought', data: {...} }`

### Web/Capacitor Mode Limitations

Some features are disabled in non-Electron modes:
- Open file/folder (cannot access local filesystem)
- Artifact click-to-open → shows "Please open in desktop client" hint
- Browser views / embedded browser (desktop only)
- If a feature supports Web/Capacitor mode, handle the corresponding adapter and interface properly

## 8) Service Inter-Communication

Services use a **callback registration pattern** to avoid circular dependencies:

- `config.service.ts` provides `onApiConfigChange(callback)` registration
- `agent` service registers the callback at module load
- When API config changes (provider/apiKey/apiUrl), agent is automatically notified to clean up all V2 Sessions
- User's next message automatically creates a new Session with the updated config

**BrowserWindow lifecycle**: Always check `!mainWindow.isDestroyed()` before accessing `mainWindow`, especially in async callbacks and event listeners (the window may already be destroyed).

## 9) Content Canvas & Layout

### Components

```
ContentCanvas.tsx          # Main container + tab switching
├── CanvasTabs.tsx         # Tab bar (VS Code style)
└── viewers/
    ├── CodeViewer.tsx     # CodeMirror 6 with syntax highlighting
    ├── MarkdownViewer.tsx # react-markdown
    ├── HtmlViewer.tsx     # iframe srcdoc (avoids CSP issues)
    ├── ImageViewer.tsx    # Zoom/pan
    ├── JsonViewer.tsx     # Format/minify
    ├── CsvViewer.tsx      # Table view
    ├── TextViewer.tsx
    └── BrowserViewer.tsx  # Live web pages
```

### Layout Modes

- **No Canvas**: Chat fills the remaining center area between the left ArtifactRail and optional right ConversationList
- **With Canvas**: Narrow chat (user-configurable, stored in space preferences) + Content Canvas in the center area

### Interface Layout

- **Left rail**: Artifact Rail (file list; collapsible desktop rail, floating mobile overlay)
- **Center**: Chat Stream (conversation flow) + Content Canvas (content preview) when open
- **Right sidebar**: Conversation list (collapsible desktop sidebar, mobile history panel)

### Technical Decisions

- **HTML preview**: Uses `<iframe srcdoc>` instead of blob URLs (avoids CSP restrictions)
- **Fullscreen**: Calls `BrowserWindow.maximize()` for window-level maximization

## 10) AI Browser Module

AI-controlled embedded browser for web automation. Uses Electron BrowserView + CDP.

### 14 Browser Tools (consolidated from 28)

| Category | Tools |
|----------|-------|
| Navigation (2) | `browser_navigate` (URL-only; creates the first page automatically), `browser_wait_for` |
| Input (5) | `browser_click` (includes drag via `dragTo` param), `browser_fill` (includes batch via `elements` param), `browser_hover`, `browser_press_key`, `browser_upload_file` |
| Snapshot (3) | `browser_snapshot` (core!), `browser_screenshot`, `browser_evaluate` |
| Tab (1) | `browser_tab` (list/new/select/close actions) |
| Inspect (1) | `browser_inspect` (network + console, target param dispatch) |
| Script (1) | `browser_run` |
| Download (1) | `browser_download` |

Retired tools (code preserved for future extension): `browser_emulate`, `browser_resize`, `browser_perf_*`. See `src/main/services/ai-browser/DESIGN.md` for full architecture.

### Accessibility Tree (Core Innovation)

- Uses CDP `Accessibility.getFullAXTree` for page structure
- Each interactive element gets a unique UID (e.g., `snap_1_42`)
- AI references elements by UID — no CSS selectors needed
- Lower token cost than DOM parsing

## 11) Theme System

CSS variable-based theming. **Do not use hardcoded colors.**

- Follows shadcn/ui design pattern
- Uses CSS variables (`--background`, `--foreground`, `--primary`, etc.)
- Components reference colors via `hsl(var(--xxx))`
- Default system theme (respects OS preference), `.light` / `.dark` class overrides

```css
/* Correct */
bg-background, text-foreground, border-border
hsl(var(--primary)), hsl(var(--muted-foreground))

/* NEVER */
#ffffff, rgb(0,0,0), bg-gray-100, text-white (except on explicitly colored backgrounds)
```

Theme switch: `<html>` class toggle in `App.tsx`
Anti-flash: `index.html` inline script reads `localStorage('halo-theme')`

## 12) CSS Architecture: Tailwind First

**Use Tailwind by default.** Only use CSS files for what Tailwind can't handle:
- `@keyframes` animations
- Complex `::before` / `::after` pseudo-elements
- Nested selectors (`.parent:hover .child`)
- Third-party library overrides (e.g., highlight.js)

```
src/renderer/assets/styles/
├── globals.css           # Theme variables, @keyframes, base styles
├── syntax-theme.css      # highlight.js syntax colors
├── canvas-tabs.css       # VS Code style tab bar
└── browser-task-card.css # AI Browser effects
```

Do not create new CSS files unless the above exceptions apply.

## 13) Responsive Design (Mandatory)

**Web mode requires consideration of different platform displays.** This is non-negotiable for all UI changes.

- **Unified mobile breakpoint**: Use Tailwind's `sm:` breakpoint (640px) as the boundary between mobile and desktop
- **Prefer Tailwind responsive classes**: Use `sm:`, `md:`, `lg:`, etc.; minimize JavaScript detection logic
- **Mobile-first adaptation**: Focus on mobile adaptation (< 640px); large screens are not a priority
- **Web and Electron consistency**: Web browser and Electron desktop share the same responsive solution
- **Hook**: `useIsMobile()` hook exists for cases where JS detection is needed (avoid when Tailwind classes suffice)

```tsx
/* Correct: responsive with Tailwind */
<div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
<div className="w-full sm:w-80 sm:min-w-[320px]">
<div className="hidden sm:block">  /* desktop only */
<div className="sm:hidden">         /* mobile only */

/* Wrong: no responsiveness */
<div className="flex flex-row gap-4">
<div className="w-80">
```

## 14) OpenAI Compatible Mode

When `provider = openai`:

```
SDK (Anthropic format)
  → openai-compat-router (localhost)
  → Convert to OpenAI /v1/chat/completions
  → External OpenAI-compatible API
  → Convert response back to Anthropic format
  → SDK receives standard response
```

Location: `src/main/openai-compat-router/`

## 15) Local Storage Layout

```
~/.halo/
├── config.json                 # Global config (API/permissions/theme/remote access/etc.)
├── spaces-index.json           # Space ID -> path registry (v2 format)
├── temp/                       # Halo temporary space (id: halo-temp)
│   ├── artifacts/
│   └── conversations/
└── spaces/                     # All dedicated spaces (centralized storage)
    └── <uuid>/                 # Space identified by UUID
        └── .halo/
            ├── meta.json       # Space metadata (id/name/icon/timestamps/workingDir)
            └── conversations/
                ├── <id>.json           # Conversation data (lightweight, no thoughts)
                └── <id>.thoughts.json  # Separated thoughts data (lazy-loaded)
```

**Credential master key (enterprise builds only):** when `security.credentialAtRestSafe`
is enabled, a random 32-byte key is persisted at `<userData>/cred.key` (Electron
`app.getPath('userData')`, e.g. `~/Library/Application Support/<App>/cred.key` on
macOS — separate from `~/.halo`). It is the KEK for at-rest credential encryption
(`src/main/http/auth/envelope.ts`). Generated once on first run, never rotated
automatically, and never regenerated if present (regenerating would orphan all
stored ciphertext). Absent/no-op on open-source builds.

### Space Path Architecture

Spaces have two distinct paths:
- **`path`** (data path): Always centralized under `~/.halo/spaces/{uuid}/`. Used for conversations, meta.json, and all persisted data.
- **`workingDir`** (optional): The user's project directory for custom/project-linked spaces. Used as agent cwd, artifact scanning root, and file explorer target.

For default spaces (no custom path), `workingDir` is undefined and `path` serves both purposes.

Notes:
- **Legacy custom-path spaces**: Created before centralized storage, `path` points to the project directory with `.halo/` inside it. These continue to work without migration.
- **Lazy-loaded conversations**: `conversation.service.ts` uses `index.json` for fast listing; full conversation data is loaded only when entering a conversation.
- **Thoughts separation**: Thoughts data (~97% of file size) stored in separate `.thoughts.json` files, loaded on-demand when user clicks to expand.

## 16) Startup / Shutdown Lifecycle

### Three-tier startup architecture

| Tier | Phase | Failure impact | Typical tasks |
|------|-------|----------------|---------------|
| **Tier 1 Essential** | Blocks first screen | Fatal | IPC handler registration, window creation |
| **Tier 2 Extended** | After first screen, non-blocking | Feature unavailable | IM connections, scheduler, app activation |
| **Tier 3 Idle** | After Tier 2 completes | Invisible to user | Default app seed, analytics snapshot |

### Startup phases

1. `app.whenReady()` creates window and initializes core app directories.
2. `initializeEssentialServices()` runs synchronously for first-screen features. **(Tier 1)**
3. After `ready-to-show`, `initializeExtendedServices()` registers deferred handlers/services. **(Tier 2)**
4. `initializeExtendedServices()` triggers `initPlatformAndApps()` asynchronously:
   - Phase 0: `initStore()`
   - Phase 1 (parallel): `initScheduler({ db })`, `initEventBus()`, `initMemory()`
   - Source wiring: register `FileWatcherSource` to event-bus
   - Phase 2: `initAppManager({ db })`
   - Phase 3: `initAppRuntime({ db, appManager, scheduler, eventBus, memory, background })`
   - Start loops only after wiring: `scheduler.start()`, `eventBus.start()`
5. After `scheduler.start()`, idle tasks are registered and drained sequentially. **(Tier 3)**
   - Each task yields to the event loop via `setImmediate` between executions.
   - Failures are logged as warnings and never interrupt the queue or the process.
   - Implemented in `src/main/bootstrap/idle-queue.ts` (`registerIdleTask`, `startIdleDrain`).

### Shutdown behavior

- `before-quit` calls `cleanupExtendedServices()` via bootstrap shutdown flow.
- `window-all-closed` keeps process alive when `background.shouldKeepAlive()` is true.
- Cleanup order includes runtime/manager, platform modules, background, and cache cleanup.

## 17) Integration Surfaces

- **IPC handlers**: `src/main/ipc/*.ts` (Apps entry: `src/main/ipc/app.ts`, Store entry: `src/main/ipc/store.ts`)
- **HTTP routes**: `src/main/http/routes/index.ts`
- **WebSocket broadcast**: `src/main/http/websocket.ts`
- **Preload bridge**: `src/preload/index.ts` (`window.halo` contract)
- **Renderer unified API**: `src/renderer/api/index.ts`
- **Renderer transport mode switch**: `src/renderer/api/transport.ts`

Desktop mode: renderer -> preload -> IPC -> main.
Remote mode: renderer -> HTTP/WS -> main.

## 18) Logging

**Production logging requirements:**
- **Must ensure full-process logging in production** to trace every execution stage
- Log all process stages and execution steps throughout the entire flow
- Include timestamps, context information, and error stack traces
- Use structured logging for easier filtering and analysis
- Keep logging lightweight — avoid any unnecessary computation solely for log output

## 19) Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 29 |
| UI | React 18 + TailwindCSS 3.4 |
| State | Zustand 4.5 |
| i18n | i18next 25.7 |
| Code Editor | CodeMirror 6 |
| Markdown | react-markdown 10 + remark-gfm + rehype-highlight |
| Diff | diff + react-diff-viewer-continued |
| HTTP | Express 5 |
| WebSocket | ws 8 |
| Agent | @anthropic-ai/claude-code (claude-agent-sdk) |
| Icons | lucide-react |
| Build | electron-vite 2 + Vite 5 |

## 20) Known Contract Gaps

See `quick.md §4` for the current list. Keep the two documents in sync when closing or opening gaps.

## 21) Deep-Dive Module Docs

When touching a module, read its design doc first:
- `src/main/services/agent/DESIGN.md` — Agent engine (largest subsystem, read this before any agent-related change)
- `src/main/apps/spec/DESIGN.md`
- `src/main/apps/manager/DESIGN.md`
- `src/main/apps/runtime/DESIGN.md`
- `src/main/apps/spec/PROTOCOL.md`
- `src/main/platform/store/DESIGN.md`
- `src/main/platform/scheduler/DESIGN.md`
- `src/main/platform/memory/DESIGN.md`
- `src/main/platform/background/DESIGN.md`

## 22) IM Integration (Plugin Architecture)

### 22.1 Scale Intent

Halo targets **dozens** of IM platforms (WeCom Bot, WeChat ilink, Feishu, DingTalk, Telegram, Discord, Slack, Line, QQ, ...). All IM integrations share a **single plugin-style contract** — there is no "main IM", no brand is architecturally privileged, and the manager knows nothing about any specific IM.

### 22.2 Contracts (src/shared/types/im-channel.ts + inbound-message.ts)

```
ImChannelProvider  — type-level driver (one per IM brand)
  ├── type, displayName, description, direction
  ├── configFields, defaultConfig        # drives settings UI
  ├── createInstance(id, config) → Instance
  └── validateConfig(config) → string | null

ImChannelInstance  — running connection (N per provider type)
  ├── start() / stop() / reconnect() / isConnected()
  ├── pushToChat(chatId, text, chatType)
  ├── onInbound(handler)
  └── fileCapability?                    # opt-in file send

ImChannelManager   — provider-agnostic lifecycle
  ├── registerProvider(provider)
  ├── applyConfig(configs, onInbound)    # diff + hot-reload
  └── zero branches on ImChannelType

InboundMessage / ReplyHandle  — normalized upward protocol
  All providers convert brand-specific payloads to this shape
  before anything reaches dispatch-inbound or runtime.
```

### 22.3 Hard Rules (Non-Negotiable)

1. **Provider is the only extension point.** Adding support for a new IM = create a new `*.provider.ts` implementing `ImChannelProvider`. Do NOT modify `manager.ts`, `dispatch-inbound.ts`, or any existing provider.
2. **Manager must stay provider-agnostic.** `ImChannelManager` must contain zero branches on `ImChannelType`. If you feel the urge to add `if (type === 'xxx')` in manager, the logic belongs in a provider method.
3. **Never bypass the normalized inbound contract.** All inbound messages flow through `InboundMessage` / `ReplyHandle`. Never pass provider-specific payload shapes upward. If a new IM carries data the current contract can't express, extend the shared contract — do not leak provider specifics.
4. **Providers own their resources.** Each provider manages its own temp files / tokens / connection state, and registers cleanup via the standard extension point (`cleanupImChannelTempFiles()` in `runtime/im-channels/index.ts`). Do not hard-code provider paths in bootstrap.
5. **IPC is split by responsibility, not by brand.** `ipc/im-channels.ts` (generic lifecycle) and `ipc/im-sessions.ts` (generic session management) are the provider-agnostic entries. Brand-specific IPC files (`wecom-bot.ts`, `weixin-ilink.ts`) only expose setup/auth flows unique to that brand (e.g., QR login, token refresh). Generic operations MUST use the generic entries.
   - Warning sign: adding a channel-level operation to `wecom-bot.ts` instead of `im-channels.ts` is almost always a violation.

### 22.4 Adding a New IM — Recipe

1. Create `src/main/apps/runtime/im-channels/<brand>.provider.ts` implementing `ImChannelProvider`.
2. Register it in `src/main/apps/runtime/index.ts` via `manager.registerProvider(new XxxProvider())`.
3. Extend the `ImChannelType` union in `src/shared/types/im-channel.ts`.
4. If the brand has unique setup/auth flow (QR, OAuth, token refresh): add `ipc/<brand>.ts` + preload + renderer API + a setup UI component. Keep this file minimal — only brand-unique flows belong here.
5. If the provider writes temp files: add a cleanup call in `cleanupImChannelTempFiles()`.
6. Do NOT change `manager.ts`, `dispatch-inbound.ts`, or any other existing provider.

### 22.5 Inter-Module Access

To avoid circular imports between `dispatch-inbound` and `runtime/index`, the manager is exposed via a module-level accessor in `runtime/im-channels/index.ts`:

- `setActiveImChannelManager(manager)` — called by runtime/index after creation
- `getActiveImChannelManager()` — called by dispatch-inbound / any provider that needs cross-instance lookup

Providers needing manager reference MUST use this accessor, not direct import of runtime/index.

## 23) Typed RPC (request/response contracts)

A request/response IPC operation is historically hand-written in up to five
places (ipcMain.handle + preload bridge + renderer transport map + renderer api
adapter + HTTP route), kept in sync by a manual checklist. The typed-RPC layer
collapses the boilerplate: declare each operation **once** as a contract, then
derive the main-side handler registration and the preload invokers from it, so
the surfaces cannot drift.

### 23.1 Pieces

- `src/shared/rpc/define.ts` — `rpcMethod<Args, Result>(channel)` + `RpcContract`,
  `RpcHandlers<C>`, `RpcClient<C>` inference types. Dependency-free, renderer-safe.
- `src/shared/rpc/contracts/*.contract.ts` — one contract per domain; exposed
  method names match the existing `window.halo.*` surface.
- `src/main/ipc/rpc.ts` — `registerRpcHandlers(contract, handlers, logTag)`:
  wraps each impl in the `{ success, data } | { success, error }` envelope.
- `src/preload/index.ts` — `bindRpc(contract)` spreads typed invokers into the
  `halo` object.

### 23.2 Reference migration

`model-capabilities` is the pilot (see `ipc/model-capabilities.ts`,
`shared/rpc/contracts/model-capabilities.contract.ts`). The IPC handler dropped
from ~70 to ~35 lines and the preload entries are now contract-derived.

### 23.3 Migrating another domain

1. Add `src/shared/rpc/contracts/<domain>.contract.ts` with `rpcMethod` entries
   whose keys are the exposed `window.halo.*` names and whose channel strings
   match the existing channels (keep them identical to preserve behavior).
2. Replace the domain's `ipc/<domain>.ts` body with `registerRpcHandlers(...)`.
3. In `preload/index.ts`, spread `...bindRpc(<domain>Rpc)` and delete the manual
   invoke wrappers (keep the `HaloAPI` interface entries — they document the
   surface and are type-checked against the contract).
4. Leave `renderer/api/index.ts` (the IPC/HTTP adapter) and `http/routes/*` as
   they are unless the domain is also being moved onto a generated HTTP binding —
   the renderer↔main round-trip must be validated with the app running, since
   build/tsc verify compilation but not live channel behavior.
