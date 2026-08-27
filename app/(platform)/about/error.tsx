"use client";

import RouteErrorBoundary from "@/components/errors/RouteErrorBoundary";

type Props = Readonly<{ error: Error & { digest?: string }; reset: () => void }>;

export default function AboutError({ error, reset }: Props) {
  return <RouteErrorBoundary error={error} reset={reset} route="about" homeHref="/" />;
}
