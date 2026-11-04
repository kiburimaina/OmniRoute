import { getWorkflow } from "./department-workflows";

export const APPROVAL_ACTIONS = [
  "external_message",
  "publish",
  "purchase",
  "deploy",
  "repository_merge",
] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export function isApprovalAction(value: string): value is ApprovalAction {
  return (APPROVAL_ACTIONS as readonly string[]).includes(value);
}

export function isApprovalRequired(
  action: string,
  workflowId: string | null,
  policy: unknown,
): boolean {
  if (!isApprovalAction(action)) return false;

  // A known workflow is authoritative: never fall through to a broad default
  // policy, which could silently expand the workflow's approved action scope.
  if (workflowId) {
    const workflow = getWorkflow(workflowId);
    return workflow ? workflow.approvalActions.includes(action) : false;
  }

  if (policy && typeof policy === "object" && "requireApprovalFor" in policy) {
    const required = (policy as { requireApprovalFor?: unknown }).requireApprovalFor;
    return Array.isArray(required) && required.includes(action);
  }

  return ["external_message", "publish", "purchase", "deploy", "repository_merge"].includes(action);
}
