/**
 * Dummy file to satisfy legacy imports after cleanup.
 * The workspace feature blocking logic has been removed.
 */

export type WorkspaceFeatureInput = any;

export function shouldBlockWorkspacePrimaryPath(pathname: string, input: any): boolean {
  return false;
}

export function workspaceFeatureInputFromJwtClaims(token: any): any {
  return null;
}
