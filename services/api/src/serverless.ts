import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { IncomingMessage, ServerResponse } from "http";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let cached: Promise<Handler> | null = null;

/** Vercel entry: the Nest app is created once per warm instance and reused for later requests. */
function createHandler(): Promise<Handler> {
  return (async () => {
    const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
    configureApp(app);
    await app.init();
    return app.getHttpAdapter().getInstance() as Handler;
  })();
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    cached ??= createHandler();
    (await cached)(req, res);
  } catch (e) {
    cached = null;
    // eslint-disable-next-line no-console
    console.error("API failed to start", e);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, error: { code: "STARTUP_FAILED", message: "Server could not start" } }));
  }
}
