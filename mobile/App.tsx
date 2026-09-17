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
import { getApiUrl, type RoomSummary } from "./src/api";
import { RoomCard } from "./src/components/RoomCard";
import { RoomDetail } from "./src/components/RoomDetail";
import { StatusBanner } from "./src/components/StatusBanner";
import { useCampusStore } from "./src/store";
import { CO2_HIGH_PPM } from "./src/thresholds";
import { colors } from "./src/theme";

LogBox.ignoreLogs(["Cannot connect to Expo CLI"]);

const POLL_MS = 3000;

function campusOverview(rooms: RoomSummary[]) {
  const devices = rooms.flatMap((room) => room.devices);
  const online = devices.filter((device) => device.availability.status === "online").length;
  const highCo2 = devices.filter((device) => (device.latest?.co2.value ?? 0) >= CO2_HIGH_PPM).length;
  const temps = devices
    .map((device) => device.latest?.temperature.value)
    .filter((value): value is number => typeof value === "number");
  const avgTemp = temps.length === 0 ? null : temps.reduce((sum, value) => sum + value, 0) / temps.length;
  return { online, highCo2, avgTemp, total: devices.length };
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
        <StatusBanner phoneOnline={phoneOnline} fromCache={fromCache} cachedAt={cachedAt} />
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
                {overview.highCo2 > 0 ? ` · ${overview.highCo2} CO₂ élevé` : ""}
              </Text>
            </View>
            {loading && rooms.length === 0 ? (
              <View style={styles.center}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.state}>Chargement des salles…</Text>
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
                  accessibilityLabel="Réessayer la connexion au serveur"
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
                  <View style={styles.emptyBlock}>
                    <Text style={styles.state}>Aucune salle enregistrée</Text>
                    <Text style={styles.hint}>
                      Vérifiez que le backend a démarré et que les objets du catalogue sont seedés.
                    </Text>
                  </View>
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
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: { fontSize: 28, fontWeight: "700", color: colors.text, letterSpacing: -0.4 },
  headerHint: { marginTop: 6, color: colors.muted, fontSize: 13 },
  hint: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 18, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  content: { padding: 20, gap: 12, paddingBottom: 32 },
  state: { marginTop: 14, fontSize: 16, color: colors.muted, textAlign: "center" },
  emptyBlock: { paddingVertical: 24, gap: 4 },
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
});
