import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { colors } from "./theme";

export type ChartPoint = {
  at: Date;
  value: number;
};

type LineChartProps = {
  title: string;
  unit: string;
  color: string;
  points: ChartPoint[];
  formatX: (at: Date) => string;
  formatY: (value: number) => string;
  emptyHint: string;
  caption?: string;
  minSpan?: number;
  threshold?: { value: number; label: string };
};

function axisRange(values: number[], minSpan: number, threshold?: number): { min: number; max: number } {
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  let min = threshold !== undefined ? Math.min(dataMin, threshold) : dataMin;
  let max = threshold !== undefined ? Math.max(dataMax, threshold) : dataMax;
  if (max - min < minSpan) {
    const mid = (min + max) / 2;
    min = mid - minSpan / 2;
    max = mid + minSpan / 2;
  } else {
    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
  }
  return { min, max };
}

function niceTicks(min: number, max: number): number[] {
  const span = max - min || 1;
  const raw = span / 2;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm >= 5 ? 5 * mag : norm >= 2 ? 2 * mag : mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let tick = start; tick <= max + step / 1000; tick += step) {
    ticks.push(tick);
  }
  if (ticks.length < 2) {
    return [min, max];
  }
  return ticks.slice(0, 5);
}

function polyline(points: { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

export function LineChart({
  title,
  unit,
  color,
  points,
  formatX,
  formatY,
  emptyHint,
  caption,
  minSpan = 1,
  threshold,
}: LineChartProps) {
  const { width: screenWidth } = useWindowDimensions();
  const width = Math.max(280, screenWidth - 48);
  const height = 220;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const yTop = padT;
  const yBottom = padT + innerH;
  const gradientId = `fill-${title.replace(/\s+/g, "")}-${color.replace("#", "")}`;

  if (points.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.empty}>{emptyHint}</Text>
      </View>
    );
  }

  const values = points.map((point) => point.value);
  const { min, max } = axisRange(values, minSpan, threshold?.value);
  const span = max - min || 1;
  const tMin = points[0].at.getTime();
  const tMax = points[points.length - 1].at.getTime();
  const tSpan = Math.max(tMax - tMin, 1);
  const plotted = points.map((point) => ({
    x: points.length === 1 ? padL + innerW / 2 : padL + ((point.at.getTime() - tMin) / tSpan) * innerW,
    y: padT + (1 - (point.value - min) / span) * innerH,
    at: point.at,
    value: point.value,
  }));
  const line = polyline(plotted);
  const area =
    plotted.length > 1
      ? `${line} L ${plotted[plotted.length - 1].x} ${yBottom} L ${plotted[0].x} ${yBottom} Z`
      : "";
  const last = plotted[plotted.length - 1];
  const ticks = niceTicks(min, max);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const thresholdY =
    threshold !== undefined ? padT + (1 - (threshold.value - min) / span) * innerH : null;
  const xLabels =
    points.length === 1
      ? [{ x: last.x, at: last.at, anchor: "middle" as const }]
      : [
          { x: plotted[0].x, at: plotted[0].at, anchor: "start" as const },
          { x: plotted[Math.floor(plotted.length / 2)].x, at: plotted[Math.floor(plotted.length / 2)].at, anchor: "middle" as const },
          { x: last.x, at: last.at, anchor: "end" as const },
        ];

  return (
    <View style={styles.card} accessibilityLabel={`${title}, ${points.length} points`}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.liveValue}>
          <Text style={[styles.liveNumber, { color }]}>{formatY(last.value)}</Text>
          <Text style={styles.unit}>{unit}</Text>
        </View>
      </View>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {ticks.map((tick, index) => {
          const y = padT + (1 - (tick - min) / span) * innerH;
          if (y < yTop - 2 || y > yBottom + 2) {
            return null;
          }
          return (
            <Line
              key={`grid-${index}`}
              x1={padL}
              y1={y}
              x2={width - padR}
              y2={y}
              stroke={colors.border}
              strokeWidth={1}
            />
          );
        })}
        {ticks.map((tick, index) => {
          const y = padT + (1 - (tick - min) / span) * innerH;
          if (y < yTop - 2 || y > yBottom + 2) {
            return null;
          }
          return (
            <SvgText
              key={`label-${index}`}
              x={padL - 8}
              y={y + 4}
              fill={colors.muted}
              fontSize="10"
              fontWeight="600"
              textAnchor="end"
            >
              {formatY(tick)}
            </SvgText>
          );
        })}
        {threshold && thresholdY !== null && thresholdY >= yTop && thresholdY <= yBottom ? (
          <Line
            x1={padL}
            y1={thresholdY}
            x2={width - padR}
            y2={thresholdY}
            stroke={colors.danger}
            strokeWidth={1.25}
            strokeDasharray="5 5"
          />
        ) : null}
        {area ? <Path d={area} fill={`url(#${gradientId})`} /> : null}
        {plotted.length > 1 ? (
          <Path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {plotted.length <= 12
          ? plotted.map((point, index) => (
              <Circle key={`pt-${index}`} cx={point.x} cy={point.y} r={3} fill={color} />
            ))
          : null}
        <Circle cx={last.x} cy={last.y} r={5.5} fill={colors.surface} stroke={color} strokeWidth={2.5} />
        {xLabels.map((label, index) => (
          <SvgText
            key={`x-${index}`}
            x={label.x}
            y={height - 8}
            fill={colors.muted}
            fontSize="10"
            fontWeight="600"
            textAnchor={label.anchor}
          >
            {formatX(label.at)}
          </SvgText>
        ))}
        {threshold && thresholdY !== null && thresholdY > yTop + 10 && thresholdY < yBottom - 10 ? (
          <SvgText x={width - padR} y={thresholdY - 6} fill={colors.danger} fontSize="9" fontWeight="700" textAnchor="end">
            {threshold.label}
          </SvgText>
        ) : null}
      </Svg>
      <View style={styles.stats}>
        <Stat label="Min" value={`${formatY(Math.min(...values))} ${unit}`} />
        <Stat label="Moyenne" value={`${formatY(mean)} ${unit}`} />
        <Stat label="Max" value={`${formatY(Math.max(...values))} ${unit}`} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  liveValue: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  liveNumber: {
    fontSize: 22,
    fontWeight: "700",
  },
  unit: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  empty: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 8,
    paddingVertical: 36,
  },
  stats: {
    flexDirection: "row",
    marginTop: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  stat: { flex: 1 },
  statLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statValue: {
    marginTop: 3,
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
});
