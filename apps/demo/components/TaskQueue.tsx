// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors

'use client';

/**
 * TaskQueue — domain component for the email triage demo.
 * Tasks grouped by due date with optimistic-UI checkbox completion and a
 * snooze action.
 */

import { useMemo, useState } from 'react';
import type { ComponentBinding, ActionResult } from '@cir/runtime';
import { Card, Spinner, Alert, EmptyState, Button } from '@cir/components';

interface Task {
  id: string;
  title: string;
  due_date: string; // ISO date YYYY-MM-DD
  status: 'open' | 'done' | 'snoozed';
}

interface TaskQueueData {
  tasks: Task[];
}

interface TaskQueueProps {
  data?: TaskQueueData;
  loading?: boolean;
  error?: Error | null;
  task_complete?: (input: unknown) => Promise<ActionResult>;
  task_snooze?: (input: unknown) => Promise<ActionResult>;
}

type GroupKey = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'done';

const GROUP_LABEL: Record<GroupKey, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  this_week: 'This week',
  later: 'Later',
  done: 'Completed',
};

const GROUP_ORDER: readonly GroupKey[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'later',
  'done',
];

function groupFor(task: Task, today: Date): GroupKey {
  if (task.status === 'done') return 'done';
  const due = new Date(task.due_date);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays <= 7) return 'this_week';
  return 'later';
}

export function TaskQueue({
  data,
  loading,
  error,
  task_complete,
  task_snooze,
}: TaskQueueProps): React.JSX.Element {
  const [optimistic, setOptimistic] = useState<Record<string, 'done' | 'snoozed'>>({});
  const [showDone, setShowDone] = useState(false);

  const todayDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  if (loading) return <Spinner label="Loading tasks…" />;
  if (error)
    return (
      <Alert severity="error" title="Couldn't load tasks">
        {error.message}
      </Alert>
    );
  const tasks = data?.tasks ?? [];
  if (tasks.length === 0)
    return <EmptyState title="No tasks" description="Nothing on your queue." />;

  // Apply optimistic overlay
  const effective = tasks.map((t) => (optimistic[t.id] ? { ...t, status: optimistic[t.id]! } : t));

  const grouped: Record<GroupKey, Task[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    this_week: [],
    later: [],
    done: [],
  };
  for (const t of effective) grouped[groupFor(t, todayDate)].push(t);

  const doneCount = grouped.done.length;

  return (
    <Card title="Your tasks">
      <div data-cir-component="TaskQueue">
        {GROUP_ORDER.map((key) => {
          const items = grouped[key];
          if (items.length === 0) return null;
          if (key === 'done' && !showDone) return null;
          return (
            <div key={key} data-cir-task-group>
              <div data-cir-task-group-header>{GROUP_LABEL[key]}</div>
              {items.map((task) => {
                const overdue = key === 'overdue';
                const done = task.status === 'done';
                return (
                  <div
                    key={task.id}
                    data-cir-task-row
                    data-status={task.status}
                    data-overdue={String(overdue)}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Complete ${task.title}`}
                      checked={done}
                      disabled={!task_complete}
                      onChange={async () => {
                        if (!task_complete || done) return;
                        setOptimistic((prev) => ({ ...prev, [task.id]: 'done' }));
                        const r = await task_complete({ task_id: task.id });
                        if (!r.ok) {
                          setOptimistic((prev) => {
                            const { [task.id]: _drop, ...rest } = prev;
                            return rest;
                          });
                        }
                      }}
                    />
                    <span data-cir-task-title className="flex-1">
                      {task.title}
                    </span>
                    <span data-cir-due-pill>{task.due_date}</span>
                    {!done && (
                      <Button
                        variant="ghost"
                        disabled={!task_snooze}
                        onClick={async () => {
                          if (!task_snooze) return;
                          setOptimistic((prev) => ({ ...prev, [task.id]: 'snoozed' }));
                          await task_snooze({ task_id: task.id, days: 1 });
                        }}
                      >
                        Snooze
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
        {doneCount > 0 && !showDone && (
          <button
            type="button"
            className="mt-3 text-sm text-gray-500 hover:text-gray-700"
            onClick={() => setShowDone(true)}
          >
            Show {doneCount} completed
          </button>
        )}
      </div>
    </Card>
  );
}

export const TASK_QUEUE_BINDING: ComponentBinding = {
  id: 'TaskQueue',
  factory: TaskQueue,
};
