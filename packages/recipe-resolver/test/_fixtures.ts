// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors
/**
 * Fixture corpus for the recipe-resolver tests. 30 recipes spanning a
 * few domains so we can assert ranking + topN behaviour on a corpus
 * that resembles a real persona library.
 */

import type { Recipe } from '../src/types.js';

export const FIXTURE_RECIPES: readonly Recipe[] = [
  // commerce — 8 recipes
  {
    id: 'dummyjson-shopper',
    description: 'Shopping persona over the DummyJSON catalog with cart and checkout.',
    domain: 'commerce',
    brand_kit_id: 'demo-dummyjson',
    intent_surfaces: ['browse products', 'cart', 'checkout', 'product detail'],
  },
  {
    id: 'shopify-merchant',
    description: 'Storefront admin for Shopify merchants — orders, products, fulfilment.',
    domain: 'commerce',
    brand_kit_id: 'shopify-default',
    intent_surfaces: ['orders', 'products', 'fulfilment'],
  },
  {
    id: 'b2b-buyer',
    description: 'B2B procurement buyer with quote workflow and approval queue.',
    domain: 'commerce',
    intent_surfaces: ['quotes', 'approvals', 'orders'],
  },
  {
    id: 'pos-cashier',
    description: 'Point-of-sale cashier with quick-add tiles and tender screen.',
    domain: 'commerce',
    intent_surfaces: ['cart', 'tender', 'receipts'],
  },
  {
    id: 'subscription-manager',
    description: 'Subscription billing operator monitoring MRR and churn.',
    domain: 'commerce',
    intent_surfaces: ['mrr', 'churn', 'subscriptions'],
  },
  {
    id: 'inventory-clerk',
    description: 'Warehouse inventory clerk with stock counts and reorder alerts.',
    domain: 'commerce',
    intent_surfaces: ['stock', 'reorder', 'audit'],
  },
  {
    id: 'returns-agent',
    description: 'Customer-service returns agent processing RMAs.',
    domain: 'commerce',
    intent_surfaces: ['returns', 'rma', 'refunds'],
  },
  {
    id: 'gift-card-admin',
    description: 'Gift-card administrator issuing and tracking redemptions.',
    domain: 'commerce',
    intent_surfaces: ['gift cards', 'redemptions'],
  },

  // issue-tracker — 8 recipes
  {
    id: 'github-reviewer',
    description: 'GitHub code reviewer triaging issues and pull requests.',
    domain: 'issue-tracker',
    brand_kit_id: 'github-default',
    intent_surfaces: ['issues', 'pull requests', 'review queue'],
  },
  {
    id: 'jira-pm',
    description: 'Jira project manager managing sprints and backlog.',
    domain: 'issue-tracker',
    intent_surfaces: ['sprints', 'backlog', 'epics'],
  },
  {
    id: 'linear-eng',
    description: 'Linear engineering lead tracking cycle and triage.',
    domain: 'issue-tracker',
    intent_surfaces: ['cycle', 'triage', 'roadmap'],
  },
  {
    id: 'gitlab-maintainer',
    description: 'GitLab maintainer reviewing merge requests and CI.',
    domain: 'issue-tracker',
    intent_surfaces: ['merge requests', 'pipelines', 'reviewers'],
  },
  {
    id: 'asana-coordinator',
    description: 'Asana project coordinator managing task dependencies.',
    domain: 'issue-tracker',
    intent_surfaces: ['tasks', 'dependencies', 'milestones'],
  },
  {
    id: 'support-triage',
    description: 'Support engineer triaging incoming tickets to teams.',
    domain: 'issue-tracker',
    intent_surfaces: ['tickets', 'triage', 'sla'],
  },
  {
    id: 'bug-hunter',
    description: 'QA engineer reproducing and filing high-severity bugs.',
    domain: 'issue-tracker',
    intent_surfaces: ['repro', 'bug filing', 'severity'],
  },
  {
    id: 'release-manager',
    description: 'Release manager cutting and announcing releases.',
    domain: 'issue-tracker',
    intent_surfaces: ['releases', 'changelog', 'announcements'],
  },

  // crm — 4 recipes
  {
    id: 'sales-rep',
    description: 'Salesforce sales rep working a pipeline of opportunities.',
    domain: 'crm',
    intent_surfaces: ['pipeline', 'opportunities', 'quotes'],
  },
  {
    id: 'csm-account',
    description: 'Customer success manager monitoring account health.',
    domain: 'crm',
    intent_surfaces: ['health score', 'qbr', 'renewals'],
  },
  {
    id: 'marketing-ops',
    description: 'Marketing ops running campaigns and lead-scoring.',
    domain: 'crm',
    intent_surfaces: ['campaigns', 'lead score', 'attribution'],
  },
  {
    id: 'sdr-prospector',
    description: 'SDR prospecting accounts and booking discovery calls.',
    domain: 'crm',
    intent_surfaces: ['prospecting', 'sequences', 'meetings'],
  },

  // analytics — 4 recipes
  {
    id: 'analytics-pm',
    description: 'Product manager reading retention and feature funnels.',
    domain: 'analytics',
    intent_surfaces: ['retention', 'funnels', 'cohorts'],
  },
  {
    id: 'finance-controller',
    description: 'Finance controller tracking AR aging and cash position.',
    domain: 'analytics',
    intent_surfaces: ['ar aging', 'cash', 'forecast'],
  },
  {
    id: 'ops-dashboard',
    description: 'Operations dashboard with SLA, incidents, and capacity.',
    domain: 'analytics',
    intent_surfaces: ['sla', 'incidents', 'capacity'],
  },
  {
    id: 'data-scientist',
    description: 'Data scientist exploring datasets and running ad-hoc queries.',
    domain: 'analytics',
    intent_surfaces: ['datasets', 'sql', 'notebooks'],
  },

  // productivity — 6 recipes
  {
    id: 'inbox-zero',
    description: 'Email triage assistant clearing the inbox to zero.',
    domain: 'productivity',
    intent_surfaces: ['inbox', 'archive', 'snooze'],
  },
  {
    id: 'meeting-prep',
    description: 'Meeting-prep helper surfacing context before each call.',
    domain: 'productivity',
    intent_surfaces: ['calendar', 'notes', 'context'],
  },
  {
    id: 'doc-writer',
    description: 'Long-form document writer with outline and citations.',
    domain: 'productivity',
    intent_surfaces: ['outline', 'drafting', 'citations'],
  },
  {
    id: 'code-reviewer',
    description: 'Generic code reviewer (any provider) annotating diffs.',
    domain: 'productivity',
    intent_surfaces: ['diffs', 'annotations', 'review'],
  },
  {
    id: 'standup-host',
    description: 'Daily standup host collecting blockers and updates.',
    domain: 'productivity',
    intent_surfaces: ['standup', 'blockers', 'updates'],
  },
  {
    id: 'todo-list',
    description: 'Personal todo list with prioritisation and snooze.',
    domain: 'productivity',
    intent_surfaces: ['todos', 'priorities', 'snooze'],
  },
];

if (FIXTURE_RECIPES.length !== 30) {
  throw new Error(`expected 30 fixture recipes, got ${String(FIXTURE_RECIPES.length)}`);
}
