import {
  inventoryIdFromVirtualRequest,
  isVirtualRequestId,
  VIRTUAL_REQUEST_PREFIX,
} from "@/lib/procurement/request-id";

describe("request-id", () => {
  it("detects virtual request ids", () => {
    expect(isVirtualRequestId(`${VIRTUAL_REQUEST_PREFIX}clxyz123`)).toBe(true);
    expect(isVirtualRequestId("clreal123")).toBe(false);
  });

  it("extracts inventory id from virtual request", () => {
    expect(inventoryIdFromVirtualRequest(`${VIRTUAL_REQUEST_PREFIX}inv1`)).toBe("inv1");
    expect(inventoryIdFromVirtualRequest(`${VIRTUAL_REQUEST_PREFIX}`)).toBeNull();
    expect(inventoryIdFromVirtualRequest("real-id")).toBeNull();
  });
});
