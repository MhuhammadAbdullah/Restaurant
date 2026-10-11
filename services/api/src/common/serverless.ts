/** True when running as a Vercel function: no timers survive between requests, so background jobs run through /cron/run instead. */
export const IS_SERVERLESS = Boolean(process.env.VERCEL);
