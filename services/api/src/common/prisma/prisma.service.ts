import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@restaurant/database";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
    // The stock ledger only ever grows: a mistake is fixed by a new, opposite entry, never by editing or deleting history.
    this.$use(async (params, next) => {
      if (params.model === "StockMovement" && ["update", "updateMany", "upsert", "delete", "deleteMany"].includes(params.action)) {
        throw new Error("Stock movements are an append-only ledger and cannot be changed or deleted.");
      }
      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Connected to database");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
