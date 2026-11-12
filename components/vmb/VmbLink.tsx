"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { VMB_BRAND } from "@/lib/vmb/brand";

/**
 * VMB lives at two addresses: its own host (`vmb.bsd-ybm.co.il/login`) and a
 * path prefix on any other host (`…/vmb/login` — previews, local dev). The
 * visible URL tells which one we are on, so links keep the same form.
 */
export function useVmbBase(): string {
  const pathname = usePathname() ?? "";
  const prefix = VMB_BRAND.pathPrefix;
  return pathname === prefix || pathname.startsWith(`${prefix}/`) ? prefix : "";
}

export function vmbPath(base: string, href: string): string {
  if (href.startsWith("#") || /^[a-z]+:/i.test(href)) return href;
  if (href === "/") return base || "/";
  return `${base}${href}`;
}

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export function VmbLink({ href, ...rest }: Props) {
  const base = useVmbBase();
  return <Link href={vmbPath(base, href)} {...rest} />;
}
