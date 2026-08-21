import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { FinanceReportService } from "./finance-report.service";
import { FinanceReportExportService } from "./finance-report-export.service";

@Module({
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService, FinanceReportService, FinanceReportExportService],
})
export class ReportsModule {}
