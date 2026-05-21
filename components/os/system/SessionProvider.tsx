"use client";

import { SessionProvider as Provider } from "next-auth/react";
import { ReactNode } from "react";

export default function SessionProvider({ children, session }: { children: ReactNode; session: any }) {
  return (
    <Provider session={session} refetchOnWindowFocus refetchInterval={5 * 60}>
      {children}
    </Provider>
  );
}
