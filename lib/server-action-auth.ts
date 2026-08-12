/** @deprecated Prefer `@/lib/auth/server-action-auth` (bounded context). */
export {
  financeMutationRoles,
  requireWorkspaceAction,
  requireOSAdminAction,
} from "@/lib/auth/server-action-auth";
export type {
  WorkspaceActionContext,
  OSAdminActionContext,
  ActionAuthFailure,
  WorkspaceActionOk,
  OSAdminActionOk,
} from "@/lib/auth/server-action-auth";
