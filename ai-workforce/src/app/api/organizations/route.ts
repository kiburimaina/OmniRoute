import { z } from "zod";
import { apiError, HttpError, requireSameOrigin, readJson, withUserTransaction } from "@/lib/db";

export const runtime = "nodejs";

const CreateOrganization = z.object({
  name: z.string().trim().min(2).max(120),
});

export async function GET() {
  try {
    const organizations = await withUserTransaction(async (client, userId) => {
      const result = await client.query(
        `SELECT o.id, o.name, m.role
         FROM organizations o
         JOIN organization_members m ON m.organization_id = o.id
         WHERE m.user_id = $1
         ORDER BY o.created_at ASC`,
        [userId],
      );
      return result.rows;
    });
    return Response.json({ organizations });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const parsed = CreateOrganization.safeParse(await readJson(request));
    if (!parsed.success) {
      return Response.json({ error: "Enter an organisation name between 2 and 120 characters." }, { status: 400 });
    }

    const organization = await withUserTransaction(async (client, userId) => {
      const created = await client.query(
        "INSERT INTO organizations (name) VALUES ($1) RETURNING id, name, created_at AS \"createdAt\"",
        [parsed.data.name],
      );
      const org = created.rows[0];
      await client.query(
        "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')",
        [org.id, userId],
      );
      await client.query(
        "INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, resource_type, resource_id, metadata) VALUES ($1, $2, 'user', 'organization.created', 'organization', $3, $4::jsonb)",
        [org.id, userId, org.id, JSON.stringify({ name: org.name })],
      );
      return { ...org, role: "owner" };
    });
    return Response.json({ organization }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
