# The Five Render Targets

Atelier manifests render to multiple surfaces. The same compiler can produce manifests for any of them — what changes is the component catalog, the runtime, and the layout primitives.

---

## Target 1: Full-app web

Browser-based web app with persistent routes. Core Atelier document covers this in detail.

- **Runtime**: web SDK in the browser
- **Cache**: IndexedDB + memory
- **Components**: standard web component catalog
- **Layout**: route-based, full-viewport

## Target 2: Native (iOS / Android / desktop)

Mobile or desktop app rendering manifests with native components.

- **Runtime**: SwiftUI / Compose / Tauri SDK
- **Cache**: native KV + memory
- **Components**: native component catalog (parallel to web)
- **Layout**: screen-based, follows platform conventions

## Target 3: Embedded chat panel

A chat sidebar or panel inside a host app (e.g., a chat sidebar in Linear, an AI panel in Notion).

- **Runtime**: web SDK embedded in host app
- **Cache**: shared with host or sandboxed (depends on host)
- **Components**: chat-aware component subset
- **Layout**: vertical scroll, message-aligned, fixed width

## Target 4: Inline chat (the MCP Apps surface)

Manifest rendered as a component _inside_ a chat message in a host like Claude.ai or ChatGPT. This is what MCP Apps and OpenAI Apps SDK enable today.

- **Runtime**: provided by the chat host (Claude.ai, ChatGPT)
- **Cache**: per-conversation, lives in conversation context
- **Components**: a constrained subset that fits in a message bubble
- **Layout**: bounded width, height-constrained, sandboxed iframe

This is the most important new target in Atelier. It changes what UI even means: instead of a page or a screen, UI is a component that lives inside a single chat turn, can be interacted with, and produces results that flow back into the conversation.

## Target 5: Voice (audio-only)

The agent operates over voice. There is no visual UI; the manifest describes a _spoken interaction_ rather than a rendered surface.

- **Runtime**: voice agent (Siri-like, custom voice app, phone IVR)
- **Cache**: short conversational memory
- **Components**: voice prompts, confirmation phrases, action verbs
- **Layout**: temporal (sequence of utterances), not spatial

A "manifest" here is a script tree: at this point, ask this; if the user says X, branch to Y; on confirmation, call this capability. Every Atelier action with a voice-render target needs an audio confirmation policy.

---

## Render-target negotiation

A capability and skill set should not be tied to a single render target. The compiler chooses the target based on the runtime requesting compilation:

```json
POST /compile
{
  "user_id": "vid",
  "app_id": "mail.example.com",
  "intent": "show me decisions to make today",
  "render_target": {
    "type": "inline_chat",
    "host": "claude.ai",
    "max_height_px": 600,
    "supports_actions": ["button", "form", "select"],
    "sandbox": "iframe_v1"
  }
}
```

The compiler returns a manifest constrained to what the target can render. The same intent against `render_target: { type: "voice" }` returns a script tree.

For the multi-modal rendering rules (text fallback, mixed-modal, image input, AR), see [`multi-modal.md`](multi-modal.md).
