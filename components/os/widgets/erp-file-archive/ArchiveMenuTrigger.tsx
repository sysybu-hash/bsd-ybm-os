"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { ArchiveActionMenu } from "./ArchiveActionMenu";
import type { ErpArchiveFile } from "./types";
import { useIsMounted } from "@/hooks/use-is-mounted";

const MENU_WIDTH = 168;
const MENU_ESTIMATE = 148;
const VIEWPORT_PAD = 8;

type MenuActionProps = {
  archiveView: string;
  dir: string;
  onPreview: (f: ErpArchiveFile) => void;
  onDownload: (f: ErpArchiveFile) => Promise<void>;
  onDelete: (f: ErpArchiveFile) => void;
  onRestore: (f: ErpArchiveFile) => Promise<void>;
};

type Props = MenuActionProps & {
  file: ErpArchiveFile;
  isOpen: boolean;
  onToggle: () => void;
  menuLabel: string;
  buttonClassName?: string;
};

export function ArchiveMenuTrigger({
  file,
  isOpen,
  onToggle,
  menuLabel,
  buttonClassName = "rounded-lg p-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10 hover:text-[color:var(--foreground-main)]",
  ...actionProps
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const mounted = useIsMounted();

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Skip hidden duplicate mounts (e.g. desktop + mobile archive panes in the same page).
    if (rect.width === 0 || rect.height === 0) {
      setCoords(null);
      return;
    }
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUp = spaceBelow < MENU_ESTIMATE && spaceAbove > spaceBelow;
    const top = openUp
      ? Math.max(VIEWPORT_PAD, rect.top - MENU_ESTIMATE - 4)
      : Math.min(window.innerHeight - MENU_ESTIMATE - VIEWPORT_PAD, rect.bottom + 4);
    const left = Math.min(
      Math.max(VIEWPORT_PAD, rect.right - MENU_WIDTH),
      window.innerWidth - MENU_WIDTH - VIEWPORT_PAD,
    );
    setCoords({ top, left });
  }, []);

  // Drop stale coordinates as the menu closes, during render, so a menu
  // reopened on another row never flashes at the previous row's position.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (!isOpen) setCoords(null);
  }

  useLayoutEffect(() => {
    if (!isOpen) return;
    /**
     * The menu is placed from the trigger's measured rect, which does not exist
     * until after layout — there is no render-time value to derive this from.
     * `useLayoutEffect` means the position is set before paint, so the menu
     * never appears at the wrong coordinates.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updatePosition();
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  const menu =
    isOpen && coords && mounted
      ? createPortal(
          <ArchiveActionMenu
            {...actionProps}
            file={file}
            className="fixed z-[2500] min-w-[168px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] py-1 shadow-xl"
            style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
          />,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-archive-menu-trigger
        aria-label={menuLabel}
        aria-expanded={isOpen}
        className={buttonClassName}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <MoreVertical size={16} aria-hidden />
      </button>
      {menu}
    </>
  );
}
