"use client";

import { Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  generateClientPassword,
  passwordMeetsRules,
  scorePasswordStrength,
} from "@/lib/auth/client-password";

type Props = {
  password: string;
  confirm: string;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  labels: {
    password: string;
    confirm: string;
    generate: string;
    copy: string;
    requirements: string;
    generateSuccess?: string;
    passwordMismatch?: string;
  };
};

export default function PasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  labels,
}: Props) {
  const strength = scorePasswordStrength(password);
  const strengthBar =
    strength === "weak"
      ? "w-1/4 bg-rose-500"
      : strength === "fair"
        ? "w-2/4 bg-amber-500"
        : strength === "good"
          ? "w-3/4 bg-blue-500"
          : "w-full bg-emerald-500";

  const handleGenerate = () => {
    const p = generateClientPassword();
    onPasswordChange(p);
    onConfirmChange(p);
    toast.success(labels.generateSuccess ?? "נוצרה סיסמה חזקה");
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-bold">
        {labels.password}
        <div className="relative mt-1">
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-3 pe-24 text-sm"
          />
          <div className="absolute end-2 top-1/2 flex -translate-y-1/2 gap-1">
            <button
              type="button"
              onClick={handleGenerate}
              className="rounded-md p-2 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
              title={labels.generate}
              aria-label={labels.generate}
            >
              <RefreshCw size={16} aria-hidden />
            </button>
            {password ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(password);
                  toast.success(labels.copy);
                }}
                className="rounded-md p-2 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                aria-label={labels.copy}
              >
                <Copy size={16} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </label>
      {password ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-soft)]">
          <div className={`h-full transition-all ${strengthBar}`} />
        </div>
      ) : null}
      <p className="text-xs text-[color:var(--foreground-muted)]">{labels.requirements}</p>
      <label className="block text-sm font-bold">
        {labels.confirm}
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-transparent p-3 text-sm"
        />
      </label>
      {confirm && password !== confirm ? (
        <p className="text-xs font-semibold text-rose-600">{labels.passwordMismatch ?? "הסיסמאות אינן תואמות"}</p>
      ) : null}
      {password && !passwordMeetsRules(password) ? (
        <p className="text-xs font-semibold text-amber-600">{labels.requirements}</p>
      ) : null}
    </div>
  );
}
