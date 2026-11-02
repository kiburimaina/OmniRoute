import "server-only";
import type { PoolClient } from "pg";
import { authorizeApprovedAction, type ApprovedActionRequest, type AuthorizedAction } from "./approved-action-boundary";
import type { ApprovalAction } from "./approval-policy";
import { persistAuthorizedDispatch } from "./durable-action-dispatch";

export type ActionHandlerContext = Readonly<{ organizationId: string; taskId: string; approvalId: string; payloadHash: string; action: ApprovalAction }>;
export type ActionHandlerResult = Readonly<{ status: "completed" | "accepted"; reference?: string }>;
export type ActionHandler = (details: Readonly<Record<string, unknown>>, context: ActionHandlerContext) => Promise<ActionHandlerResult>;
const HANDLERS = new Map<ApprovalAction, ActionHandler>();
export class ActionDispatchDenied extends Error { constructor(message: string) { super(message); this.name = "ActionDispatchDenied"; } }
export function registerActionHandler(action: ApprovalAction, handler: ActionHandler): void { if (HANDLERS.has(action)) throw new ActionDispatchDenied(`A handler is already registered for ${action}`); HANDLERS.set(action, handler); }
export function registeredActionTypes(): ApprovalAction[] { return [...HANDLERS.keys()]; }
export type ActionDispatchRequest = ApprovedActionRequest & { idempotencyKey: string };
export type AuthorizedDispatch = Readonly<{ authorization: AuthorizedAction; details: Readonly<Record<string, unknown>> }>;
/** Persist authorization and dispatch intent in the caller's tenant-scoped transaction. */
export async function authorizeActionDispatch(client: PoolClient, request: ActionDispatchRequest): Promise<AuthorizedDispatch> {
  if (!HANDLERS.has(request.action as ApprovalAction)) throw new ActionDispatchDenied("No reviewed handler is registered for this action");
  const authorization = await authorizeApprovedAction(client, request);
  await persistAuthorizedDispatch(client, authorization, request.details, request.idempotencyKey);
  return Object.freeze({ authorization, details: Object.freeze(structuredClone(request.details)) });
}
/** Process-local tokens cannot authorize side effects; a durable worker lease is required. */
export async function runAuthorizedAction(_token: AuthorizedDispatch): Promise<ActionHandlerResult> {
  throw new ActionDispatchDenied("Direct execution is disabled; claim the durable dispatch through the reviewed worker boundary");
}
