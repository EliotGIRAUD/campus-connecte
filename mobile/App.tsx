import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { fetchRooms, getApiUrl, type RoomSummary } from "./src/api";

const POLL_MS = 3000;

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
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
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        {selected ? (
          <Pressable onPress={() => setSelectedId(null)} accessibilityRole="button">
            <Text style={styles.back}>← Salles</Text>
          </Pressable>
        ) : null}
        <Text style={styles.title}>{selected ? selected.label : "Salles du campus"}</Text>
        <Text style={styles.hint}>API {getApiUrl()} · actualisation 3 s</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0F3D68" />
          <Text style={styles.state}>Chargement…</Text>
        </View>
      ) : error && rooms.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.state}>{error}</Text>
          <Pressable style={styles.button} onPress={() => void load()} accessibilityRole="button">
            <Text style={styles.buttonText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : selected && device ? (
        <ScrollView contentContainerStyle={styles.content}>
          {error ? <Text style={styles.banner}>{error}</Text> : null}
          <Text style={styles.meta}>Objet {device.device_id}</Text>
          <Text style={styles.meta}>
            {device.availability.status === "online" ? "Objet en ligne" : "Objet hors ligne"}
          </Text>
          {device.latest ? (
            <>
              <View style={styles.card}>
                <Text style={styles.label}>Température</Text>
                <Text style={styles.value}>
                  {device.latest.temperature.value.toFixed(1)} {device.latest.temperature.unit}
                </Text>
              </View>
              <View style={styles.card}>
                <Text style={styles.label}>CO₂</Text>
                <Text style={styles.value}>
                  {Math.round(device.latest.co2.value)} {device.latest.co2.unit}
                </Text>
              </View>
              <Text style={styles.meta}>Mesure du {formatDate(device.latest.observed_at)}</Text>
              <Text style={[styles.badge, device.latest.freshness === "stale" && styles.badgeWarn]}>
                {freshnessLabel(device.latest.freshness)}
              </Text>
            </>
          ) : (
            <Text style={styles.state}>Aucune mesure pour l’instant</Text>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          {error ? <Text style={styles.banner}>{error}</Text> : null}
          {rooms.length === 0 ? (
            <Text style={styles.state}>Aucune salle enregistrée</Text>
          ) : (
            rooms.map((room) => {
              const latest = room.devices[0]?.latest;
              return (
                <Pressable
                  key={room.room_id}
                  style={styles.row}
                  onPress={() => setSelectedId(room.room_id)}
                  accessibilityRole="button"
                >
                  <Text style={styles.rowTitle}>{room.label}</Text>
                  <Text style={styles.rowId}>{room.devices[0]?.device_id ?? room.room_id}</Text>
                  {latest ? (
                    <Text style={styles.rowMeta}>
                      {latest.temperature.value.toFixed(1)} {latest.temperature.unit} ·{" "}
                      {Math.round(latest.co2.value)} {latest.co2.unit} · {formatDate(latest.observed_at)}
                    </Text>
                  ) : (
                    <Text style={styles.rowMeta}>Aucune mesure pour l’instant</Text>
                  )}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F7FB" },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  back: { color: "#0F3D68", fontSize: 16, marginBottom: 8 },
  title: { fontSize: 24, fontWeight: "700", color: "#102A43" },
  hint: { marginTop: 4, color: "#627D98", fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { padding: 20, gap: 12 },
  state: { marginTop: 12, fontSize: 16, color: "#334E68", textAlign: "center" },
  banner: {
    backgroundColor: "#FFE8E0",
    color: "#9B1D20",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  button: { marginTop: 16, backgroundColor: "#0F3D68", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "#fff", fontWeight: "600" },
  row: { backgroundColor: "#fff", borderRadius: 12, padding: 16, elevation: 1 },
  rowTitle: { fontSize: 18, fontWeight: "600", color: "#102A43" },
  rowId: { marginTop: 2, color: "#627D98" },
  rowMeta: { marginTop: 8, color: "#334E68" },
  card: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
  label: { color: "#627D98", fontSize: 14 },
  value: { fontSize: 32, fontWeight: "700", color: "#102A43", marginTop: 4 },
  meta: { color: "#334E68", marginBottom: 4 },
  badge: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: "#D1FAE5",
    color: "#065F46",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  badgeWarn: { backgroundColor: "#FEF3C7", color: "#92400E" },
});
