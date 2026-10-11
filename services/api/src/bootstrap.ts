import { ConfigService } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { GlobalExceptionFilter } from "./common/filters/http-exception.filter";
import type { Env } from "./config/env.schema";

/** Shared by the long-running server (main.ts) and the serverless entry (serverless.ts). */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService<Env, true>);
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableCors({
    origin: config.get("CORS_ORIGINS", { infer: true }).split(",").map((o) => o.trim()),
    credentials: true,
  });
}
