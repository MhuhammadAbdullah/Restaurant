/**
 * Every entity ID in the schema uses Prisma's `@default(cuid())`, and the shared `idSchema`
 * (`z.string().cuid()`) validates against that shape everywhere IDs travel through a request
 * body. Whenever a service needs to know a row's ID *before* insertion (e.g. to correlate
 * batched `createMany` children to their not-yet-created parent), it can't rely on Prisma's
 * default — it has to generate the ID itself. Using `randomUUID()` directly for that produces
 * hyphenated UUIDs, which fail `idSchema`'s cuid check the moment that ID is sent back to the
 * client and round-trips through a validated endpoint. This keeps the same crypto-strong
 * randomness but reshapes it to satisfy `z.string().cuid()` (starts with "c", no hyphens/spaces).
 */
export function generateCuidLikeId(): string {
  return `c${crypto.randomUUID().replace(/-/g, "")}`;
}
