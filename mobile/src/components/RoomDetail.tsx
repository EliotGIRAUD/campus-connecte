import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  fetchCommand,
  postVentilationCommand,
  type CommandRecord,
  type DeviceSummary,
} from "../api";
import { HistoryCharts } from "../HistoryCharts";
import { withLiveFreshness } from "../freshness";
import {
  airQuality,
  commandStatusLabel,
  commandStatusTone,
  formatAge,
  formatDate,
  freshnessLabel,
  ventilationLabel,
} from "../format";
import { useNow } from "../hooks/useNow";
import { useCampusStore } from "../store";
import { CO2_HIGH_PPM } from "../thresholds";
import { colors } from "../theme";
import { MetricCard } from "./MetricCard";
import { StatusDot } from "./StatusDot";
import { TonePill } from "./TonePill";

const HISTORY_POLL_MS = 15000;
const COMMAND_POLL_MS = 800;
const TERMINAL = new Set(["ACKNOWLEDGED", "FAILED", "TIMEOUT"]);

export function RoomDetail({ device, onBack }: { device: DeviceSummary; onBack: () => void }) {
  const now = useNow();
  const online = device.availability.status === "online";
  const history = useCampusStore((state) => state.history);
  const historyLoading = useCampusStore((state) => state.historyLoading);
  const historyError = useCampusStore((state) => state.historyError);
  const historyRefreshing = useCampusStore((state) => state.historyRefreshing);
  const loadHistory = useCampusStore((state) => state.loadHistory);
  const refreshHistory = useCampusStore((state) => state.refreshHistory);
  const loadRooms = useCampusStore((state) => state.loadRooms);

  const [command, setCommand] = useState<CommandRecord | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const latest = device.latest ? withLiveFreshness(device.latest, now) : null;
  const quality = latest ? airQuality(latest.co2.value) : null;
  const highCo2 = Boolean(latest && latest.co2.value >= CO2_HIGH_PPM);
  const stale = latest?.freshness === "stale";
  const waitingAck = Boolean(command && !TERMINAL.has(command.status));

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPoll = useCallback(
    (commandId: string) => {
      stopPoll();
      pollRef.current = setInterval(() => {
        void fetchCommand(device.device_id, commandId)
          .then((next) => {
            setCommand(next);
            if (TERMINAL.has(next.status)) {
              stopPoll();
              setCommandBusy(false);
              void loadRooms(true);
            }
          })
          .catch(() => {
            /* keep last known status; next tick retries */
          });
      }, COMMAND_POLL_MS);
    },
    [device.device_id, loadRooms, stopPoll],
  );

  useEffect(() => {
    return () => stopPoll();
  }, [stopPoll]);

  useEffect(() => {
    void loadHistory(device.device_id);
    const id = setInterval(() => {
      void loadHistory(device.device_id);
    }, HISTORY_POLL_MS);
    return () => {
      clearInterval(id);
    };
  }, [device.device_id, loadHistory]);

  const sendVentilation = async (enabled: boolean) => {
    if (commandBusy) {
      return;
    }
    setCommandBusy(true);
    setCommandError(null);
    try {
      const created = await postVentilationCommand(device.device_id, enabled);
      setCommand(created);
      if (TERMINAL.has(created.status)) {
        setCommandBusy(false);
        void loadRooms(true);
      } else {
        startPoll(created.command_id);
      }
    } catch (error) {
      setCommandBusy(false);
      setCommandError(error instanceof Error ? error.message : "Envoi impossible");
    }
  };

  const commandTone = command ? commandStatusTone(command.status) : "muted";

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

      <View style={styles.commandCard}>
        <Text style={styles.commandTitle}>Ventilation</Text>
        <Text style={styles.commandHint}>
          La commande n’est considérée comme réussie qu’après confirmation (ACK) de l’objet.
        </Text>
        <View style={styles.commandRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Activer la ventilation"
            disabled={commandBusy}
            style={({ pressed }) => [
              styles.commandBtn,
              styles.commandBtnOn,
              (pressed || commandBusy) && styles.commandBtnPressed,
            ]}
            onPress={() => void sendVentilation(true)}
          >
            {commandBusy && waitingAck ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.commandBtnText}>Activer</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Arrêter la ventilation"
            disabled={commandBusy}
            style={({ pressed }) => [
              styles.commandBtn,
              styles.commandBtnOff,
              (pressed || commandBusy) && styles.commandBtnPressed,
            ]}
            onPress={() => void sendVentilation(false)}
          >
            <Text style={styles.commandBtnTextOff}>Arrêter</Text>
          </Pressable>
        </View>
        {commandError ? (
          <Text style={styles.commandError} accessibilityRole="alert">
            {commandError}
          </Text>
        ) : null}
        {command ? (
          <View style={styles.commandStatusBox}>
            <TonePill label={commandStatusLabel(command.status)} tone={commandTone === "muted" ? "warn" : commandTone} />
            <Text style={styles.commandMeta}>id {command.command_id}</Text>
            {waitingAck ? (
              <Text style={styles.commandWait}>En attente de l’acquittement de l’objet…</Text>
            ) : null}
            {command.status === "ACKNOWLEDGED" ? (
              <Text style={styles.commandOk}>
                Exécutée
                {command.result?.ventilation === true
                  ? " — ventilation active"
                  : command.result?.ventilation === false
                    ? " — ventilation arrêtée"
                    : ""}
              </Text>
            ) : null}
            {command.status === "TIMEOUT" ? (
              <Text style={styles.commandWarn}>
                Aucun ACK avant expiration
                {command.late_ack_at ? " (un ACK tardif a été journalisé)" : ""}
              </Text>
            ) : null}
            {command.status === "FAILED" ? (
              <Text style={styles.commandError}>
                Rejet{command.result?.reason ? ` : ${command.result.reason}` : ""}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

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
  commandCard: {
    marginTop: 4,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  commandTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  commandHint: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  commandRow: { flexDirection: "row", gap: 10 },
  commandBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  commandBtnOn: { backgroundColor: colors.accent },
  commandBtnOff: {
    backgroundColor: colors.surfaceHover,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commandBtnPressed: { opacity: 0.75 },
  commandBtnText: { color: colors.bg, fontWeight: "700", fontSize: 15 },
  commandBtnTextOff: { color: colors.text, fontWeight: "700", fontSize: 15 },
  commandStatusBox: { gap: 6, marginTop: 4 },
  commandMeta: { color: colors.muted, fontSize: 12, fontFamily: "monospace" },
  commandWait: { color: colors.warn, fontSize: 13, fontWeight: "600" },
  commandOk: { color: colors.ok, fontSize: 13, fontWeight: "600" },
  commandWarn: { color: colors.warn, fontSize: 13, fontWeight: "600" },
  commandError: { color: colors.danger, fontSize: 13, fontWeight: "600" },
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
