"use client";

import RouteErrorBoundary from "@/components/errors/RouteErrorBoundary";

type Props = Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>;

export default function MDashboardScannerError({ error, reset }: Props) {
  return <RouteErrorBoundary error={error} reset={reset} route="m/dashboard/scanner" />;
}
