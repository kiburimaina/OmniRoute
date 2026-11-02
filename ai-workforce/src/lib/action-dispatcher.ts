import "server-only";
import type { PoolClient } from "pg";
import {
  authorizeApprovedAction,
  type ApprovedActionRequest,
  type AuthorizedAction,
} from "./approved-action-boundary";
import type { ApprovalAction } from "./approval-policy";
import { persistAuthorizedDispatch } from "./durable-action-dispatch";
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

export type ActionDispatchRequest = ApprovedActionRequest & { idempotencyKey: string };

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
  request: ActionDispatchRequest,
): Promise<AuthorizedDispatch> {
  const handler = HANDLERS.get(request.action as ApprovalAction);
  if (!handler) throw new ActionDispatchDenied("No reviewed handler is registered for this action");
  const authorization = await authorizeApprovedAction(client, request);
  await persistAuthorizedDispatch(client, authorization, request.details, request.idempotencyKey);
  const token: AuthorizedDispatch = Object.freeze({
    authorization,
    details: Object.freeze(structuredClone(request.details)),
  });
  AUTHORIZED_TOKENS.add(token);
  return token;
}

/**
 * Execution is intentionally disabled until a worker presents a claimed
 * durable-dispatch lease. A process-local token is never sufficient authority
 * to trigger an external or consequential side effect.
 */
export async function runAuthorizedAction(_token: AuthorizedDispatch): Promise<ActionHandlerResult> {
  throw new ActionDispatchDenied("Direct execution is disabled; claim the durable dispatch through the reviewed worker boundary");
}
