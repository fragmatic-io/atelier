# Token Economics for Conversations

Web app token economics are dominated by compilation cost. Chat token economics are dominated by **conversation context cost**. Different optimization strategies apply.

For the core (web/native) economics, see [`../token-economics.md`](../token-economics.md).

---

## The cost equation in chat

```
Total cost per conversation =
  (turns × per-turn context cost)
  + (compilations × compilation cost)
  + (tool calls × tool result cost)
```

For a typical 20-turn conversation:

| Cost source                              | Tokens   | Cost (Sonnet) |
| ---------------------------------------- | -------- | ------------- |
| Per-turn context (10K avg × 20 turns)    | 200K     | $0.60         |
| Compilations (2 average × 8K)            | 16K      | $0.05         |
| Tool result inclusion (5 calls × 2K avg) | 10K      | $0.03         |
| **Total**                                | **226K** | **$0.68**     |

The dominant cost is _context_, not compilation. Optimization strategies must target context first.

---

## The manifest as context compression

A well-designed manifest is _more compressed_ than the equivalent verbose conversation context. Instead of:

```
Agent: I found 47 flights. Here are the first 5: ...
[5 turns of back and forth scrolling through options]
User: Show me only United flights under $2000
Agent: Here are the United flights under $2000: ...
[verbose listing]
```

You have:

```
Manifest reference: m_flights_001 (rendered as TravelTable)
User interaction (in component, not chat): filter by airline=United, price<2000
Conversation: User selected option 3 from filtered table
```

The manifest holds the data and structure. The conversation only carries the high-level decisions. Total tokens: 5x less.

This insight flips how you think about manifests in chat. They're not just UI specs — they're a way to keep conversation context small. A manifest reference plus a few selection actions is 5-10x smaller than the equivalent verbose conversation.

---

## Skills as cached system prompts

Every conversation needs the agent to know:

- What capabilities are available
- How to use each one well
- What the user's intent profile says
- What the constraints are

A naive implementation includes all this in every turn's context. A Atelier implementation:

- Skills cached at the host (loaded once per session)
- Capability descriptions referenced by ID (not re-included)
- Intent profile loaded into a scratch area, referenced by slice

Anthropic's prompt caching feature maps directly to this: skill content and capability descriptions go in the cached portion of the system prompt; only conversation-specific content goes in the variable portion.

---

## Per-conversation vs per-user budgets

Web apps think in per-user-month budgets. Chat apps need per-conversation budgets too:

```
Per-conversation budget: $0.50 (default)
Warn user if: > $1.00
Hard limit: $5.00 (configurable)

Per-user-month: rolled up
Per-org-month: rolled up
```

When a conversation approaches its budget, the runtime can:

1. Compact context (drop intermediate detail)
2. Switch to a smaller model for the remainder
3. Suggest the user start a new conversation
4. Warn the user with a transparent cost meter

Hidden token costs are the #1 trust failure in agent products. Surface them.

---

## Long conversation strategies

Conversations over 50 turns become economically painful. Strategies:

**1. Periodic compaction.** Every N turns, summarize older turns and replace verbose context with summary. Lose detail, save tokens. Compaction is itself a small LLM call.

**2. Manifest-anchored summarization.** Summaries are organized by manifest: "Turns 1-5: planned travel, manifest m_001. Turns 6-12: refined options, manifest m_002." This preserves structure better than free-form summary.

**3. External memory.** For very long conversations, persist key facts to a queryable memory store (vector DB or structured memory). Context only includes a memory index, not the full content.

**4. Conversation forking.** Split a long conversation into branches when topics diverge. Each branch has its own context. The user can pivot between branches without paying for both contexts.

**5. Conversation closure.** Train the agent to recognize when a conversation should end and explicitly close it: "We've finished planning the trip. Want me to create a summary doc and start fresh?" Closure is a budget reset.

---

## Token economics for autonomous agents

Background agents have different economics:

- No per-turn human latency budget — can use slower, cheaper models
- Can batch operations (process 100 emails in one call rather than 100 calls)
- Cache aggressively at the agent level (capability descriptions, skills, common manifests)
- Failure cost is bounded — if the agent fails, it logs and exits, doesn't run forever
- Can be model-routed: classify the task complexity first, then choose the model

A well-designed autonomous agent runs at $0.001-0.05 per task vs $0.10-1.00 for an interactive equivalent.
