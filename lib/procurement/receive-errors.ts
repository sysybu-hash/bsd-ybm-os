export type ReceivePoErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_ORDER_STATUS"
  | "LINE_NOT_FOUND"
  | "OVER_RECEIVE"
  | "INVENTORY_NOT_FOUND";

export class ReceivePoError extends Error {
  readonly code: ReceivePoErrorCode;

  constructor(code: ReceivePoErrorCode) {
    super(code);
    this.name = "ReceivePoError";
    this.code = code;
  }
}

export type UpdatePoStatusErrorCode =
  | "ORDER_NOT_FOUND"
  | "INVALID_TRANSITION";

export class UpdatePoStatusError extends Error {
  readonly code: UpdatePoStatusErrorCode;

  constructor(code: UpdatePoStatusErrorCode) {
    super(code);
    this.name = "UpdatePoStatusError";
    this.code = code;
  }
}
