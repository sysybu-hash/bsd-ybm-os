import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import HelpCenterWidget from "@/components/os/widgets/HelpCenterWidget";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login?callbackUrl=/help");
  }

  return (
    <div className="min-h-screen bg-[color:var(--background-main)]" dir="rtl">
      <div className="mx-auto max-w-5xl p-4">
        <Link href="/" className="mb-4 inline-block text-sm font-bold text-blue-600 hover:underline">
          ← חזרה למרחב העבודה
        </Link>
        <div className="h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-[color:var(--border-main)] shadow-lg">
          <HelpCenterWidget />
        </div>
      </div>
    </div>
  );
}
