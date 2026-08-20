export const VIRTUAL_REQUEST_PREFIX = "auto-";

export function isVirtualRequestId(id: string): boolean {
  return id.startsWith(VIRTUAL_REQUEST_PREFIX);
}

export function inventoryIdFromVirtualRequest(id: string): string | null {
  if (!isVirtualRequestId(id)) return null;
  const inventoryId = id.slice(VIRTUAL_REQUEST_PREFIX.length);
  return inventoryId.length > 0 ? inventoryId : null;
}
