// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * In-memory store for the demo. Persists across hot reloads in dev via
 * `globalThis`. Resets when the Next.js server restarts.
 *
 * In a real Atelier app these would be database queries gated by the Action
 * Gateway; here they're just JS objects so the demo runs offline.
 */

export interface ThreadMessage {
  id: string;
  from: { name: string; email: string };
  to: { name: string; email: string }[];
  sent_at: string; // ISO datetime
  body: string; // markdown
}

export interface Thread {
  id: string;
  sender: { name: string; email: string };
  subject: string;
  snippet: string;
  received_at: string; // ISO datetime
  requires_decision: boolean;
  archived: boolean;
  messages: ThreadMessage[];
}

export interface Task {
  id: string;
  title: string;
  due_date: string; // ISO date
  status: 'open' | 'done' | 'snoozed';
  source?: { kind: 'thread'; thread_id: string };
}

interface Store {
  threads: Thread[];
  tasks: Task[];
  next_id: number;
}

const today = new Date();
const iso = (d: Date): string => d.toISOString();
const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
const daysFromNow = (n: number): Date => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
};

const initial = (): Store => ({
  threads: [
    {
      id: 't_001',
      sender: { name: 'Alice Chen', email: 'alice@portfolio-fund.example' },
      subject: 'Re: Q2 board update',
      snippet:
        'Thanks for the update. One question on customer concentration — can you walk through the top 5...',
      received_at: iso(daysFromNow(0)),
      requires_decision: true,
      archived: false,
      messages: [
        {
          id: 'm_001_1',
          from: { name: 'You', email: 'me@example.com' },
          to: [{ name: 'Alice Chen', email: 'alice@portfolio-fund.example' }],
          sent_at: iso(daysFromNow(-1)),
          body: '# Q2 board update\n\nKey wins this quarter:\n\n- **Net new ARR:** $1.2M, up 38% QoQ\n- **Logo retention:** 97%\n- **Headcount:** 24 → 31\n\nFull deck attached.',
        },
        {
          id: 'm_001_2',
          from: { name: 'Alice Chen', email: 'alice@portfolio-fund.example' },
          to: [{ name: 'You', email: 'me@example.com' }],
          sent_at: iso(daysFromNow(0)),
          body: 'Thanks for the update. One question on customer concentration — can you walk through the top 5 customers as a % of ARR? And which of those are renewing this half?\n\nAlso, what does the [pipeline](https://example.com/pipe) look like for Q3?',
        },
      ],
    },
    {
      id: 't_002',
      sender: { name: 'Bob Martinez', email: 'bob@enterprise-customer.example' },
      subject: 'Renewal — need a call this week',
      snippet:
        'Our procurement team flagged a few line items in the new SOW. Could we hop on a 30-min call before...',
      received_at: iso(daysFromNow(0)),
      requires_decision: true,
      archived: false,
      messages: [
        {
          id: 'm_002_1',
          from: { name: 'Bob Martinez', email: 'bob@enterprise-customer.example' },
          to: [{ name: 'You', email: 'me@example.com' }],
          sent_at: iso(daysFromNow(0)),
          body: "Our procurement team flagged a few line items in the new SOW. Could we hop on a 30-min call before Friday?\n\nMain items:\n\n1. SLA target — they're asking for 99.95% (we have 99.9%)\n2. Data retention clause — needs revision\n3. ~~Pricing~~ Already locked, no concerns\n\nThanks!",
        },
      ],
    },
    {
      id: 't_003',
      sender: { name: 'Carol Singh', email: 'carol@team-internal.example' },
      subject: 'Eng review notes — Friday',
      snippet:
        "I'll handle the eng review writeup. Heads up: I'm shifting the onsite to next Tuesday since...",
      received_at: iso(daysFromNow(0)),
      requires_decision: true,
      archived: false,
      messages: [
        {
          id: 'm_003_1',
          from: { name: 'Carol Singh', email: 'carol@team-internal.example' },
          to: [{ name: 'You', email: 'me@example.com' }],
          sent_at: iso(daysFromNow(0)),
          body: "I'll handle the eng review writeup. Heads up: I'm shifting the onsite to next Tuesday since two folks have conflicts Friday.\n\n| Action | Owner | Due |\n| --- | --- | --- |\n| Writeup draft | Carol | Mon |\n| Review | You | Tue |\n| Onsite | All | Tue PM |",
        },
      ],
    },
    {
      id: 't_004',
      sender: { name: 'no-reply', email: 'no-reply@notifications.example' },
      subject: 'Your weekly digest',
      snippet: 'Top stories this week...',
      received_at: iso(daysFromNow(-1)),
      requires_decision: false,
      archived: false,
      messages: [
        {
          id: 'm_004_1',
          from: { name: 'no-reply', email: 'no-reply@notifications.example' },
          to: [{ name: 'You', email: 'me@example.com' }],
          sent_at: iso(daysFromNow(-1)),
          body: 'Top stories this week.',
        },
      ],
    },
    {
      id: 't_005',
      sender: { name: 'Dan Park', email: 'dan@former-employer.example' },
      subject: 'Coffee next week?',
      snippet: 'Long time no chat. Free Tuesday or Thursday afternoon?',
      received_at: iso(daysFromNow(-1)),
      requires_decision: true,
      archived: false,
      messages: [
        {
          id: 'm_005_1',
          from: { name: 'Dan Park', email: 'dan@former-employer.example' },
          to: [{ name: 'You', email: 'me@example.com' }],
          sent_at: iso(daysFromNow(-1)),
          body: "Long time no chat. Free Tuesday or Thursday afternoon? Want to catch up on what you're building — heard great things.",
        },
      ],
    },
  ],
  tasks: [
    {
      id: 'task_001',
      title: 'Reply to Alice with cohort retention data',
      due_date: isoDate(daysFromNow(0)),
      status: 'open',
      source: { kind: 'thread', thread_id: 't_001' },
    },
    {
      id: 'task_002',
      title: 'Schedule renewal call with Bob',
      due_date: isoDate(daysFromNow(1)),
      status: 'open',
      source: { kind: 'thread', thread_id: 't_002' },
    },
    {
      id: 'task_003',
      title: 'Review Q3 OKRs draft',
      due_date: isoDate(daysFromNow(2)),
      status: 'open',
    },
    {
      id: 'task_004',
      title: 'Submit board deck',
      due_date: isoDate(daysFromNow(4)),
      status: 'open',
    },
    {
      id: 'task_005',
      title: 'Sign vendor contract',
      due_date: isoDate(daysFromNow(-1)),
      status: 'open',
    },
    {
      id: 'task_006',
      title: 'Draft hiring plan v2',
      due_date: isoDate(daysFromNow(10)),
      status: 'open',
    },
    {
      id: 'task_007',
      title: 'Push the website refresh live',
      due_date: isoDate(daysFromNow(-3)),
      status: 'done',
    },
  ],
  next_id: 100,
});

const KEY = '__cir_demo_store';
type GlobalWithStore = typeof globalThis & { [KEY]?: Store };
const g = globalThis as GlobalWithStore;

export const getStore = (): Store => {
  if (!g[KEY]) g[KEY] = initial();
  return g[KEY];
};

export const resetStore = (): void => {
  g[KEY] = initial();
};

export const nextId = (prefix: string): string => {
  const s = getStore();
  s.next_id += 1;
  return `${prefix}_${s.next_id}`;
};
