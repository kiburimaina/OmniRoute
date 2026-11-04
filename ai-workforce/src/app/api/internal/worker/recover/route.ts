import { z } from "zod";
import { apiError, readJson, withWorkerTransaction } from "@/lib/db";
import { recoverExpiredLeases } from "@/lib/task-queue";
import { getWorkerAllowedOrganizations, requireWorkerAuthentication } from "@/lib/worker-auth";

export const runtime = "nodejs";

const RecoveryRequest = z.object({
  leaseSeconds: z.number().int().min(30).max(3600).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    requireWorkerAuthentication(request);
    const parsed = RecoveryRequest.safeParse(await readJson(request));
    if (!parsed.success) return Response.json({ error: "Invalid worker recovery request" }, { status: 400 });

    // Never accept tenant IDs from the request. Recovery is restricted to the
    // server-side worker allowlist and each tenant is processed in its own RLS transaction.
    const organizations = getWorkerAllowedOrganizations();
    const leaseSeconds = parsed.data.leaseSeconds ?? 300;
    const recovered: Array<{ organizationId: string; count: number }> = [];

    for (const organizationId of organizations) {
      const count = await withWorkerTransaction(
        organizationId,
        (client) => recoverExpiredLeases(client, organizationId, leaseSeconds),
      );
      recovered.push({ organizationId, count });
    }

    return Response.json({
      recovered: recovered.reduce((total, item) => total + item.count, 0),
      organizations: recovered,
    });
  } catch (error) {
    return apiError(error);
  }
}
