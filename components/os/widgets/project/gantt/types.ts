import type { BoqLinePrefill } from "@/lib/project-document-catalog";
import type { ProjectSubDomainId } from "@/lib/project-sub-domains";

export type GanttTask = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  status?: string | null;
  dependencies?: string | null;
  tradeId?: ProjectSubDomainId | null;
  linkedBoqLineId?: string | null;
  linkedBoqLabel?: string | null;
  linkedWorkDiaryId?: string | null;
  parentTaskId?: string | null;
};

export type GanttTaskDraft = {
  title: string;
  startDate: string;
  endDate: string;
  progress: number;
  tradeId: ProjectSubDomainId | "";
  dependencies: string;
  linkedBoqLineId: string;
};

export type GanttLabels = {
  task: string;
  start: string;
  end: string;
  progress: string;
  noTasks: string;
  listView: string;
  chartView: string;
  addTask: string;
  editTask: string;
  save: string;
  cancel: string;
  delete: string;
  deleteConfirm: string;
  scaleWeeks: string;
  scaleMonths: string;
  trade: string;
  dependencies: string;
  linkedBoq: string;
  workDiary: string;
  createDiary: string;
  newTaskTitle: string;
  ganttLegend?: string;
  ganttToday?: string;
  ganttProgress?: string;
  ganttDependency?: string;
  scaleDays?: string;
};

export type GanttProps = {
  tasks: GanttTask[];
  allTasks?: GanttTask[];
  boqLines?: BoqLinePrefill[];
  labels: GanttLabels;
  onProgressChange: (taskId: string, progress: number) => Promise<void>;
  onSaveTask: (draft: GanttTaskDraft, taskId?: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onCreateDiary?: (task: GanttTask) => Promise<void>;
  onOpenDiary?: (task: GanttTask) => void;
  organizationIndustry?: string | null;
  hideConstructionFeatures?: boolean;
};

export type Scale = "days" | "weeks" | "months";
