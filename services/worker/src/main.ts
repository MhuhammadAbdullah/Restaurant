/**
 * Standalone job-processor entrypoint. Currently a placeholder: as long as `@restaurant/queue`
 * runs in-process (see packages/queue/src/in-process-queue.ts), jobs execute inline inside
 * services/api and this process has nothing to do. Once real Upstash Redis + BullMQ credentials
 * are supplied, this becomes the BullMQ Worker host — same job names/payloads, no API changes.
 */
// eslint-disable-next-line no-console
console.log("[worker] no external queue configured — jobs run in-process inside services/api");
