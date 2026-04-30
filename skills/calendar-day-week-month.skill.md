---
name: calendar-day-week-month
version: 0.1.0
description: Pick a calendar view by event density — day for ten or more events per day, week for typical loads, month for sparse overviews — and surface a timezone footer when the user's locale differs from the data origin.
capabilities_used:
  - calendar.event.list
  - calendar.range.summary
when_to_use: |
  When rendering a `<Calendar>` component (or, if the registry lacks
  one, a `<Grid>` of day cells with `<Card>` events inside). Apply on
  initial render and on every range navigation — view density is a
  function of the events the range will return, not a user preference.
when_not_to_use: |
  Single-event detail panes (use `<DetailView>`). Booking surfaces with
  fixed slot grids (use the booking-slot skill, not this one). Year-at-
  a-glance heatmaps — those are owned by the chart family, not the
  calendar family.
example_flow: |
  1. Call `calendar.range.summary` for the active range. This returns a
     histogram of `events_per_day` without paying for full event
     payloads.
  2. Pick a default view from the histogram:
     - `max(events_per_day) >= 10`: switch to **day** view; render
       half-hour slots vertically, a single column per day. Re-fetch
       full events for the focused day.
     - `5 <= max(events_per_day) < 10`: **week** view; seven columns,
       hour slots, full event titles inline.
     - `max(events_per_day) < 5`: **month** view; calendar grid,
       up to three event chips per cell, "+N more" link below.
  3. Auto-density inside each view:
     - Day view: collapse free hours under "no events" if the gap is
       longer than three hours.
     - Week view: stack overlapping events with a visible offset, never
       hide one behind another.
     - Month view: chip color from `BrandKit.colors.calendar_palette`
       keyed on the calendar id, not the event id.
  4. Compare the user's resolved locale (from `user_id` profile) with
     the data origin's declared timezone (from the capability response
     metadata). If they differ, render a footer: "Times shown in
     {{user_tz}} — events recorded in {{origin_tz}}".
  5. Persist the user's manual overrides for one session only. A user
     who toggles to month view should not be force-flipped back to day
     view on the next render — but should be on the next session.
known_failure_modes:
  - Picking the view from the average event count instead of the peak;
    a calendar with one busy day and six empty days renders correctly
    only when the peak is the deciding factor.
  - Forgetting the timezone footer when the user is on the road
    (local timezone different from profile timezone). Resolve from the
    runtime's current locale, not the static profile field.
  - Hiding overlapping events in week view by stacking them without
    offset, producing a clean-looking but misleading surface.
  - Triggering a full event refetch on every range nav when
    `range.summary` would have answered "no change in density".
---

# Calendar day, week, month

A calendar with the wrong default view burns the user's first three
seconds. This skill encodes the view-picker as a function of measured
density, not as a user-config field.

## Why this skill exists

The view decision is cheap to make from the histogram and impossible to
make well from prose. By grounding the default in
`calendar.range.summary` the compiler avoids re-deriving the heuristic
every render and avoids fetching full payloads to count events.

## Composition rules

- Reference the registry's `<Calendar>` when present; fall back to a
  `<Grid>` of day cells with `<Card>` events when it is not.
- The chip palette comes from `BrandKit.colors.calendar_palette` keyed
  on calendar id. Never key chip color on event id — that defeats the
  user's mental model of "this calendar is blue".
- Timezone footers are non-optional when locales diverge. The footer
  is a contract, not a courtesy.
