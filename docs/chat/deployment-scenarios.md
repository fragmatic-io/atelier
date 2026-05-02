# Deployment Scenarios

Five concrete starting points. Pick the one closest to your situation and follow the steps.

---

## 1. Building a Atelier-native chatbot from scratch

You're building a new AI product (e.g., an AI customer support agent for a SaaS company).

**Steps:**

1. Define capabilities: actions the agent can take (lookup_account, refund, escalate, etc.)
2. Write skills: when to use each capability, how to phrase, what to confirm
3. Design components: how should responses be structured? (TicketCard, RefundForm, EscalationDialog)
4. Author policies: refund limits, confirmation rules, data scope
5. Build the runtime: web SDK or chat-host integration
6. Set up the compiler service with a single model
7. Set up the manifest cache (Redis is fine to start)
8. Set up the trigger bus
9. Set up the audit log
10. Ship behind a feature flag, monitor token cost and policy violations

**Time to MVP:** 4-8 weeks for a focused vertical.

---

## 2. Adding Atelier to an existing agent platform

You have a working agent platform (LangChain, AutoGPT-style, custom) and want to upgrade to Atelier.

**Steps:**

1. Audit existing tools → declare them as capabilities (add side effects, confirmation policy)
2. Extract embedded knowledge from prompts → write as skills
3. Identify common output patterns → catalog them as components
4. Add a manifest layer between tool selection and response rendering
5. Add a turn classifier so most turns don't recompile
6. Add a manifest cache
7. Migrate prompts to use cached system prompt + skill references
8. Add policy validation
9. Add audit log

This is a 3-6 month migration for a mature agent platform. Each step adds value before the next.

---

## 3. Wrapping an MCP server in Atelier

You have an MCP server and want Atelier's production layer.

**Steps:**

1. Annotate each MCP tool with side effects, confirmation, reversibility → capability spec
2. Write skill files for tool clusters
3. If you ship MCP Apps UI → catalog the components, add composition rules
4. Add a manifest cache in front of any UI generation
5. Add policy validation before returning UI to host
6. Emit triggers when tools change

**Time:** 2-4 weeks for a single MCP server.

---

## 4. Building a Atelier runtime for Claude.ai or ChatGPT (via MCP Apps)

You want your Atelier-enabled app to render inside a major chat host.

**Steps:**

1. Implement an MCP server that exposes your capabilities
2. For UI: each tool that should render UI returns an MCP Apps UI resource
3. The UI resource is HTML hosting your Atelier runtime bundle
4. Your runtime fetches the manifest from your Atelier backend (with host-provided auth)
5. Your runtime renders, dispatches actions back through MCP tool calls
6. Your manifest cache is your Atelier backend; the host caches the runtime bundle

This is the natural shape of a CIR-aware MCP App. The chat host doesn't need to know about Atelier; it just sees standard MCP Apps resources. Your backend gets the production benefits (caching, policies, audits, token economics) on top.

---

## 5. Building an autonomous agent fleet

You're building a system of background agents that work for users 24/7.

**Steps:**

1. Define each agent's task scope and capability scope
2. Write skills specific to each agent type
3. Set up the schedule/trigger system (cron + event subscriptions)
4. Set up per-agent state stores
5. Set up per-agent audit logs
6. Define the human review surface: how do users see what their agents did?
7. Set up budget limits and circuit breakers
8. Add alerting for failures, anomalies, repeated errors
9. Build the agent-to-agent bus if multi-agent

Background agents have higher trust requirements than interactive ones. Plan for 3-6 months of testing before production deployment.
