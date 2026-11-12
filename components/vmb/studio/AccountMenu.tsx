"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useVmbBase, vmbPath } from "@/components/vmb/VmbLink";

/** The signed-in user's chip with a sign-out button. */
export function AccountMenu({ name, image, logoutLabel }: { name: string; image: string | null; logoutLabel: string }) {
  const router = useRouter();
  const base = useVmbBase();
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/vmb/auth/logout", { method: "POST" });
    } finally {
      router.replace(vmbPath(base, "/login"));
      router.refresh();
    }
  };
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex items-center gap-2 rounded-full border border-[color:var(--vmb-line)] py-1 ps-1 pe-3 text-xs">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Google avatar host is not in next/image's allow-list
          <img src={image} alt="" className="h-6 w-6 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--vmb-accent)] text-[11px] font-bold text-[color:var(--vmb-accent-ink)]">
            {initial}
          </span>
        )}
        <span className="max-w-[140px] truncate">{name}</span>
      </span>
      <button
        type="button"
        onClick={logout}
        disabled={busy}
        aria-label={logoutLabel}
        title={logoutLabel}
        className="rounded-full p-2 hover:bg-[color:var(--vmb-bg-sunk)] disabled:opacity-50"
      >
        <LogOut className="h-4 w-4 rtl:rotate-180" />
      </button>
    </div>
  );
}
