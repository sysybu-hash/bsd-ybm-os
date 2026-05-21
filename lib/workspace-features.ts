/**
 * Dummy file to satisfy legacy imports after cleanup.
 * The workspace feature blocking logic has been removed.
 */

export type WorkspaceFeatureInput = Record<string, unknown>;

export function shouldBlockWorkspacePrimaryPath(_pathname: string, _input: WorkspaceFeatureInput): boolean {
  return false;
}

export function workspaceFeatureInputFromJwtClaims(_token: Record<string, unknown>): WorkspaceFeatureInput | null {
  return null;
}
