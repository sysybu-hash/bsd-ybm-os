"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchDashboardComponentDataAction } from "@/app/actions/dashboard-data";
import { formatMetricDisplayValue } from "@/lib/app-builder/format-chart-value";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { AppBuilderDashboardUI, UIComponent } from "@/lib/validation/schemas/app-builder";

const COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

type Props = {
  schema: AppBuilderDashboardUI;
};

function DashboardWidget({ component }: { component: UIComponent }) {
  const { t, locale } = useI18n();
  const prefix = "workspaceWidgets.appBuilder";
  const [data, setData] = useState<{ name: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!component.dataConfig) {
        setLoading(false);
        return;
      }

      const result = await fetchDashboardComponentDataAction(component.type, component.dataConfig);
      if (cancelled) return;

      if (!result.ok) {
        setError(result.error);
        setData([]);
      } else {
        setData(result.data);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [component]);

  const isWide =
    component.type === "bar_chart" ||
    component.type === "line_chart" ||
    component.type === "pie_chart";
  const isMetric = component.type === "metric_card";

  if (loading) {
    return (
      <div
        className={`flex animate-pulse items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] ${
          isWide ? "col-span-full lg:col-span-2 h-64" : isMetric ? "h-36" : "h-64"
        }`}
      >
        {t(`${prefix}.dashboardLoading`)}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-sm ${
        isWide ? "col-span-full p-5 lg:col-span-2" : isMetric ? "p-4" : "p-5"
      }`}
    >
      <h3
        className={`flex items-center gap-2 font-semibold text-[color:var(--foreground-main)] ${
          isMetric ? "mb-2 text-sm" : "mb-4 text-lg"
        }`}
      >
        {component.type === "bar_chart" ? (
          <BarChart3 className="h-5 w-5 text-indigo-500" aria-hidden />
        ) : null}
        {component.type === "line_chart" ? (
          <LineChartIcon className="h-5 w-5 text-indigo-500" aria-hidden />
        ) : null}
        {component.type === "pie_chart" ? (
          <PieChartIcon className="h-5 w-5 text-indigo-500" aria-hidden />
        ) : null}
        {component.type === "metric_card" ? (
          <Activity className="h-5 w-5 text-indigo-500" aria-hidden />
        ) : null}
        {component.title}
      </h3>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : null}

      <div className={isMetric ? "flex min-h-[88px] w-full items-center justify-center" : "h-64 w-full"}>
        {component.type === "metric_card" ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-3xl font-bold tabular-nums text-[color:var(--foreground-main)] sm:text-4xl">
              {formatMetricDisplayValue(data[0]?.value ?? 0, locale, {
                aggregation: component.dataConfig?.aggregation,
                valueField: component.dataConfig?.valueField,
              })}
            </span>
          </div>
        ) : null}

        {component.type === "bar_chart" ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
              <RechartsTooltip
                cursor={{ fill: "#f1f5f9" }}
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : null}

        {component.type === "line_chart" ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b" }} />
              <RechartsTooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#4f46e5"
                strokeWidth={3}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : null}

        {component.type === "pie_chart" ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]!} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}

export default function DynamicDashboardRenderer({ schema }: Props) {
  const { dir } = useI18n();

  if (schema.type !== "dashboard") return null;

  const metricCount = schema.components.filter((c) => c.type === "metric_card").length;
  const allMetrics = metricCount > 0 && metricCount === schema.components.length;
  const gridClass = allMetrics
    ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    : "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3";

  return (
    <div dir={dir} className="min-h-full space-y-4 bg-transparent p-4 pb-8">
      <div>
        <h2 className="text-xl font-bold text-[color:var(--foreground-main)] sm:text-2xl">{schema.title}</h2>
        {schema.description ? (
          <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{schema.description}</p>
        ) : null}
      </div>

      <div className={gridClass}>
        {schema.components.map((comp) => (
          <DashboardWidget key={comp.id} component={comp} />
        ))}
      </div>
    </div>
  );
}
