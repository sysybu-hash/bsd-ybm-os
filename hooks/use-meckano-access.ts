"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { isMeckanoSubscriberEmail } from "@/lib/meckano-access";

export function useMeckanoAccess() {
  const { data: session, status } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      setAllowed(false);
      return;
    }

    if (isMeckanoSubscriberEmail(session?.user?.email)) {
      setAllowed(true);
      return;
    }

    setAllowed(false);

  }, [status, session?.user?.email]);

  const loading = status === "loading" || (status === "authenticated" && allowed === null);

  return {
    allowed: allowed === true,
    loading,
  };
}
