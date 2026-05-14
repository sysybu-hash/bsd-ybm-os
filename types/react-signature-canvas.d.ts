declare module "react-signature-canvas" {
  import type {
    CanvasHTMLAttributes,
    ForwardRefExoticComponent,
    RefAttributes,
  } from "react";

  export interface SignatureCanvasRef {
    clear: () => void;
    isEmpty: () => boolean;
    toDataURL: (type?: string) => string;
    fromDataURL?: (data: string) => void;
    getCanvas?: () => HTMLCanvasElement;
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
