import type { WidgetType } from "@/hooks/use-window-manager";

export type TabId = "financial" | "diary" | "gantt" | "ai" | "settings";

export type DashboardData = {
  id: string;
  name: string;
  status: string;
  budget: number;
  primaryContactId: string | null;
  autoSyncCrm: boolean;
  client: string | null;
  budgetUtilizationPercent: number;
  financial: {
    erpExpenses: number;
    plannedExpenses: number;
    extrasApproved: number;
    extrasPending: number;
    milestonesTotal: number;
    milestonesPaid: number;
    utilized: number;
  };
  milestones: Array<{
    id: string;
    name: string;
    amount: number;
    percent?: number | null;
    isPaid: boolean;
    datePaid: string | null;
  }>;
  hiddenConstructionMilestones?: number;
  extras: Array<{
    id: string;
    description: string;
    cost: number;
    isApproved: boolean;
  }>;
  projectExpenses: Array<{ id: string; month: string; category: string; amount: number }>;
  workDiaries: Array<{
    id: string;
    description: string;
    workersCount: number;
    progress: number;
    date: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    progress: number;
    dependencies: string | null;
    description?: string | null;
    linkedBoqLineId?: string | null;
    linkedWorkDiaryId?: string | null;
  }>;
  expenseRecords: Array<{
    id: string;
    amount: number;
    vendor: string | null;
    date: string | null;
  }>;
  attendanceLogs: Array<{
    id?: number;
    employeeName?: string;
    date?: string;
    hours?: number;
    status?: string;
  }>;
};

export type ProjectListItem = { id: string; name: string; isActive?: boolean };

export type ProjectDashboardWidgetProps = {
  projectId?: string;
  projectName?: string;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
};
