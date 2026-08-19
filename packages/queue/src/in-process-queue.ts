import type { JobName, JobPayloadMap, JobQueue } from "./types";

/**
 * Executes jobs immediately in-process instead of via a Redis-backed broker.
 * Same public contract as a future BullMQ-backed queue, so callers (`.add()`) never change
 * when real Redis/BullMQ credentials are supplied later — only this implementation is swapped.
 */
export class InProcessJobQueue implements JobQueue {
  private handlers = new Map<JobName, Array<(payload: unknown) => Promise<void>>>();

  async add<K extends JobName>(name: K, payload: JobPayloadMap[K], opts?: { delayMs?: number }): Promise<void> {
    const run = async () => {
      const handlers = this.handlers.get(name) ?? [];
      for (const handler of handlers) {
        try {
          await handler(payload);
        } catch (err) {
          // A job handler failing must never take down the request that enqueued it.
          // eslint-disable-next-line no-console
          console.error(`[queue] job "${name}" handler failed:`, err);
        }
      }
    };

    if (opts?.delayMs) {
      setTimeout(() => void run(), opts.delayMs);
      return;
    }
    await run();
  }

  process<K extends JobName>(name: K, handler: (payload: JobPayloadMap[K]) => Promise<void>): void {
    const list = this.handlers.get(name) ?? [];
    list.push(handler as (payload: unknown) => Promise<void>);
    this.handlers.set(name, list);
  }
}
