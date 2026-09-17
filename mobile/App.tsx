import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  LogBox,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { getApiUrl, type DeviceSummary, type RoomSummary } from "./src/api";
import { HistoryCharts, ALERT_CO2_PPM } from "./src/HistoryCharts";
import { useCampusStore } from "./src/store";
import { colors } from "./src/theme";

LogBox.ignoreLogs(["Cannot connect to Expo CLI"]);

const POLL_MS = 3000;
const HISTORY_POLL_MS = 15000;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}

function formatAge(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) {
    return `il y a ${seconds} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }
  return formatDate(iso);
}

function airQuality(co2: number): { label: string; tone: "ok" | "warn" | "danger" } {
  if (co2 >= ALERT_CO2_PPM) {
    return { label: "Alerte CO₂", tone: "danger" };
  }
  if (co2 >= 1000) {
    return { label: "Air chargé", tone: "warn" };
  }
  return { label: "Air confortable", tone: "ok" };
}

function ventilationLabel(value: boolean | null): string {
  if (value === true) {
    return "Ventilation active";
  }
  if (value === false) {
    return "Ventilation arrêtée";
  }
  return "Ventilation inconnue";
}

function campusOverview(rooms: RoomSummary[]) {
  const devices = rooms.flatMap((room) => room.devices);
  const online = devices.filter((device) => device.availability.status === "online").length;
  const alerts = devices.filter((device) => (device.latest?.co2.value ?? 0) >= ALERT_CO2_PPM).length;
  const temps = devices
    .map((device) => device.latest?.temperature.value)
    .filter((value): value is number => typeof value === "number");
  const avgTemp = temps.length === 0 ? null : temps.reduce((sum, value) => sum + value, 0) / temps.length;
  return { online, alerts, avgTemp, total: devices.length };
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

function TonePill({ label, tone }: { label: string; tone: "ok" | "warn" | "danger" }) {
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

function FreshnessPill({ freshness }: { freshness: string }) {
  const stale = freshness === "stale";
  return <TonePill label={freshnessLabel(freshness)} tone={stale ? "warn" : "ok"} />;
}

function MetricCard({
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
  const quality = latest ? airQuality(latest.co2.value) : null;
  const highCo2 = Boolean(latest && latest.co2.value >= ALERT_CO2_PPM);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={room.label}
      style={({ pressed }) => [styles.card, highCo2 && styles.cardAlert, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{room.label}</Text>
          <Text style={styles.cardId}>{device?.device_id ?? room.room_id}</Text>
        </View>
        <View style={styles.statusCol}>
          <View style={styles.statusRow}>
            <StatusDot online={Boolean(online)} />
            <Text style={styles.statusText}>{online ? "En ligne" : "Hors ligne"}</Text>
          </View>
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
            {quality ? <TonePill label={quality.label} tone={quality.tone} /> : null}
            <TonePill
              label={ventilationLabel(device?.ventilation ?? null)}
              tone={device?.ventilation ? "ok" : "warn"}
            />
            <FreshnessPill freshness={latest.freshness} />
          </View>
          <Text style={styles.cardTime}>{formatAge(latest.observed_at)}</Text>
        </>
      ) : (
        <Text style={styles.emptyLine}>Aucune mesure pour l’instant</Text>
      )}
    </Pressable>
  );
}

function RoomDetail({ device, onBack }: { device: DeviceSummary; onBack: () => void }) {
  const online = device.availability.status === "online";
  const historyRefreshing = useCampusStore((state) => state.historyRefreshing);
  const loadHistory = useCampusStore((state) => state.loadHistory);
  const refreshHistory = useCampusStore((state) => state.refreshHistory);
  const quality = device.latest ? airQuality(device.latest.co2.value) : null;
  const highCo2 = Boolean(device.latest && device.latest.co2.value >= ALERT_CO2_PPM);

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
              alert={highCo2}
            />
          </View>
          <View style={styles.metaCard}>
            <View style={styles.pillRow}>
              {quality ? <TonePill label={quality.label} tone={quality.tone} /> : null}
              <TonePill
                label={ventilationLabel(device.ventilation)}
                tone={device.ventilation ? "ok" : "warn"}
              />
              <FreshnessPill freshness={device.latest.freshness} />
            </View>
            <Text style={styles.metaValue}>{formatAge(device.latest.observed_at)}</Text>
            <Text style={styles.metaHint}>{formatDate(device.latest.observed_at)}</Text>
          </View>
        </>
      ) : (
        <View style={styles.metaCard}>
          <Text style={styles.state}>Aucune mesure pour l’instant</Text>
        </View>
      )}

      <HistoryCharts />
    </ScrollView>
  );
}

export default function App() {
  const rooms = useCampusStore((state) => state.rooms);
  const selectedRoomId = useCampusStore((state) => state.selectedRoomId);
  const loading = useCampusStore((state) => state.loading);
  const error = useCampusStore((state) => state.error);
  const refreshing = useCampusStore((state) => state.refreshing);
  const phoneOnline = useCampusStore((state) => state.phoneOnline);
  const cachedAt = useCampusStore((state) => state.cachedAt);
  const fromCache = useCampusStore((state) => state.fromCache);
  const hydrateFromCache = useCampusStore((state) => state.hydrateFromCache);
  const loadRooms = useCampusStore((state) => state.loadRooms);
  const selectRoom = useCampusStore((state) => state.selectRoom);
  const setPhoneOnline = useCampusStore((state) => state.setPhoneOnline);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await hydrateFromCache();
      if (!cancelled) {
        await loadRooms();
      }
    })();
    const id = setInterval(() => {
      void loadRooms();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hydrateFromCache, loadRooms]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setPhoneOnline(online);
    });
    return unsubscribe;
  }, [setPhoneOnline]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "active") {
        void loadRooms();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [loadRooms]);

  const selected = rooms.find((room) => room.room_id === selectedRoomId) ?? null;
  const device = selected?.devices[0] ?? null;
  const overview = campusOverview(rooms);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {!phoneOnline ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <Text style={styles.offlineBannerText}>Téléphone hors ligne</Text>
          {cachedAt ? (
            <Text style={styles.offlineBannerHint}>
              Cache local du {formatDate(cachedAt)}
              {fromCache ? " · consultation hors ligne" : ""}
            </Text>
          ) : (
            <Text style={styles.offlineBannerHint}>Aucune donnée en cache</Text>
          )}
        </View>
      ) : fromCache && cachedAt ? (
        <View style={styles.cacheBanner}>
          <Text style={styles.cacheBannerText}>
            Affichage du cache ({formatDate(cachedAt)}) — reconnexion…
          </Text>
        </View>
      ) : null}
      {selected && device ? (
        <RoomDetail device={device} onBack={() => selectRoom(null)} />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.kicker}>Supervision campus</Text>
            <Text style={styles.title}>Salles du campus</Text>
            <Text style={styles.headerHint}>
              {overview.total} objet{overview.total > 1 ? "s" : ""} · {overview.online} en ligne
              {overview.avgTemp !== null ? ` · ${overview.avgTemp.toFixed(1)} °C` : ""}
              {overview.alerts > 0 ? ` · ${overview.alerts} alerte CO₂` : ""}
            </Text>
          </View>
          {loading && rooms.length === 0 ? (
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
                onPress={() => void loadRooms()}
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
                  onRefresh={() => void loadRooms(true)}
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
                    onPress={() => selectRoom(room.room_id)}
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
  offlineBanner: {
    backgroundColor: colors.dangerMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  offlineBannerText: { color: colors.danger, fontWeight: "700", fontSize: 14 },
  offlineBannerHint: { marginTop: 2, color: colors.muted, fontSize: 12 },
  cacheBanner: {
    backgroundColor: colors.warnMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.warn,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cacheBannerText: { color: colors.warn, fontWeight: "600", fontSize: 13 },
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
  cardAlert: { borderColor: colors.danger },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  cardId: { marginTop: 2, color: colors.muted, fontSize: 13 },
  statusCol: { alignItems: "flex-end" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  statusText: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kpiRow: { flexDirection: "row", alignItems: "center", marginTop: 14, gap: 12 },
  kpi: { color: colors.text, fontSize: 20, fontWeight: "700" },
  kpiAlert: { color: colors.danger },
  kpiSep: { width: 1, height: 18, backgroundColor: colors.border },
  pillRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cardTime: { marginTop: 10, color: colors.muted, fontSize: 12 },
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
  metricValueAlert: { color: colors.danger },
  metricAlert: { borderColor: colors.danger },
  metricUnit: { fontSize: 14, color: colors.muted, fontWeight: "600" },
  metaCard: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaValue: { marginTop: 10, color: colors.text, fontSize: 16, fontWeight: "600" },
  metaHint: { marginTop: 4, color: colors.muted, fontSize: 12 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillOk: { backgroundColor: colors.okMuted },
  pillWarn: { backgroundColor: colors.warnMuted },
  pillDanger: { backgroundColor: colors.dangerMuted },
  pillText: { fontSize: 12, fontWeight: "700" },
  pillTextOk: { color: colors.ok },
  pillTextWarn: { color: colors.warn },
  pillTextDanger: { color: colors.danger },
});
