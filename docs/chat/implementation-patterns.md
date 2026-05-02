# Implementation Patterns

Eight patterns that recur in production Atelier-for-chat deployments.

---

## Pattern 1: Generative UI in chat (the basic case)

User asks a question. Agent responds with text + an inline component.

```
User: "What flights are available to Tokyo next weekend under $2K?"

Agent compiles manifest with:
  - Brief text explanation
  - FlightTable component (sortable, filterable)
  - Action: "Book this flight" (with confirmation)

Renders inline in chat. User interacts within component. Selection becomes a new turn.
```

This is the most common pattern. It applies whenever the answer has structure.

---

## Pattern 2: Progressive workflow UI

Multi-step process where each step's UI is generated based on prior steps.

```
Turn 1: "I need to onboard a new employee"
  → Agent renders: OnboardingStart (collect basic info)

Turn 2: User submits basic info
  → Agent renders: RoleSpecificForm (different fields per role)

Turn 3: User completes role form
  → Agent renders: PermissionsReview (proposed access based on role)

Turn 4: User confirms
  → Agent executes capabilities (create account, grant access, send welcome)
  → Agent renders: OnboardingComplete (summary + next steps)
```

Each step's manifest is a delta on the previous. Most context is preserved across steps.

---

## Pattern 3: Voice-first agent calling typed capabilities

User talks to a voice agent. Agent calls Atelier capabilities under the hood.

```
User (voice): "Book me the cheapest flight to Tokyo next Friday"

Agent:
  1. Calls flight.search with constraints
  2. Identifies cheapest result
  3. Compiles voice manifest:
     "I found Singapore Airlines at $1,640 for next Friday at 11:30 AM.
      It's a 12-hour direct flight in economy. Should I book it?"
  4. Waits for confirmation
  5. On verbal "yes":
     - Repeats key details: "Booking Singapore Airlines, Friday May 9, 11:30 AM, $1,640. Confirming."
     - Calls flight.book
     - Confirms: "Booked. Confirmation number: ABC123. I've added it to your calendar."
```

Capabilities are typed; voice manifest is the script tree. Same capability set could render visually in chat.

---

## Pattern 4: Agent-to-agent negotiation

Primary agent delegates a sub-task; sub-agent uses its own capabilities and returns a manifest fragment.

```
User: "Plan my Tokyo trip"

Primary agent:
  → Delegate to travel sub-agent (with scope: read-only flight + hotel search)

Travel sub-agent:
  - Calls flight.search → 12 options
  - Calls hotel.search → 28 options
  - Compiles a fragment manifest: TravelOptionsView with both
  - Returns to primary agent

Primary agent:
  - Receives fragment
  - Composes into a parent manifest with: trip overview + travel options + budget summary
  - Renders to user
  - Action: "Book this combination" → routes to sub-agent with elevated scope (write access)
    only after user confirmation
```

Permission boundaries enforced at the bus. Sub-agent never sees capabilities outside its scope.

---

## Pattern 5: Background agent with deferred UI

Autonomous agent runs on schedule; produces a manifest delivered to the user later.

```
Agent: "Daily morning brief"
Schedule: Weekdays at 7am

At 7am:
  - Agent runs (no user present)
  - Calls capabilities: read overnight email, summarize, classify
  - Calls capabilities: read calendar for today
  - Calls capabilities: check weather, traffic
  - Compiles manifest: MorningBrief
  - Stores in user's "delivered briefs" inbox
  - Sends push notification

When user opens chat:
  - Manifest is already cached
  - Renders instantly: today's calendar, urgent emails, weather, suggested focus
```

Background agents have separate audit logs and separate token budgets.

---

## Pattern 6: Multi-modal handoff

Conversation starts in one modality, hands off to another mid-flow.

```
User starts in voice (driving): "Find me a flight to Tokyo Friday under $2K"
Agent (voice): "I found 5 options. I've sent them to your phone for review."
  → Compiles two manifests:
     - Voice manifest: brief acknowledgment
     - Chat manifest: full FlightTable, sent as push to phone
User (later, on phone): opens push, reviews FlightTable in chat, selects option
Agent (chat): "Booking Singapore Airlines for $1,640. Confirm?"
User: confirms
Agent (chat + voice if device allows): "Booked."
```

The conversation thread persists across modalities. The manifest evolves to fit each render target.

---

## Pattern 7: Long-running agent with intermediate UI

Some tasks take minutes or hours. The user shouldn't wait staring at a spinner.

```
User: "Research and write a 5-page report on Q2 competitor moves"

Agent:
  - Compiles manifest: ResearchProgress (with live status updates)
  - Returns immediately, UI shows: "Working on it. I'll update this as I go."
  - Background: searches web, calls capabilities, drafts sections
  - Updates manifest in place via streaming:
    - "Searched 47 sources. Identified 8 key competitors."
    - "Drafted intro and methodology."
    - "Drafted competitive landscape section."
    - "Final draft ready. Click to review."
  - Final UI: ReportPreview (with download, edit, share actions)

User can leave the chat and return to find updated manifest.
```

The runtime supports streaming manifest updates. Users see progress without polling.

---

## Pattern 8: Embedded mini-app within a message

A complete mini-application rendered inside a single chat message.

```
User: "Help me decide between three job offers"

Agent compiles manifest: OfferComparator
  - Three columns (one per offer)
  - Rows: salary, equity, role, location, manager, growth
  - Weighted-scoring tool (user adjusts weights, scores update live)
  - Notes section per offer
  - Final action: "Save my decision" → stores to vault, returns to conversation

User interacts within the mini-app for 20 minutes. Conversation pauses.
On save, the mini-app emits a result message back to the conversation:
  "I've decided to take Offer #2. Here's why: [reasoning]"
Agent: "Great. Want help drafting an acceptance email?"
```

The mini-app is the manifest; the chat is the host. The interaction inside the manifest doesn't bloat conversation context.
