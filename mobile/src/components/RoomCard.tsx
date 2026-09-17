import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RoomSummary } from "../api";
import { withLiveFreshness } from "../freshness";
import { airQuality, formatAge, freshnessLabel } from "../format";
import { useNow } from "../hooks/useNow";
import { CO2_HIGH_PPM } from "../thresholds";
import { colors } from "../theme";
import { StatusDot } from "./StatusDot";
import { TonePill } from "./TonePill";

export function RoomCard({ room, onPress }: { room: RoomSummary; onPress: () => void }) {
  const now = useNow();
  const device = room.devices[0];
  const latest = device?.latest ? withLiveFreshness(device.latest, now) : null;
  const online = device?.availability.status === "online";
  const quality = latest ? airQuality(latest.co2.value) : null;
  const highCo2 = Boolean(latest && latest.co2.value >= CO2_HIGH_PPM);
  const stale = latest?.freshness === "stale";

  const a11yBits = [
    room.label,
    online ? "objet en ligne" : "objet hors ligne",
    latest
      ? `${latest.temperature.value.toFixed(1)} degrés, ${Math.round(latest.co2.value)} ppm, ${freshnessLabel(latest.freshness)}`
      : "aucune mesure",
  ];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yBits.join(". ")}
      style={({ pressed }) => [styles.card, highCo2 && styles.cardAlert, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{room.label}</Text>
          <Text style={styles.cardId}>{device?.device_id ?? room.room_id}</Text>
        </View>
        <View style={styles.statusRow}>
          <StatusDot online={Boolean(online)} />
          <Text style={styles.statusText}>{online ? "En ligne" : "Hors ligne"}</Text>
        </View>
      </View>
      {latest ? (
        <>
          <View style={styles.kpiRow}>
            <Text style={styles.kpi}>
              {latest.temperature.value.toFixed(1)} {latest.temperature.unit}
            </Text>
            <View style={styles.kpiSep} />
            <Text style={[styles.kpi, highCo2 && styles.kpiAlert]}>
              {Math.round(latest.co2.value)} {latest.co2.unit}
            </Text>
          </View>
          <View style={styles.pillRow}>
            <TonePill label={freshnessLabel(latest.freshness)} tone={stale ? "warn" : "ok"} />
            {quality && quality.tone !== "ok" ? (
              <TonePill label={quality.label} tone={quality.tone} />
            ) : null}
          </View>
          <Text style={styles.cardTime}>{formatAge(latest.observed_at, now)}</Text>
        </>
      ) : (
        <Text style={styles.emptyLine}>Aucune mesure pour l’instant</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { backgroundColor: colors.surfaceHover },
  cardAlert: { borderColor: colors.danger },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardTitleBlock: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  cardId: { marginTop: 2, color: colors.muted, fontSize: 13 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  kpiRow: { flexDirection: "row", alignItems: "center", marginTop: 14, gap: 12 },
  kpi: { color: colors.text, fontSize: 20, fontWeight: "700" },
  kpiAlert: { color: colors.danger },
  kpiSep: { width: 1, height: 18, backgroundColor: colors.border },
  pillRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cardTime: { marginTop: 10, color: colors.muted, fontSize: 12 },
  emptyLine: { marginTop: 12, color: colors.muted },
});
