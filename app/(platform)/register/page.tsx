import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = new URLSearchParams();
  q.set("mode", "register");
  for (const [key, value] of Object.entries(params)) {
    if (key === "mode") continue;
    if (typeof value === "string") q.set(key, value);
    else if (Array.isArray(value) && value[0]) q.set(key, value[0]);
  }
  redirect(`/login?${q.toString()}`);
}
