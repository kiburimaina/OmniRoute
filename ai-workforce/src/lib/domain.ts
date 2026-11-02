import { z } from "zod";

export const IdSchema = z.string().uuid();
export const OrganizationSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  createdAt: z.string().datetime(),
});
export const ProjectSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).default(""),
  createdAt: z.string().datetime(),
});
export const TaskStatusSchema = z.enum([
  "queued", "running", "waiting_approval", "succeeded", "failed", "cancelled",
]);
export const TaskSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  projectId: IdSchema.nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10000).default(""),
  status: TaskStatusSchema,
  createdAt: z.string().datetime(),
});
export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);
export const ApprovalSchema = z.object({
  id: IdSchema,
  organizationId: IdSchema,
  taskId: IdSchema,
  action: z.string().min(1).max(120),
  status: ApprovalStatusSchema,
  requestedAt: z.string().datetime(),
});

export type Organization = z.infer<typeof OrganizationSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
