import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  LogBox,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { fetchRooms, getApiUrl, type DeviceSummary, type RoomSummary } from "./src/api";
import { colors } from "./src/theme";

LogBox.ignoreLogs(["Cannot connect to Expo CLI"]);

const POLL_MS = 3000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}

function freshnessLabel(freshness: string): string {
  if (freshness === "fresh") {
    return "Donnée récente";
  }
  if (freshness === "stale") {
    return "Donnée ancienne";
  }
  return "Aucune mesure";
}

function StatusDot({ online }: { online: boolean }) {
  return <View style={[styles.dot, { backgroundColor: online ? colors.ok : colors.danger }]} />;
}

function FreshnessPill({ freshness }: { freshness: string }) {
  const stale = freshness === "stale";
  return (
    <View style={[styles.pill, stale ? styles.pillWarn : styles.pillOk]}>
      <Text style={[styles.pillText, stale ? styles.pillTextWarn : styles.pillTextOk]}>
        {freshnessLabel(freshness)}
      </Text>
    </View>
  );
}

function MetricCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>
        {value}
        <Text style={styles.metricUnit}> {unit}</Text>
      </Text>
    </View>
  );
}

function RoomCard({
  room,
  onPress,
}: {
  room: RoomSummary;
  onPress: () => void;
}) {
  const device = room.devices[0];
  const latest = device?.latest;
  const online = device?.availability.status === "online";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={room.label}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
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
            <Text style={styles.kpi}>
              {Math.round(latest.co2.value)} {latest.co2.unit}
            </Text>
          </View>
          <View style={styles.cardFooter}>
            <FreshnessPill freshness={latest.freshness} />
            <Text style={styles.cardTime}>{formatDate(latest.observed_at)}</Text>
          </View>
        </>
      ) : (
        <Text style={styles.emptyLine}>Aucune mesure pour l’instant</Text>
      )}
    </Pressable>
  );
}

function RoomDetail({ device, onBack }: { device: DeviceSummary; onBack: () => void }) {
  const online = device.availability.status === "online";
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} accessibilityRole="button" style={styles.backBtn}>
        <Text style={styles.backText}>←  Salles</Text>
      </Pressable>
      <Text style={styles.detailKicker}>Supervision</Text>
      <Text style={styles.title}>{device.label}</Text>
      <View style={styles.statusRow}>
        <StatusDot online={online} />
        <Text style={styles.statusText}>{online ? "Objet en ligne" : "Objet hors ligne"}</Text>
        <Text style={styles.cardId}> · {device.device_id}</Text>
      </View>

      {device.latest ? (
        <>
          <View style={styles.metrics}>
            <MetricCard
              label="Température"
              value={device.latest.temperature.value.toFixed(1)}
              unit={device.latest.temperature.unit}
            />
            <MetricCard
              label="CO₂"
              value={String(Math.round(device.latest.co2.value))}
              unit={device.latest.co2.unit}
            />
          </View>
          <View style={styles.metaCard}>
            <Text style={styles.metricLabel}>Dernière mesure</Text>
            <Text style={styles.metaValue}>{formatDate(device.latest.observed_at)}</Text>
            <View style={{ marginTop: 12 }}>
              <FreshnessPill freshness={device.latest.freshness} />
            </View>
          </View>
        </>
      ) : (
        <View style={styles.metaCard}>
          <Text style={styles.state}>Aucune mesure pour l’instant</Text>
        </View>
      )}
    </ScrollView>
  );
}

export default function App() {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    }
    try {
      const data = await fetchRooms();
      setRooms(data.rooms);
      setError(null);
    } catch {
      setError("Impossible de joindre le serveur");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const selected = rooms.find((room) => room.room_id === selectedId) ?? null;
  const device = selected?.devices[0] ?? null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {selected && device ? (
        <RoomDetail device={device} onBack={() => setSelectedId(null)} />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.kicker}>Supervision campus</Text>
            <Text style={styles.title}>Salles du campus</Text>
            <Text style={styles.headerHint}>
              {rooms.length} salle{rooms.length > 1 ? "s" : ""} · actualisation {POLL_MS / 1000} s
            </Text>
          </View>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.state}>Chargement…</Text>
            </View>
          ) : error && rooms.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.state}>{error}</Text>
              <Text style={styles.hint}>
                Le téléphone doit être sur le même Wi-Fi que le PC. Adresse : {getApiUrl()}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
                onPress={() => void load()}
                accessibilityRole="button"
              >
                <Text style={styles.buttonText}>Réessayer</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void load(true)}
                  tintColor={colors.accent}
                  colors={[colors.accent]}
                />
              }
            >
              {error ? (
                <View style={styles.banner}>
                  <Text style={styles.bannerText}>{error}</Text>
                </View>
              ) : null}
              {rooms.length === 0 ? (
                <Text style={styles.state}>Aucune salle enregistrée</Text>
              ) : (
                rooms.map((room) => (
                  <RoomCard
                    key={room.room_id}
                    room={room}
                    onPress={() => setSelectedId(room.room_id)}
                  />
                ))
              )}
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
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
  headerHint: { marginTop: 6, color: colors.muted, fontSize: 13 },
  hint: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  state: { marginTop: 14, fontSize: 16, color: colors.muted, textAlign: "center" },
  banner: {
    backgroundColor: colors.dangerMuted,
    borderColor: colors.danger,
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  bannerText: { color: colors.danger, fontWeight: "600" },
  button: {
    marginTop: 20,
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: colors.bg, fontWeight: "700", fontSize: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { backgroundColor: colors.surfaceHover },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  cardId: { marginTop: 2, color: colors.muted, fontSize: 13 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  statusText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kpiRow: { flexDirection: "row", alignItems: "center", marginTop: 14, gap: 12 },
  kpi: { color: colors.text, fontSize: 20, fontWeight: "700" },
  kpiSep: { width: 1, height: 18, backgroundColor: colors.border },
  cardFooter: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTime: { color: colors.muted, fontSize: 12, flexShrink: 1, textAlign: "right" },
  emptyLine: { marginTop: 12, color: colors.muted },
  backBtn: { marginBottom: 4, alignSelf: "flex-start" },
  backText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  metrics: { flexDirection: "row", gap: 12, marginTop: 20 },
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
  metricUnit: { fontSize: 14, color: colors.muted, fontWeight: "600" },
  metaCard: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaValue: { marginTop: 6, color: colors.text, fontSize: 16, fontWeight: "600" },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillOk: { backgroundColor: colors.okMuted },
  pillWarn: { backgroundColor: colors.warnMuted },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillTextOk: { color: colors.ok },
  pillTextWarn: { color: colors.warn },
});
