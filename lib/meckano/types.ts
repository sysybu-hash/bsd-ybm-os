export type MeckanoReportEntry = {
  id: string | number;
  date: string;
  employeeName: string;
  project: string;
  location: string;
  hours: number;
};

export type MeckanoEmployee = {
  id: number;
  name: string;
  email: string;
  department: string;
  phone?: string;
};

export type MeckanoTask = {
  id: number;
  name: string;
};

export type MeckanoReportFilters = {
  startDate: string;
  endDate: string;
  employeeId: string;
  projectId: string;
  locationId: string;
};

export type MeckanoReportsSummary = {
  totalHours: number;
  workDays: number;
};
