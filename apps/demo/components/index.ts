// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The CIR Authors
import type { ComponentBinding } from '@cir/runtime';
import { DECISION_QUEUE_BINDING } from './DecisionQueue';
import { TASK_QUEUE_BINDING } from './TaskQueue';
import { THREAD_VIEW_BINDING } from './ThreadView';
import { UNDO_BAR_BINDING } from './UndoBar';

export { DecisionQueue, DECISION_QUEUE_BINDING } from './DecisionQueue';
export { TaskQueue, TASK_QUEUE_BINDING } from './TaskQueue';
export { ThreadView, THREAD_VIEW_BINDING } from './ThreadView';
export { UndoBar, UNDO_BAR_BINDING } from './UndoBar';

export const DEMO_BINDINGS: Record<string, ComponentBinding> = {
  DecisionQueue: DECISION_QUEUE_BINDING,
  TaskQueue: TASK_QUEUE_BINDING,
  ThreadView: THREAD_VIEW_BINDING,
  UndoBar: UNDO_BAR_BINDING,
};
