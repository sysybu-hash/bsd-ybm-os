export type PoErrorCode =
  | "SUPPLIER_NOT_FOUND"
  | "REQUEST_NOT_FOUND"
  | "INVENTORY_NOT_FOUND"
  | "REQUEST_NOT_PENDING";

export class PoError extends Error {
  readonly code: PoErrorCode;

  constructor(code: PoErrorCode) {
    super(code);
    this.name = "PoError";
    this.code = code;
  }
}

export type PoDocumentErrorCode =
  | "ORDER_NOT_FOUND"
  | "ORDER_CANCELLED"
  | "NO_LINES"
  | "ORG_NOT_FOUND"
  | "NUMBER_ALLOC_FAILED";

export class PoDocumentError extends Error {
  readonly code: PoDocumentErrorCode;

  constructor(code: PoDocumentErrorCode) {
    super(code);
    this.name = "PoDocumentError";
    this.code = code;
  }
}
