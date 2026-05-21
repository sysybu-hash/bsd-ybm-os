declare module "react-signature-canvas" {
  import type {
    CanvasHTMLAttributes,
    ForwardRefExoticComponent,
    RefAttributes,
  } from "react";

  export interface SignatureCanvasRef {
    clear: () => void;
    isEmpty: () => boolean;
    toDataURL: (type?: string, encoderOptions?: number) => string;
    fromDataURL?: (data: string, options?: Record<string, unknown>) => void;
    getCanvas?: () => HTMLCanvasElement;
    /** Returns a trimmed copy of the signature canvas */
    getTrimmedCanvas: () => HTMLCanvasElement;
    getSignaturePad?: () => unknown;
  }

  export interface SignatureCanvasProps {
    canvasProps?: CanvasHTMLAttributes<HTMLCanvasElement>;
    backgroundColor?: string;
    penColor?: string;
    velocityFilterWeight?: number;
    minWidth?: number;
    maxWidth?: number;
    onEnd?: () => void;
  }

  const SignatureCanvas: ForwardRefExoticComponent<
    SignatureCanvasProps & RefAttributes<SignatureCanvasRef>
  >;
  export default SignatureCanvas;
}
