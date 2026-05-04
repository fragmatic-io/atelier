// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The Atelier Authors

export interface ExceptionRecord {
  id: string;
  title: string;
  customer: string;
  severity: 'Critical' | 'High' | 'Medium';
  status: string;
  amount: string;
  owner: string;
  age: string;
  reason: string;
}

export interface CustomerRecord {
  id: string;
  name: string;
  segment: string;
  health: string;
  plan: string;
  arr: string;
  owner: string;
  risk: string;
}

export interface ApprovalRecord {
  id: string;
  title: string;
  requester: string;
  policy: string;
  impact: string;
  status: string;
  due: string;
}

export const EXCEPTIONS: readonly ExceptionRecord[] = Object.freeze([
  {
    id: 'EX-1042',
    title: 'Refund exceeds policy cap',
    customer: 'Northstar Logistics',
    severity: 'Critical',
    status: 'Needs verbal approval',
    amount: '$18,400',
    owner: 'Maya',
    age: '42m',
    reason: 'VIP account, duplicate shipment, refund amount is 3.1x standard cap.',
  },
  {
    id: 'EX-1038',
    title: 'PII field requested by export',
    customer: 'Arden Health',
    severity: 'High',
    status: 'Policy review',
    amount: '12 fields',
    owner: 'Unassigned',
    age: '1h 12m',
    reason: 'Export includes phone and address fields outside current grant.',
  },
  {
    id: 'EX-1031',
    title: 'Manual override conflict',
    customer: 'Cobalt Market',
    severity: 'Medium',
    status: 'Waiting on ops',
    amount: '3 orders',
    owner: 'Jon',
    age: '2h 05m',
    reason: 'Two agents changed fulfillment priority within the same SLA window.',
  },
]);

export const CUSTOMERS: readonly CustomerRecord[] = Object.freeze([
  {
    id: 'CUS-7701',
    name: 'Northstar Logistics',
    segment: 'Enterprise',
    health: 'At risk',
    plan: 'Scale',
    arr: '$480k',
    owner: 'Maya Patel',
    risk: 'Refund velocity and carrier disputes trending above baseline.',
  },
  {
    id: 'CUS-8110',
    name: 'Arden Health',
    segment: 'Regulated',
    health: 'Review',
    plan: 'Enterprise',
    arr: '$690k',
    owner: 'Eli Chen',
    risk: 'Data export workflow needs field-level grant confirmation.',
  },
]);

export const APPROVALS: readonly ApprovalRecord[] = Object.freeze([
  {
    id: 'APR-2208',
    title: 'Issue goodwill credit',
    requester: 'Support Ops',
    policy: 'verbal_required',
    impact: '$9,200',
    status: 'Awaiting approver',
    due: '12m',
  },
  {
    id: 'APR-2197',
    title: 'Export compliance packet',
    requester: 'Compliance',
    policy: 'restricted_fields',
    impact: '8 documents',
    status: 'Evidence ready',
    due: '34m',
  },
  {
    id: 'APR-2189',
    title: 'Reassign renewal workflow',
    requester: 'Sales Ops',
    policy: 'reversible',
    impact: '14 accounts',
    status: 'Ready',
    due: '1h',
  },
]);
