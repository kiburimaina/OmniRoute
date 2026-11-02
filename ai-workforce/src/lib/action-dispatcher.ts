import "server-only";
import type { PoolClient } from "pg";
import {
  authorizeApprovedAction,
  type ApprovedActionRequest,
  type AuthorizedAction,
} from "./approved-action-boundary";
import type { ApprovalAction } from "./approval-policy";
import { persistAuthorizedDispatch } from "./durable-action-dispatch";

export type ActionHandlerContext = Readonly<{
  organizationId: string;
  taskId: string;
  approvalId: string;
  payloadHash: string;
  action: ApprovalAction;
}>;

export type ActionHandlerResult = Readonly<{
  status: "completed" | "accepted";
  reference?: string;
}>;

export type ActionHandler = (
  details: Readonly<Record<string, unknown>>,
  context: ActionHandlerContext,
) => Promise<ActionHandlerResult>;

// Deliberately empty: handlers are added only after an individual security review.
const HANDLERS = new Map<ApprovalAction, ActionHandler>();
const AUTHORIZED_TOKENS = new WeakSet<object>();
const CONSUMED_TOKENS = new WeakSet<object>();

export class ActionDispatchDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionDispatchDenied";
  }
}

/**
 * Register reviewed application code. Handlers receive no database client,
 * credentials, provider SDK, or platform-wide tool registry.
 */
export function registerActionHandler(action: ApprovalAction, handler: ActionHandler): void {
  if (HANDLERS.has(action)) throw new ActionDispatchDenied(`A handler is already registered for ${action}`);
  HANDLERS.set(action, handler);
}

export function registeredActionTypes(): ApprovalAction[] {
  return [...HANDLERS.keys()];
}

export type AuthorizedDispatch = Readonly<{
  authorization: AuthorizedAction;
  details: Readonly<Record<string, unknown>>;
}>;

/**
 * Call inside a tenant-scoped DB transaction. The returned token is valid
 * only in this process and must not be executed until the caller commits.
 */
export async function authorizeActionDispatch(
  client: PoolClient,
  request: ApprovedActionRequest,
): Promise<AuthorizedDispatch> {
  const handler = HANDLERS.get(request.action as ApprovalAction);
  if (!handler) throw new ActionDispatchDenied("No reviewed handler is registered for this action");
  const authorization = await authorizeApprovedAction(client, request);
  const token: AuthorizedDispatch = Object.freeze({
    authorization,
    details: Object.freeze(structuredClone(request.details)),
  });
  AUTHORIZED_TOKENS.add(token);
  return token;
}

/**
 * Invoke only after the transaction that consumed approval and reserved spend
 * has committed. Tokens are process-local, one-use, and cannot be fabricated
 * by serializing a request. This is not a durable job runner.
 */
export async function runAuthorizedAction(token: AuthorizedDispatch): Promise<ActionHandlerResult> {
  if (!token || !AUTHORIZED_TOKENS.has(token)) {
    throw new ActionDispatchDenied("A live authorization token is required");
  }
  if (CONSUMED_TOKENS.has(token)) throw new ActionDispatchDenied("Authorization token has already been used");
  CONSUMED_TOKENS.add(token);

  const action = token.authorization.action;
  if (!["external_message", "publish", "purchase", "deploy", "repository_merge"].includes(action)) {
    throw new ActionDispatchDenied("Unsupported action category");
  }
  const handler = HANDLERS.get(action as ApprovalAction);
  if (!handler) throw new ActionDispatchDenied("Reviewed handler is no longer registered");

  return handler(token.details, Object.freeze({
    organizationId: token.authorization.organizationId,
    taskId: token.authorization.taskId,
    approvalId: token.authorization.approvalId,
    payloadHash: token.authorization.payloadHash,
    action: action as ApprovalAction,
  }));
}
