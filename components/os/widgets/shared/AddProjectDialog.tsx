"use client";

import { CrmOverlayPortal } from "@/components/os/widgets/crm-table/CrmOverlayPortal";
import { useI18n } from "@/components/os/system/I18nProvider";
import AddProjectForm from "@/components/os/widgets/shared/AddProjectForm";

type Props = Readonly<{
  open: boolean;
  onClose: () => void;
  onCreated: (project: { id: string; name: string }) => void;
}>;

export default function AddProjectDialog({ open, onClose, onCreated }: Props) {
  const { dir, t } = useI18n();

  if (!open) return null;

  return (
    <CrmOverlayPortal>
      <div
        className="my-auto w-full max-w-lg shrink-0 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-5 shadow-2xl sm:rounded-[2rem] sm:p-8"
        dir={dir}
        role="dialog"
        aria-modal="true"
        aria-label={t("workspaceWidgets.hubs.projects.addProject.title")}
      >
        <AddProjectForm
          onCancel={onClose}
          onCreated={(project) => {
            onCreated(project);
            onClose();
          }}
        />
      </div>
    </CrmOverlayPortal>
  );
}
