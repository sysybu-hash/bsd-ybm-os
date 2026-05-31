import type { DataConfig } from "@/lib/validation/schemas/app-builder";

export type ChartDataPoint = { name: string; value: number };

export {
  isAllowedGroupBy,
  isAllowedValueField,
} from "@/lib/app-builder/data-catalog";

export function chartRequiresDataConfig(componentType: string): boolean {
  return (
    componentType === "bar_chart" ||
    componentType === "line_chart" ||
    componentType === "pie_chart" ||
    componentType === "metric_card"
  );
}
