import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Nested /m/dashboard/more/* → full workspace OS. */
export default function MobileMoreLayout() {
  redirect("/workspace");
}
