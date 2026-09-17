import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export function MetricCard({
  label,
  value,
  unit,
  alert,
}: {
  label: string;
  value: string;
  unit: string;
  alert?: boolean;
}) {
  return (
    <View style={[styles.metric, alert && styles.metricAlert]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, alert && styles.metricValueAlert]}>
        {value}
        <Text style={styles.metricUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metric: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  metricValue: { marginTop: 8, color: colors.text, fontSize: 28, fontWeight: "700" },
  metricValueAlert: { color: colors.danger },
  metricAlert: { borderColor: colors.danger },
  metricUnit: { fontSize: 14, color: colors.muted, fontWeight: "600" },
});
