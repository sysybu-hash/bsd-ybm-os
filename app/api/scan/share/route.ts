/**
 * PWA Web Share Target handler.
 * Registered in /public/manifest.json → share_target.action.
 *
 * When the user shares a file (image / PDF) to the app from another Android/iOS app,
 * the browser POSTs multipart/form-data here.  We redirect to the workspace with the
 * scanner widget open — the file will be in the form body, but the OS scanner widget
 * reads from the drag-and-drop / file-picker flow, so we just redirect for now.
 *
 * TODO: persist shared files to a temporary upload slot and auto-load them in the scanner.
 */
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export async function POST() {
  // Redirect to scanner widget. The client-side scanner widget handles the UX.
  redirect("/?w=aiScanner&share=1");
}
