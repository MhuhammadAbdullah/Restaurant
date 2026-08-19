/**
 * Job payload contract. Add new job types here as they're needed —
 * both the in-process queue and a future BullMQ-backed queue implement this same shape.
 */
export type JobPayloadMap = {
  "notification.dispatch": {
    notificationId: string;
  };
  "receipt.generate": {
    orderId: string;
  };
  "loyalty.expirePoints": Record<string, never>;
};

export type JobName = keyof JobPayloadMap;

export interface JobQueue {
  add<K extends JobName>(name: K, payload: JobPayloadMap[K], opts?: { delayMs?: number }): Promise<void>;
  process<K extends JobName>(name: K, handler: (payload: JobPayloadMap[K]) => Promise<void>): void;
}
