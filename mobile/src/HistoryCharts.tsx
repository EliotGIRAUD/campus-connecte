import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LineChart, type ChartPoint } from "./LineChart";
import { useCampusStore, type ChartMetric, type ChartPeriod } from "./store";
import type { DeviceHistory } from "./api";
import { CO2_HIGH_PPM } from "./thresholds";
import { colors } from "./theme";

const AVERAGE_WINDOW_MS = 10 * 60 * 1000;

type Period = ChartPeriod;
type Metric = ChartMetric;

const PERIODS: { id: Period; label: string; hint: string }[] = [
  { id: "live", label: "Direct", hint: "Mesures lissées (10 s), ~7 min" },
  { id: "6h", label: "6 h", hint: "Moyenne réelle toutes les 10 minutes" },
  { id: "24h", label: "24 h", hint: "Moyenne réelle toutes les 10 minutes" },
  { id: "7d", label: "7 j", hint: "Moyenne par jour" },
  { id: "30d", label: "30 j", hint: "Moyenne par jour" },
];

const METRICS: { id: Metric; label: string }[] = [
  { id: "temperature", label: "Température" },
  { id: "co2", label: "CO₂" },
];

function formatClock(at: Date): string {
  return at.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(at: Date): string {
  return at.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatTemp(value: number): string {
  return value.toFixed(1);
}

function formatCo2(value: number): string {
  return String(Math.round(value));
}

/** Average raw samples into 10 s buckets so Direct is a readable line, not sensor noise. */
function bucketLive(points: ChartPoint[], bucketMs = 10_000): ChartPoint[] {
  if (points.length === 0) {
    return [];
  }
  const buckets = new Map<number, { sum: number; count: number }>();
  for (const point of points) {
    const key = Math.floor(point.at.getTime() / bucketMs) * bucketMs;
    const current = buckets.get(key);
    if (current) {
      current.sum += point.value;
      current.count += 1;
    } else {
      buckets.set(key, { sum: point.value, count: 1 });
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, bucket]) => ({ at: new Date(time + bucketMs / 2), value: bucket.sum / bucket.count }));
}

function pointsFor(history: DeviceHistory | null, period: Period, key: Metric): ChartPoint[] {
  if (!history) {
    return [];
  }
  const now = Date.now();
  if (period === "live") {
    const raw = [...history.measurements]
      .reverse()
      .map((item) => ({ at: new Date(item.observed_at), value: item[key].value }));
    return bucketLive(raw);
  }
  if (period === "6h" || period === "24h") {
    const maxAge = period === "6h" ? 6 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return history.averages
      .filter((item) => now - new Date(item.window_start).getTime() <= maxAge)
      .map((item) => ({
        at: new Date(new Date(item.window_start).getTime() + AVERAGE_WINDOW_MS / 2),
        value: item[key].value,
      }));
  }
  const days = period === "7d" ? 7 : 30;
  return [...history.daily]
    .filter((item) => now - new Date(`${item.day}T12:00:00.000Z`).getTime() <= days * 24 * 60 * 60 * 1000)
    .reverse()
    .map((item) => ({ at: new Date(`${item.day}T12:00:00.000Z`), value: item[key].value }));
}

function coverageCaption(period: Period, points: ChartPoint[]): string {
  if (points.length === 0) {
    return "";
  }
  const first = points[0].at;
  const last = points[points.length - 1].at;
  const spanMin = Math.max(1, Math.round((last.getTime() - first.getTime()) / 60000));
  if (period === "live") {
    return `${points.length} points · ${spanMin} min réellement disponibles`;
  }
  if (period === "6h" || period === "24h") {
    const expected = period === "6h" ? "6 h" : "24 h";
    if (spanMin < 50) {
      return `${points.length} moyennes · ${spanMin} min de données (cible ${expected})`;
    }
    return `${points.length} moyennes 10 min`;
  }
  if (points.length === 1) {
    return "Un seul jour enregistré pour l’instant";
  }
  return `${points.length} jours`;
}

export function HistoryCharts() {
  const history = useCampusStore((state) => state.history);
  const period = useCampusStore((state) => state.chartPeriod);
  const metric = useCampusStore((state) => state.chartMetric);
  const setPeriod = useCampusStore((state) => state.setChartPeriod);
  const setMetric = useCampusStore((state) => state.setChartMetric);
  const selected = PERIODS.find((item) => item.id === period) ?? PERIODS[0];
  const points = useMemo(() => pointsFor(history, period, metric), [history, period, metric]);
  const dailyAxis = period === "7d" || period === "30d";
  const isCo2 = metric === "co2";

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Historique</Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {PERIODS.map((item) => {
          const active = item.id === period;
          return (
            <Pressable
              key={item.id}
              onPress={() => setPeriod(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.tabs}>
        {METRICS.map((item) => {
          const active = item.id === metric;
          return (
            <Pressable
              key={item.id}
              onPress={() => setMetric(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{selected.hint}</Text>
      <LineChart
        title={isCo2 ? "CO₂" : "Température"}
        unit={isCo2 ? "ppm" : "°C"}
        color={isCo2 ? colors.chartCo2 : colors.chartTemp}
        points={points}
        formatX={dailyAxis ? formatDay : formatClock}
        formatY={isCo2 ? formatCo2 : formatTemp}
        minSpan={isCo2 ? 200 : 2}
        caption={coverageCaption(period, points)}
        threshold={isCo2 ? { value: CO2_HIGH_PPM, label: `Seuil ${CO2_HIGH_PPM}` } : undefined}
        emptyHint={
          period === "live"
            ? "Aucune mesure brute pour le moment."
            : "Pas encore assez d’historique pour cette période."
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 4 },
  section: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  chips: {
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  chipLabelActive: {
    color: colors.bg,
  },
  tabs: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: colors.accentMuted,
  },
  tabLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
  },
  tabLabelActive: {
    color: colors.accent,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
  },
});
