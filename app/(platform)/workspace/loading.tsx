/** Splash is owned by workspace/layout OsBootHost — avoid a second instance here. */
export default function Loading() {
  return (
    <div
      className="fixed inset-0 z-0 bg-[color:var(--background-main)]"
      aria-hidden
    />
  );
}
