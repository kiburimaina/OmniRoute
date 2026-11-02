import { z } from "zod";
import { apiError, withOrganization } from "@/lib/db";

export const runtime = "nodejs";

const CreateProject = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).default(""),
});

export async function GET(request: Request) {
  try {
    const organizationId = new URL(request.url).searchParams.get("organizationId");
    if (!organizationId || !z.string().uuid().safeParse(organizationId).success) {
      return Response.json({ error: "A valid organizationId is required" }, { status: 400 });
    }
    const projects = await withOrganization(organizationId, ["owner", "admin", "operator", "viewer"], async (client) => {
      const result = await client.query(
        "SELECT id, organization_id AS \"organizationId\", name, description, created_at AS \"createdAt\" FROM projects WHERE organization_id = $1 ORDER BY created_at DESC",
        [organizationId],
      );
      return result.rows;
    });
    return Response.json({ projects });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const parsed = CreateProject.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid project details", details: parsed.error.flatten() }, { status: 400 });
    }
    const input = parsed.data;
    const project = await withOrganization(input.organizationId, ["owner", "admin", "operator"], async (client) => {
      const result = await client.query(
        "INSERT INTO projects (organization_id, name, description) VALUES ($1, $2, $3) RETURNING id, organization_id AS \"organizationId\", name, description, created_at AS \"createdAt\"",
        [input.organizationId, input.name, input.description],
      );
      return result.rows[0];
    });
    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
