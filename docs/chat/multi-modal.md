# Multi-Modal Render Targets

CIR is not text-only. Modern agents render across modalities. Each modality is a different render target with its own component catalog and rendering rules.

---

## Text fallback (every manifest must have one)

Every manifest must be renderable as text. This is a hard requirement, not a courtesy.

Why: voice agents, accessibility tools, screen readers, terminal UIs, low-bandwidth contexts, and graceful degradation all need a text representation. A `BookingForm` component might render as:

```
─────────────────────
Booking confirmation
─────────────────────
Flight: SFO → NRT, Apr 30
Time: 11:30 AM
Class: Premium economy
Price: $1,840

Continue? [yes / no / modify]
```

The component catalog defines `text_render` for every component. The runtime decides whether to use the text or visual rendering based on context.

---

## Inline UI (the chat default)

Components rendered inside chat messages. Most common pattern in 2026.

**Constraints:**

- Bounded width (typically 600-800px)
- Bounded initial height (with scroll for overflow)
- Sandboxed (iframe or constrained component runtime)
- Stateful but ephemeral (state lives in conversation, dies with conversation)
- Action results flow back as conversation messages

**Best for:** forms, choices, confirmations, structured data displays, multi-step flows.

**Bad for:** complex spatial layouts, large data tables, anything requiring multiple panels.

---

## Voice (audio-only)

The manifest is a script tree, not a layout. The runtime is a TTS+ASR loop.

```json
{
  "render_target": "voice",
  "script": {
    "intro": "I found three flights matching your search.",
    "options": [
      { "speak": "Option one: United at 11:30 AM, $1,840 in premium economy." },
      { "speak": "Option two: ANA at 1:15 PM, $1,920 in premium economy." },
      { "speak": "Option three: JAL at 4:45 PM, $2,100 in premium economy." }
    ],
    "prompt": "Which would you like? You can say one, two, three, or none.",
    "branches": {
      "one|first|united": { "action": "select_option", "args": { "id": "flt_001" } },
      "two|second|ana": { "action": "select_option", "args": { "id": "flt_002" } },
      "three|third|jal": { "action": "select_option", "args": { "id": "flt_003" } },
      "none|nope|skip": { "action": "abort_booking" }
    },
    "fallback": "Sorry, I didn't catch that. Please say one, two, three, or none.",
    "timeout": "30s",
    "confirm_destructive": "always"
  }
}
```

Voice rendering has stricter confirmation rules: any action with `side_effects` containing payment, send, or destructive must be re-confirmed verbally before execution. The user must utter a confirmation phrase, not just acknowledge.

---

## Mixed-modal (the rich case)

A single turn can render multiple modalities. The agent speaks a summary while the chat renders a visual component while a notification fires on the user's phone.

```json
{
  "render_target": "mixed",
  "renderings": [
    { "target": "voice", "content": "I found a flight matching your filters." },
    { "target": "inline_chat", "manifest_ref": "m_flight_options" },
    { "target": "push_notification", "content": "Flight options ready in your chat" }
  ]
}
```

The runtime delivers each rendering to its appropriate channel.

---

## Image input as intent signal

Modern agents accept image input. In CIR, an image is parsed into intent:

```
User uploads screenshot of email + says "make this into a task"
  ↓
Multi-modal model parses image → extracts text + structure
  ↓
Compiler treats parsed content as conversational input
  ↓
Generates manifest with TaskCreate component pre-filled
  ↓
User reviews + confirms
```

The image itself is _not_ part of the manifest. It's pre-processed into structured intent before compilation.

---

## AR / spatial (future-proofing)

The manifest format should anticipate spatial render targets. Vision Pro, AR glasses, holographic displays will all eventually be CIR runtimes. The component catalog will need spatial primitives: `WorldAnchoredCard`, `GazeTarget`, `HandRayInteraction`. The framework's pattern — declarative manifest, render-target-specific runtime — works here without architectural changes.
