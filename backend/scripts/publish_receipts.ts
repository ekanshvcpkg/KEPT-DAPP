// Publishes every Keeper receipt in the database to Supabase Storage (public bucket keeper-receipts). Idempotent.
//   cd backend && npx tsx scripts/publish_receipts.ts
import "dotenv/config";
import { prisma } from "../src/db";
import { publishReceipt } from "../src/v4/receiptStore";
import type { Receipt } from "../src/v4/keeper";

const rows = await prisma.proofVerification.findMany({ where: { receiptHash: { not: null } }, select: { receiptHash: true, receipt: true } });
let ok = 0;
for (const r of rows) if (r.receiptHash && r.receipt && (await publishReceipt(r.receiptHash, r.receipt as unknown as Receipt))) ok++;
console.log(`${ok} of ${rows.length} receipts published`);
await prisma.$disconnect();
