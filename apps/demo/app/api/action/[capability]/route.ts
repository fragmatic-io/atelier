// SPDX-License-Identifier: MIT
// Copyright (c) 2026 The CIR Authors
/**
 * Fake action endpoint. The demo's action handlers in `lib/cir-providers.tsx`
 * POST here. Each capability mutates the in-memory store and returns an
 * `ActionResult`-shaped response.
 *
 * In a real CIR app this is the Action Gateway (auth + audit + rate limit).
 */

import { NextResponse } from 'next/server';
import { getStore, nextId, type Task } from '@/lib/fake-data';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ capability: string }>;
}

export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const { capability } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  const store = getStore();
  const audit_id = nextId('audit');

  if (capability === 'thread.archive') {
    const thread_id = body.thread_id as string;
    const t = store.threads.find((x) => x.id === thread_id);
    if (!t) return NextResponse.json({ ok: false, error: 'thread not found' }, { status: 404 });
    t.archived = true;
    return NextResponse.json({
      ok: true,
      result: { archived_at: new Date().toISOString() },
      side_effects: ['archive', 'mutates:thread_state'],
      audit_id,
    });
  }

  if (capability === 'task.complete') {
    const task_id = body.task_id as string;
    const task = store.tasks.find((x) => x.id === task_id);
    if (!task) return NextResponse.json({ ok: false, error: 'task not found' }, { status: 404 });
    task.status = 'done';
    return NextResponse.json({
      ok: true,
      result: { completed_at: new Date().toISOString() },
      side_effects: ['mutates:task_state'],
      audit_id,
    });
  }

  if (capability === 'task.snooze') {
    const task_id = body.task_id as string;
    const days = (body.days as number) ?? 1;
    const task = store.tasks.find((x) => x.id === task_id);
    if (!task) return NextResponse.json({ ok: false, error: 'task not found' }, { status: 404 });
    const d = new Date(task.due_date);
    d.setDate(d.getDate() + days);
    task.due_date = d.toISOString().slice(0, 10);
    task.status = 'snoozed';
    return NextResponse.json({
      ok: true,
      result: { new_due_date: task.due_date },
      side_effects: ['mutates:task_state'],
      audit_id,
    });
  }

  if (capability === 'task.create_from_thread') {
    const thread_id = body.thread_id as string;
    const t = store.threads.find((x) => x.id === thread_id);
    if (!t) return NextResponse.json({ ok: false, error: 'thread not found' }, { status: 404 });
    const newTask: Task = {
      id: nextId('task'),
      title: `Reply: ${t.subject}`,
      due_date: new Date().toISOString().slice(0, 10),
      status: 'open',
      source: { kind: 'thread', thread_id },
    };
    store.tasks.unshift(newTask);
    return NextResponse.json({
      ok: true,
      result: { task_id: newTask.id },
      side_effects: ['mutates:task_state'],
      audit_id,
    });
  }

  return NextResponse.json(
    { ok: false, error: `unknown capability ${capability}` },
    { status: 404 },
  );
}
