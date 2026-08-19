import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateTableInput, UpdateTableInput } from "@restaurant/validation";
import type { StaffJwtPayload } from "@restaurant/auth";
import { PrismaService } from "../../common/prisma/prisma.service";

function assertBranchAccess(staff: StaffJwtPayload, branchId: string) {
  if (staff.isOwner) return;
  if (!staff.branchIds.includes(branchId)) {
    throw new ForbiddenException({ code: "BRANCH_SCOPE_DENIED", message: "You do not have access to this branch" });
  }
}

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(staff: StaffJwtPayload, branchId?: string) {
    if (branchId) assertBranchAccess(staff, branchId);
    return this.prisma.restaurantTable.findMany({
      where: { branchId: branchId ?? (staff.isOwner ? undefined : { in: staff.branchIds }) },
      orderBy: { number: "asc" },
    });
  }

  async create(staff: StaffJwtPayload, input: CreateTableInput) {
    assertBranchAccess(staff, input.branchId);
    return this.prisma.restaurantTable.create({ data: input });
  }

  private async getOwned(staff: StaffJwtPayload, id: string) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id } });
    if (!table) throw new NotFoundException({ code: "TABLE_NOT_FOUND", message: "Table not found" });
    assertBranchAccess(staff, table.branchId);
    return table;
  }

  async update(staff: StaffJwtPayload, id: string, input: UpdateTableInput) {
    await this.getOwned(staff, id);
    return this.prisma.restaurantTable.update({ where: { id }, data: input });
  }

  async remove(staff: StaffJwtPayload, id: string) {
    await this.getOwned(staff, id);
    await this.prisma.restaurantTable.delete({ where: { id } });
    return { deleted: true };
  }
}
