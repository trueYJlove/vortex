# Chat Message Avatar + Label System

## Problem

User and assistant messages are visually similar in long conversations. The current subtle gradient difference is easy to miss, especially when scrolling back through chat history.

## Goal

Add avatar icons and text labels above each message bubble so that speaker identity is immediately clear at a glance, regardless of conversation length.

## Design

### Visual Layout

Each message bubble gets a header row above it containing an icon and a text label.

**User messages (right-aligned):**
```
                   You  [icon]
  ┌─────────────────────────┐
  │  message content here   │
  └─────────────────────────┘
```

**Vortex messages (left-aligned):**
```
  [icon]  Vortex
  ┌─────────────────────────┐
  │  message content here   │
  └─────────────────────────┘
```

### Element Specifications

| Element | Spec |
|---------|------|
| Avatar size | 24x24px circle |
| Avatar background | `bg-primary/15` with `border border-primary/30` |
| Label text | 12px, `text-primary`, font-weight 500 |
| Icon stroke | Primary color, 2px stroke |
| Gap between icon and label | 6px |
| Gap between label row and bubble | 6px |

### Icon Selection

- **User**: Lucide `User` icon (person silhouette)
- **Vortex**: Lucide `Bot` icon (robot head)
- Both are SVG icons from the existing lucide-react library — no new dependencies

### Bubble Corner Radius

- **User bubble**: Asymmetric — `rounded-[16px_16px_4px_16px]` (corner near label row is smaller)
- **Vortex bubble**: Asymmetric — `rounded-[16px_16px_16px_4px]` (corner near label row is smaller)

### Responsive Behavior

- Mobile (< 640px): Avatar 20x20px, label 11px
- Desktop (>= 640px): Avatar 24x24px, label 12px

### Edge Cases

- **Streaming state**: Avatar + label visible during streaming; no special handling needed
- **Empty content**: If message has no content (e.g., tool_use only), avatar + label still show above the bubble
- **isInContainer mode**: Avatar + label still render — they provide identity context even in nested views
- **Error-only messages**: Avatar + label show above the error bubble

## Implementation

### Files to Modify

1. **`src/renderer/components/chat/MessageItem.tsx`**
   - Add avatar + label header row above the bubble
   - Wrap existing bubble content in a container that includes the header
   - Use existing `isUser` flag to determine which avatar/label to render
   - Import `User` and `Bot` from lucide-react (Bot already imported, User needs adding)

2. **`src/renderer/i18n/locales/en.json`**
   - Add `"You": "You"`
   - Add `"Vortex": "Vortex"`

3. **`src/renderer/i18n/locales/zh-CN.json`**
   - Add `"You": "我"`
   - Add `"Vortex": "Vortex"` (brand name, keep English)

### Component Structure

```tsx
// New: MessageHeader component (inline in MessageItem.tsx)
function MessageHeader({ isUser }: { isUser: boolean }) {
  const { t } = useTranslation()
  return (
    <div className={`flex items-center gap-1.5 mb-1.5 ${
      isUser ? 'justify-end' : 'justify-start'
    }`}>
      {isUser && <span className="text-xs text-primary font-medium">{t('You')}</span>}
      <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center
        ${isUser
          ? 'bg-primary/15 border border-primary/30'
          : 'bg-primary/15 border border-primary/30'
        }`}>
        {isUser
          ? <User size={12} className="text-primary" />
          : <Bot size={12} className="text-primary" />
        }
      </div>
      {!isUser && <span className="text-xs text-primary font-medium">{t('Vortex')}</span>}
    </div>
  )
}
```

### Render Position

In the `bubble` variable (MessageItem.tsx), the header renders inside the outer `<div>` but before the existing content:

```tsx
<div className={`rounded-2xl px-4 py-3 ${isUser ? 'message-user' : 'message-assistant'} ...`}>
  {/* NEW: Avatar + Label */}
  <MessageHeader isUser={isUser} />

  {/* Existing content follows unchanged */}
  ...
</div>
```

## i18n

New translation keys (added via `npm run i18n`):

| Key | en | zh-CN |
|-----|----|-------|
| `You` | You | 我 |
| `Vortex` | Vortex | Vortex |

Brand name "Vortex" stays in English across all locales.

## Verification

- Build with `npx electron-vite build`
- Run `npm run i18n` to sync translations
- Visually verify at both mobile (< 640px) and desktop widths
- Check all message states: user, assistant, streaming, error, empty content
