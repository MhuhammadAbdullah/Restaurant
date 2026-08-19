export type StaffJwtPayload = {
  sub: string; // StaffUser.id
  aud: "staff";
  restaurantId: string;
  roleId: string;
  branchIds: string[];
  isOwner: boolean;
  allBranchesAccess: boolean;
};

export type CustomerJwtPayload = {
  sub: string; // Customer.id
  aud: "customer";
  restaurantId: string;
};

export type AppJwtPayload = StaffJwtPayload | CustomerJwtPayload;

export function isStaffPayload(payload: AppJwtPayload): payload is StaffJwtPayload {
  return payload.aud === "staff";
}

export function isCustomerPayload(payload: AppJwtPayload): payload is CustomerJwtPayload {
  return payload.aud === "customer";
}
