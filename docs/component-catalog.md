# Component Catalog

The component catalog is what gives Atelier coverage. A well-designed catalog of 83 primitives covers most of what web apps do.

---

## The baseline catalog

**Layout (8)**: Container, Stack, Split, Grid, Tabs, Accordion, Modal, Drawer

**Display (12)**: Table, List, Card, DetailView, StatCard, Chart (line/bar/pie/area), Timeline, Map, Tree, Markdown, CodeView, DiffView

**Input (12)**: TextInput, NumberInput, DateInput, TimeInput, Select, MultiSelect, Toggle, Slider, FileUpload, RichText, CodeEditor, Search

**Navigation (6)**: NavBar, Sidebar, Breadcrumb, Pagination, Stepper, CommandPalette

**Feedback (6)**: Alert, Toast, Spinner, Progress, Skeleton, EmptyState

**Action (4)**: Button, ButtonGroup, ActionMenu, ConfirmDialog

**Specialized (8)**: Kanban, Calendar, ChatThread, Form, Wizard, FilterBar, KPIRow, Gallery

The current synced registry contains 83 components. With composition rules (a Stack of Cards is a Feed; a Grid of StatCards is a Dashboard; a Stack of FilterBar + Table is a database UI), you cover the vast majority of web app patterns.

---

## Composition rules

Each component declares what it can contain and what it can be contained by:

```json
{
  "Stack": {
    "can_contain": "*",
    "min_children": 1,
    "max_children": 50,
    "props": { "direction": ["vertical", "horizontal"], "gap": "spacing_token" }
  },
  "Card": {
    "can_contain": ["Stack", "Grid", "DetailView", "Markdown", "Chart"],
    "props": { "title": "string?", "actions": "Action[]?" }
  },
  "Form": {
    "can_contain": [
      "TextInput",
      "NumberInput",
      "DateInput",
      "Select",
      "MultiSelect",
      "FileUpload",
      "RichText"
    ],
    "auto_actions": ["submit", "cancel"],
    "validation": "schema-driven"
  }
}
```

The compiler uses these rules to produce valid manifests. The runtime enforces them on render.

---

## Domain extensions

A general catalog covers 90%. The remaining 10% lives in domain-specific extensions:

- **Email apps**: ThreadView, ComposeBox, AttachmentTile
- **Calendar apps**: WeekView, MonthView, AvailabilityGrid
- **Code apps**: PullRequestView, CommitTimeline, FileTree
- **CRM apps**: PipelineBoard, ContactCard, OpportunityRow
- **Project mgmt**: SprintBoard, BurndownChart, EpicTree
- **Finance apps**: TransactionList, PortfolioGrid, AccountSummary
- **Analytics apps**: DimensionPivot, MetricSelector, CohortChart

The baseline plus a small number of honest domain primitives = full coverage for that domain.

---

## Why component catalogs beat free-form HTML

Three reasons:

1. **Token cost**: a component name is 1-3 tokens; the equivalent HTML/CSS/JS is hundreds.
2. **Safety**: components are pre-vetted for accessibility, responsive behavior, security (no XSS, no third-party leakage).
3. **Consistency**: the user gets a coherent experience because all components share design tokens, interaction patterns, motion, and a11y conventions.

Free-form HTML generation (à la early v0/Bolt) is great for vibe-coding net-new apps. For modifying an existing app's interface continuously, a constrained component vocabulary wins on every dimension that matters.

---

## Text fallback (required)

Every component must declare a `text_render` for accessibility, voice, terminal UI, and graceful degradation. See [`chat/multi-modal.md`](chat/multi-modal.md) for the full rationale.

For chat/inline rendering, the same catalog is reused but constrained to a chat-aware subset. See [`chat/render-targets.md`](chat/render-targets.md).
