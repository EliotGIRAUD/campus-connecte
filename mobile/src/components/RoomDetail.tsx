import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { DeviceSummary } from "../api";
import { HistoryCharts } from "../HistoryCharts";
import { withLiveFreshness } from "../freshness";
import { airQuality, formatAge, formatDate, freshnessLabel, ventilationLabel } from "../format";
import { useNow } from "../hooks/useNow";
import { useCampusStore } from "../store";
import { CO2_HIGH_PPM } from "../thresholds";
import { colors } from "../theme";
import { MetricCard } from "./MetricCard";
import { StatusDot } from "./StatusDot";
import { TonePill } from "./TonePill";

const HISTORY_POLL_MS = 15000;

export function RoomDetail({ device, onBack }: { device: DeviceSummary; onBack: () => void }) {
  const now = useNow();
  const online = device.availability.status === "online";
  const history = useCampusStore((state) => state.history);
  const historyLoading = useCampusStore((state) => state.historyLoading);
  const historyError = useCampusStore((state) => state.historyError);
  const historyRefreshing = useCampusStore((state) => state.historyRefreshing);
  const loadHistory = useCampusStore((state) => state.loadHistory);
  const refreshHistory = useCampusStore((state) => state.refreshHistory);

  const latest = device.latest ? withLiveFreshness(device.latest, now) : null;
  const quality = latest ? airQuality(latest.co2.value) : null;
  const highCo2 = Boolean(latest && latest.co2.value >= CO2_HIGH_PPM);
  const stale = latest?.freshness === "stale";

  useEffect(() => {
    void loadHistory(device.device_id);
    const id = setInterval(() => {
      void loadHistory(device.device_id);
    }, HISTORY_POLL_MS);
    return () => {
      clearInterval(id);
    };
  }, [device.device_id, loadHistory]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={historyRefreshing}
          onRefresh={() => {
            void refreshHistory(device.device_id);
          }}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Retour à la liste des salles"
        style={styles.backBtn}
      >
        <Text style={styles.backText}>←  Salles</Text>
      </Pressable>
      <Text style={styles.detailKicker}>Supervision</Text>
      <Text style={styles.title}>{device.label}</Text>
      <View style={styles.statusRow}>
        <StatusDot online={online} />
        <Text style={styles.statusText}>{online ? "Objet en ligne" : "Objet hors ligne"}</Text>
        <Text style={styles.cardId}> · {device.device_id}</Text>
      </View>

      {latest ? (
        <>
          <View style={styles.metrics}>
            <MetricCard
              label="Température"
              value={latest.temperature.value.toFixed(1)}
              unit={latest.temperature.unit}
            />
            <MetricCard
              label="CO₂"
              value={String(Math.round(latest.co2.value))}
              unit={latest.co2.unit}
              alert={highCo2}
            />
          </View>
          <View style={styles.metaCard}>
            <View style={styles.pillRow}>
              <TonePill label={freshnessLabel(latest.freshness)} tone={stale ? "warn" : "ok"} />
              <TonePill
                label={ventilationLabel(device.ventilation)}
                tone={device.ventilation ? "ok" : "warn"}
              />
              {quality && quality.tone !== "ok" ? (
                <TonePill label={quality.label} tone={quality.tone} />
              ) : null}
            </View>
            <Text style={styles.metaValue}>{formatAge(latest.observed_at, now)}</Text>
            <Text style={styles.metaHint}>{formatDate(latest.observed_at)}</Text>
          </View>
        </>
      ) : (
        <View style={styles.metaCard}>
          <Text style={styles.state}>Aucune mesure pour l’instant</Text>
          <Text style={styles.metaHint}>
            L’objet est enregistré ; en attente d’une télémétrie valide.
          </Text>
        </View>
      )}

      {historyError && history ? (
        <View style={styles.historySoftError} accessibilityRole="alert">
          <Text style={styles.historySoftErrorText}>{historyError}</Text>
        </View>
      ) : null}
      {historyLoading && !history ? (
        <View style={styles.historyState}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.historyStateText}>Chargement de l’historique…</Text>
        </View>
      ) : null}
      {historyError && !history ? (
        <View style={styles.historyError}>
          <Text style={styles.historyErrorText}>{historyError}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Réessayer le chargement de l’historique"
            style={({ pressed }) => [styles.retryBtn, pressed && styles.retryPressed]}
            onPress={() => void loadHistory(device.device_id)}
          >
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : null}
      {history || (!historyLoading && !historyError) ? <HistoryCharts /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  backBtn: { marginBottom: 4, alignSelf: "flex-start" },
  backText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  detailKicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 8,
  },
  title: { fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.4 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  statusText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  cardId: { color: colors.muted, fontSize: 13 },
  metrics: { flexDirection: "row", gap: 12, marginTop: 20 },
  metaCard: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metaValue: { marginTop: 10, color: colors.text, fontSize: 16, fontWeight: "600" },
  metaHint: { marginTop: 4, color: colors.muted, fontSize: 12, lineHeight: 18 },
  state: { fontSize: 16, color: colors.muted },
  historyState: {
    marginTop: 8,
    padding: 20,
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyStateText: { color: colors.muted, fontSize: 14 },
  historySoftError: {
    marginTop: 4,
    padding: 12,
    backgroundColor: colors.warnMuted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warn,
  },
  historySoftErrorText: { color: colors.warn, fontWeight: "600", fontSize: 13 },
  historyError: {
    marginTop: 8,
    padding: 16,
    backgroundColor: colors.dangerMuted,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.danger,
    gap: 12,
  },
  historyErrorText: { color: colors.danger, fontWeight: "600", fontSize: 14 },
  retryBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryPressed: { opacity: 0.85 },
  retryText: { color: colors.bg, fontWeight: "700", fontSize: 14 },
});
