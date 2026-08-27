import { LoadingAnnouncement } from "@/components/errors/LoadingAnnouncement";

export default function GoogleIntegrationLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--background-main)]" aria-busy="true">
      <LoadingAnnouncement />
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-pulse rounded-full bg-[color:var(--border-main)]" />
        <div className="h-4 w-40 animate-pulse rounded-lg bg-[color:var(--border-main)]" />
      </div>
    </div>
  );
}
