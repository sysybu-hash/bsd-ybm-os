export const PUSH_KEY = "project-dashboard-push-enabled";

export function formatMoney(n: number) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL");
}

/** Build the large labels object for ProjectSchedulePanel */
export function buildGanttLabels(t: (key: string) => string) {
  return {
    importSchedule: t("projectDashboard.importSchedule"),
    importConfirm: t("projectDashboard.importConfirm"),
    importSuccess: t("projectDashboard.importSuccess"),
    importFailed: t("projectDashboard.importFailed"),
    allDomains: t("projectDashboard.allDomains"),
    generateDoc: t("projectDashboard.generateDoc"),
    docGeneratorTitle: t("projectDashboard.docGeneratorTitle"),
    domainCount: t("projectDashboard.domainCount"),
    task: t("projectDashboard.task"),
    start: t("projectDashboard.start"),
    end: t("projectDashboard.end"),
    progress: t("projectDashboard.progress"),
    noTasks: t("projectDashboard.noTasks"),
    listView: t("projectDashboard.ganttListView"),
    chartView: t("projectDashboard.ganttChartView"),
    addTask: t("projectDashboard.addTask"),
    editTask: t("projectDashboard.editTask"),
    save: t("projectDashboard.save"),
    cancel: t("projectDashboard.cancel"),
    delete: t("projectDashboard.delete"),
    deleteConfirm: t("projectDashboard.deleteConfirm"),
    scaleDays: t("projectDashboard.scaleDays"),
    scaleWeeks: t("projectDashboard.scaleWeeks"),
    scaleMonths: t("projectDashboard.scaleMonths"),
    trade: t("projectDashboard.trade"),
    dependencies: t("projectDashboard.dependencies"),
    linkedBoq: t("projectDashboard.linkedBoq"),
    workDiary: t("projectDashboard.workDiary"),
    createDiary: t("projectDashboard.createDiary"),
    ganttLegend: t("projectDashboard.ganttLegend"),
    ganttToday: t("projectDashboard.ganttToday"),
    ganttProgress: t("projectDashboard.ganttProgress"),
    ganttDependency: t("projectDashboard.ganttDependency"),
    newTaskTitle: t("projectDashboard.newTaskTitle"),
    taskSaved: t("projectDashboard.taskSaved"),
    taskDeleted: t("projectDashboard.taskDeleted"),
    taskSaveFailed: t("projectDashboard.taskSaveFailed"),
  };
}
