---
name: settings-section-grouping
version: 0.1.0
description: Lay out a settings page with 3–7 logical sections, switch from single-scroll to sidebar-with-detail when section count or field count crosses a threshold, surface in-page search once the page exceeds 40 fields, and only use icons from the BrandKit's allowed iconography set.
capabilities_used:
  - dummyjson.cart.add
when_to_use: |
  Whenever a recipe needs to expose user-controllable preferences,
  account fields, billing details, notification toggles, or any
  configuration that the user revisits more than once. Pair with
  `<Sidebar>`, `<Tabs>`, `<Accordion>`, `<Form>`, `<Toggle>`, and
  `<Search>`.
when_not_to_use: |
  Single-purpose preference pickers (a one-toggle "dark mode" flip
  belongs in the navbar, not a settings page). First-run onboarding
  flows — those are wizards, not settings. Admin dashboards with
  data tables — those use the dashboard skills, not this one.
  Read-only "About" pages that happen to look like settings.
example_flow: |
  1. Enumerate the settings the recipe exposes. Group into logical
     sections: Profile, Notifications, Billing, Security,
     Integrations, Privacy, Advanced. Aim for 3–7 sections — fewer
     and the page feels under-organised, more and users cannot
     keep the map in their head.
  2. Pick the layout based on cardinality:
     - `sections <= 3` AND `fields <= 30` → single-scroll page,
       each section a `<Card>` with an `<h2>` and a horizontal
       rule between sections. Anchor links in the page header for
       quick scroll.
     - `sections >= 4` OR `fields >= 30` → `<Sidebar>` with the
       section list on the left, `<DetailView>` on the right. The
       sidebar entry for the active section is highlighted; the
       URL hash reflects the current section so it is linkable.
  3. If the page has `fields >= 40`, render a `<Search>` input at
     the top of the layout that filters fields by label + helptext
     match. Show the search hit count inline; selecting a hit
     scrolls the field into view and briefly highlights it.
  4. Section iconography is OPTIONAL but, when used, every icon
     must come from a set declared in the BrandKit's
     `iconography.allowed_sets`. If the BrandKit declares no
     allowed sets, render the section header without an icon
     rather than reaching for a default.
  5. On mobile (<640px), collapse sidebar layouts into a top-level
     `<Tabs>` strip with the section names. Never collapse to a
     hamburger — settings are too frequently visited to bury.
  6. Save semantics are per-section (Save button per `<Card>`),
     not page-wide. Page-wide save buttons hide which section
     errored on validation failure.
known_failure_modes:
  - Producing 12 sections because the schema groups fields by
    backend service rather than user mental model. Re-group from
    the user's perspective.
  - Switching to sidebar at 4 sections but with only 8 fields total
    — the sidebar dwarfs the content. The threshold is 4 sections
    OR 30 fields, not AND.
  - Using a default icon set when the BrandKit declares allowed
    sets and the section's icon is not in any of them.
  - Hiding the search input until the user clicks an "expand"
    affordance. If the page has 40+ fields, the search is the
    primary navigation — render it open by default.
  - One Save button at the bottom of a long sidebar layout.
    Validation errors become a scavenger hunt.
---

# Settings section grouping

Settings pages are the biggest screen most products ship and the most
frequently re-visited. This skill encodes the section count target,
the layout fork, the in-page search threshold, and the iconography
constraint so the compiler does not re-derive each from scratch.

## Why this skill exists

The default move on "render settings" is "one giant single-scroll
form". That fails at 30+ fields and fails harder on mobile. The
sidebar threshold (4 sections OR 30 fields) gives a clean fork the
compiler can apply without per-app tuning, and the BrandKit
iconography rule keeps the page from looking like a sticker book.

## Composition rules

- Section count target: 3–7. Outside that range, regroup from the
  user's mental model, not the backend's service boundaries.
- Layout fork: single-scroll vs sidebar based on
  `sections >= 4 OR fields >= 30`.
- In-page search appears at `fields >= 40`, rendered open.
- Icons only from `BrandKit.iconography.allowed_sets`. No icon is
  better than a wrong icon.
- Per-section Save buttons. Never page-wide.
