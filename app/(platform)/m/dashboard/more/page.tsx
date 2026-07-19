import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** More grid retired for core-mobile focus — open full OS. */
export default function MobileMoreRedirectPage() {
  redirect("/workspace");
}
