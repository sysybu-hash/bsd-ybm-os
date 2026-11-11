"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus, X } from "lucide-react";

export type MembersLabels = {
  title: string;
  owner: string;
  member: string;
  you: string;
  pending: string;
  invitePlaceholder: string;
  invite: string;
  invited: string;
  remove: string;
  revoke: string;
  ownerOnly: string;
  errors: Record<string, string>;
};

type Member = { userId: string; email: string; name: string | null; role: string };
type Invite = { id: string; email: string };

/** The office's users: members, open invitations, and — for the owner — invite, take back, remove. */
export function MembersCard({ me, isOwner, members, invites, labels }: { me: string; isOwner: boolean; members: Member[]; invites: Invite[]; labels: MembersLabels }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const call = async (key: string, method: "POST" | "DELETE", body: object, okText?: string) => {
    setBusy(key);
    setMsg(null);
    const res = await fetch("/api/vmb/account/members", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { code?: string } | null;
    setBusy(null);
    if (!res?.ok) return setMsg({ ok: false, text: labels.errors[data?.code ?? "failed"] ?? labels.errors.failed ?? "" });
    if (okText) setMsg({ ok: true, text: okText });
    router.refresh();
  };

  const onInvite = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    void call("invite", "POST", { email }, labels.invited).then(() => form.reset());
  };

  const x = "grid h-7 w-7 place-items-center rounded-full text-[color:var(--vmb-muted)] hover:text-[color:var(--vmb-fail)] disabled:opacity-50";
  return (
    <div className="vmb-card p-7">
      <h2 className="text-xl font-bold">{labels.title}</h2>
      <ul className="mt-4 divide-y divide-[color:var(--vmb-line)] text-sm">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate">{m.name ?? m.email}</span>
              <span className="vmb-mono block truncate text-xs text-[color:var(--vmb-muted)]" dir="ltr">
                {m.email}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-[color:var(--vmb-ink-soft)]">
              {m.userId === me ? labels.you : m.role === "owner" ? labels.owner : labels.member}
              {isOwner && m.userId !== me ? (
                <button type="button" aria-label={labels.remove} title={labels.remove} disabled={busy != null} onClick={() => void call(m.userId, "DELETE", { userId: m.userId })} className={x}>
                  {busy === m.userId ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                </button>
              ) : null}
            </span>
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="vmb-mono min-w-0 truncate text-xs" dir="ltr">
              {i.email}
            </span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-[color:var(--vmb-warn)]">
              {labels.pending}
              {isOwner ? (
                <button type="button" aria-label={labels.revoke} title={labels.revoke} disabled={busy != null} onClick={() => void call(i.id, "DELETE", { inviteId: i.id })} className={x}>
                  {busy === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {isOwner ? (
        <form onSubmit={onInvite} className="mt-4 flex gap-2">
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            aria-label={labels.invitePlaceholder}
            placeholder={labels.invitePlaceholder}
            dir="ltr"
            className="min-w-0 flex-1 rounded-full border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-sunk)] px-4 py-2 text-sm"
          />
          <button type="submit" disabled={busy != null} className="flex shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--vmb-accent)] px-4 py-2 text-sm font-bold text-[color:var(--vmb-accent-ink)] disabled:opacity-60">
            {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
            {labels.invite}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-xs text-[color:var(--vmb-muted)]">{labels.ownerOnly}</p>
      )}
      {msg ? <p className={`mt-2 text-xs ${msg.ok ? "text-[color:var(--vmb-pass)]" : "text-[color:var(--vmb-fail)]"}`}>{msg.text}</p> : null}
    </div>
  );
}
