"use client";

import { SessionProvider as Provider } from "next-auth/react";
import type { Session } from "next-auth";
import { ReactNode } from "react";

export default function SessionProvider({ children, session }: { children: ReactNode; session: Session | null }) {
  return (
    <Provider session={session} refetchOnWindowFocus={false} refetchInterval={5 * 60}>
      {children}
    </Provider>
  );
}
