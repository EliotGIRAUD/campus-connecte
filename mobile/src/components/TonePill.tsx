import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export type PillTone = "ok" | "warn" | "danger";

export function TonePill({ label, tone }: { label: string; tone: PillTone }) {
  return (
    <View
      style={[
        styles.pill,
        tone === "ok" && styles.pillOk,
        tone === "warn" && styles.pillWarn,
        tone === "danger" && styles.pillDanger,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          tone === "ok" && styles.pillTextOk,
          tone === "warn" && styles.pillTextWarn,
          tone === "danger" && styles.pillTextDanger,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillOk: { backgroundColor: colors.okMuted },
  pillWarn: { backgroundColor: colors.warnMuted },
  pillDanger: { backgroundColor: colors.dangerMuted },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillTextOk: { color: colors.ok },
  pillTextWarn: { color: colors.warn },
  pillTextDanger: { color: colors.danger },
});
