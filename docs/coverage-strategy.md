# 90% Coverage Strategy

The ambition is that CIR covers 90% of web app and website use cases. Here is how that math works.

---

## The taxonomy

90% of web apps fall into one of these patterns:

| Pattern                | % of apps | Examples                      | CIR coverage                       |
| ---------------------- | --------- | ----------------------------- | ---------------------------------- |
| CRUD over entities     | 25%       | Notion, Airtable, Linear      | Native — Form/Table/DetailView     |
| Communication          | 15%       | Email, chat, comments         | Native — ChatThread/ThreadView     |
| Workflow / pipeline    | 12%       | CRM, recruiting, project mgmt | Native — Kanban/Stepper            |
| Scheduling             | 8%        | Calendar, booking             | Native — Calendar/AvailabilityGrid |
| Analytics / dashboards | 12%       | Looker, Metabase, KPI tools   | Native — Chart/StatCard/Grid       |
| Document / media       | 8%        | Docs, drives, galleries       | Native — Markdown/Gallery/CodeView |
| Search / discovery     | 5%        | Google, internal search       | Native — Search/FilterBar/List     |
| Commerce               | 5%        | Shopify storefronts (browse)  | Native — Card/Gallery/Form         |
| Real-time monitoring   | 3%        | Status pages, ops dashboards  | Native — KPIRow/Chart/Alert        |
| Specialized creative   | 7%        | Figma, video editors, DAWs    | Out of scope (canvas-heavy)        |

Out-of-scope categories — the 10% that doesn't fit — are mostly canvas-heavy or real-time multiplayer creative tools. Those have their own UI primitives and don't benefit from a generic component catalog.

---

## What "coverage" means in practice

For each in-scope app:

- The app exposes its capabilities (typed actions + data schemas)
- The app catalogs its components (or uses the shared catalog)
- The app authors skills for common patterns
- The user has an intent profile
- The compiler produces manifests

If all five are in place, the user can customize. The 90% number means: for 9 out of 10 apps you might use this week, the framework is fundamentally applicable.

---

## The "fallback to default" guarantee

For any route the compiler cannot generate a valid manifest for (policy failure, capability missing, intent ambiguous), the system serves the default recipe. The user never sees a broken interface. The customize flow surfaces an error: "Couldn't customize this route — here's why."

This guarantee is what makes CIR safe to deploy. The worst case is: the user sees the same UI everyone else sees. The best case: their interface is uniquely theirs.
