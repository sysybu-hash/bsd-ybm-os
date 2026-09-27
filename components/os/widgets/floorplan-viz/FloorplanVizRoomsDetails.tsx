"use client";

import React, { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  floorplanRoomKindSchema,
  inferRoomKind,
  type FloorplanLayout,
  type FloorplanRoom,
  type FloorplanRoomKind,
} from "@/lib/projects/floorplan-layout";
import { OsButton, OsIconButton } from "@/components/os/ui";
import { MeasuredPlanSvg, sourceLabel, type TFn } from "@/components/os/widgets/floorplan-viz/FloorplanVizGallery";

export type DraftRow = {
  key: string;
  base?: FloorplanRoom;
  name: string;
  kind: FloorplanRoomKind;
  area: string;
  /** Beds the sheet draws in the room; the audit grades a still's bed count against the sum. */
  beds?: string;
};

export function toDraft(rooms: FloorplanRoom[]): DraftRow[] {
  return rooms.map((room, i) => ({
    key: `r${i}`,
    base: room,
    name: room.name,
    kind: room.kind ?? inferRoomKind(room.name),
    area: room.areaM2 != null ? String(room.areaM2) : "",
    beds: room.bedCount != null ? String(room.bedCount) : "",
  }));
}

/**
 * The rows a person saved. A room they kept keeps what the read found for it —
 * its place on the sheet and its measures — even when they correct its kind:
 * a bedroom renamed ממ"ד is still the same room in the same place.
 */
export function fromDraft(rows: DraftRow[]): FloorplanRoom[] | null {
  const rooms: FloorplanRoom[] = [];
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) return null;
    const area = row.area.trim() === "" ? undefined : Number(row.area);
    if (area !== undefined && !(area > 0 && area < 1000)) return null;
    const bedsText = (row.beds ?? "").trim();
    const beds = bedsText === "" ? undefined : Number(bedsText);
    if (beds !== undefined && !(Number.isInteger(beds) && beds >= 0 && beds <= 8)) return null;
    rooms.push({
      ...(row.base ?? {}),
      name,
      kind: row.kind,
      areaM2: area,
      bedCount: beds,
    });
  }
  return rooms;
}

/**
 * The rooms the plan was read as, and a way for a person to correct them.
 *
 * The booklet's table is built from this list, and the read can miss what a
 * sheet only draws as outlines (דירה 14's 6.4 m² terrace) or call every
 * sleeping room a bedroom. Saving here replaces the read with a checked list.
 */
export default function FloorplanVizRoomsDetails({
  t,
  layout,
  engines,
  canEdit,
  onSave,
}: {
  t: TFn;
  layout: FloorplanLayout;
  engines: string[];
  canEdit: boolean;
  onSave?: (rooms: FloorplanRoom[]) => Promise<boolean>;
}) {
  const rooms = layout.rooms;
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const update = (key: string, patch: Partial<DraftRow>) =>
    setDraft((rows) => rows?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? null);

  const save = async () => {
    if (!draft || !onSave) return;
    const next = fromDraft(draft);
    if (!next || next.length === 0) {
      setInvalid(true);
      return;
    }
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setDraft(null);
  };

  return (
    <div className="space-y-3 border-t border-[color:var(--border-main)] p-3">
      <p className="text-[10px] text-[color:var(--foreground-muted)]">{t("projectDashboard.vizAccuracyNote")}</p>
      {engines.length > 0 ? (
        <p className="text-[10px] text-[color:var(--foreground-muted)]">
          {t("projectDashboard.vizGrounding")}: {engines.join(" • ")}
        </p>
      ) : null}
      {canEdit && onSave && !draft ? (
        <OsButton
          type="button"
          variant="secondary"
          size="sm"
          icon={<Pencil size={12} aria-hidden />}
          onClick={() => {
            setInvalid(false);
            setDraft(toDraft(rooms));
          }}
        >
          {t("workspaceWidgets.floorplanViz.editRooms")}
        </OsButton>
      ) : null}
      {draft ? (
        <div className="space-y-2 rounded-lg border border-[color:var(--border-main)] p-2">
          <p className="text-[10px] text-[color:var(--foreground-muted)]">{t("workspaceWidgets.floorplanViz.editRoomsHint")}</p>
          <ul className="space-y-1.5">
            {draft.map((row) => (
              <li key={row.key} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <input
                  aria-label={t("workspaceWidgets.floorplanViz.roomName")}
                  className="min-w-0 flex-1 rounded border border-[color:var(--border-main)] bg-transparent px-1.5 py-1"
                  value={row.name}
                  onChange={(e) => update(row.key, { name: e.target.value })}
                />
                <select
                  aria-label={t("workspaceWidgets.floorplanViz.kind")}
                  className="rounded border border-[color:var(--border-main)] bg-transparent px-1 py-1"
                  value={row.kind}
                  onChange={(e) => update(row.key, { kind: e.target.value as FloorplanRoomKind })}
                >
                  {floorplanRoomKindSchema.options.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`workspaceWidgets.floorplanViz.kinds.${kind}`)}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={t("workspaceWidgets.floorplanViz.roomArea")}
                  inputMode="decimal"
                  className="w-16 rounded border border-[color:var(--border-main)] bg-transparent px-1.5 py-1"
                  value={row.area}
                  placeholder={t("workspaceWidgets.floorplanViz.unitM2")}
                  onChange={(e) => update(row.key, { area: e.target.value })}
                />
                {row.kind === "bedroom" || row.kind === "mmd" ? (
                  <input
                    aria-label={t("workspaceWidgets.floorplanViz.roomBeds")}
                    inputMode="numeric"
                    className="w-12 rounded border border-[color:var(--border-main)] bg-transparent px-1.5 py-1"
                    value={row.beds ?? ""}
                    placeholder={t("workspaceWidgets.floorplanViz.roomBedsShort")}
                    onChange={(e) => update(row.key, { beds: e.target.value })}
                  />
                ) : null}
                <OsIconButton
                  label={t("workspaceWidgets.floorplanViz.removeRoom")}
                  size="sm"
                  onClick={() => setDraft((rows) => rows?.filter((r) => r.key !== row.key) ?? null)}
                >
                  <Trash2 size={12} />
                </OsIconButton>
              </li>
            ))}
          </ul>
          {invalid ? (
            <p role="alert" className="text-[10px] text-rose-700 dark:text-rose-200">
              {t("workspaceWidgets.floorplanViz.roomsInvalid")}
            </p>
          ) : null}
          <span className="flex flex-wrap items-center gap-1.5">
            <OsButton
              type="button"
              variant="secondary"
              size="sm"
              icon={<Plus size={12} aria-hidden />}
              onClick={() =>
                setDraft((rows) => [...(rows ?? []), { key: `n${Date.now()}`, name: "", kind: "balcony", area: "" }])
              }
            >
              {t("workspaceWidgets.floorplanViz.addRoom")}
            </OsButton>
            <OsButton type="button" size="sm" loading={saving} disabled={saving} onClick={() => void save()}>
              {t("workspaceWidgets.floorplanViz.saveRooms")}
            </OsButton>
            <OsButton type="button" variant="secondary" size="sm" disabled={saving} onClick={() => setDraft(null)}>
              {t("workspaceWidgets.floorplanViz.cancelRooms")}
            </OsButton>
          </span>
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-start text-[11px]">
          <thead>
            <tr className="text-[color:var(--foreground-muted)]">
              <th className="px-1 py-1 font-semibold">{t("projectDashboard.colDescription")}</th>
              <th className="px-1 py-1 font-semibold">{t("workspaceWidgets.floorplanViz.kind")}</th>
              <th className="px-1 py-1 font-semibold">{t("projectDashboard.vizDims")}</th>
              <th className="px-1 py-1 font-semibold">{t("projectDashboard.colQuantity")}</th>
              <th className="px-1 py-1 font-semibold">{t("projectDashboard.vizEvidence")}</th>
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-1 py-4 text-center text-[color:var(--foreground-muted)]">
                  {t("workspaceWidgets.floorplanViz.noRooms")}
                </td>
              </tr>
            ) : null}
            {rooms.map((room, i) => (
              <tr key={`${room.name}-${i}`} className="border-t border-[color:var(--border-main)]">
                <td className="px-1 py-1.5 font-semibold">{room.name}</td>
                <td className="px-1 py-1.5">{t(`workspaceWidgets.floorplanViz.kinds.${room.kind ?? inferRoomKind(room.name)}`)}</td>
                <td className="px-1 py-1.5">
                  {room.widthM && room.lengthM ? `${room.widthM}×${room.lengthM} ${t("workspaceWidgets.floorplanViz.unitM")}` : "—"}
                </td>
                <td className="px-1 py-1.5">{room.areaM2 != null ? `${room.areaM2} ${t("workspaceWidgets.floorplanViz.unitM2")}` : "—"}</td>
                <td className="px-1 py-1.5">{sourceLabel(t, room.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {layout.dimensionStrings.length > 0 ? (
        <p className="text-[10px] text-[color:var(--foreground-muted)]">
          {t("projectDashboard.vizPrintedDims")}: {layout.dimensionStrings.slice(0, 24).join(" · ")}
        </p>
      ) : null}
      <p className="text-[10px] font-bold">{t("workspaceWidgets.floorplanViz.layoutMap")}</p>
      <MeasuredPlanSvg rooms={rooms} />
    </div>
  );
}
