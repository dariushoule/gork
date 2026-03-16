type ActionFn = () => Promise<void>;

const queues = new Map<string, ActionFn[]>();
const draining = new Set<string>();

/** Enqueue a turn action for a thread. Actions are processed one at a time in order. */
export function enqueue(threadId: string, action: ActionFn): void {
  const q = queues.get(threadId) ?? [];
  q.push(action);
  queues.set(threadId, q);
  if (!draining.has(threadId)) {
    void drain(threadId);
  }
}

async function drain(threadId: string): Promise<void> {
  draining.add(threadId);
  while (true) {
    const q = queues.get(threadId);
    if (!q || q.length === 0) {
      draining.delete(threadId);
      queues.delete(threadId);
      return;
    }
    const action = q.shift()!;
    try {
      await action();
    } catch (err) {
      console.error(`[queue] thread ${threadId} action failed:`, err);
    }
  }
}
