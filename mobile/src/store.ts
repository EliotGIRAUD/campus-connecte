import { create } from "zustand";
import { fetchDeviceHistory, fetchRooms, type DeviceHistory, type RoomSummary } from "./api";
import { loadRoomsCache, saveRoomsCache } from "./cache";

export type ChartPeriod = "live" | "6h" | "24h" | "7d" | "30d";
export type ChartMetric = "temperature" | "co2";

type CampusState = {
  rooms: RoomSummary[];
  selectedRoomId: string | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  phoneOnline: boolean;
  cachedAt: string | null;
  fromCache: boolean;
  history: DeviceHistory | null;
  historyRefreshing: boolean;
  chartPeriod: ChartPeriod;
  chartMetric: ChartMetric;
  hydrateFromCache: () => Promise<void>;
  loadRooms: (isRefresh?: boolean) => Promise<void>;
  loadHistory: (deviceId: string) => Promise<void>;
  refreshHistory: (deviceId: string) => Promise<void>;
  selectRoom: (roomId: string | null) => void;
  setPhoneOnline: (online: boolean) => void;
  setChartPeriod: (period: ChartPeriod) => void;
  setChartMetric: (metric: ChartMetric) => void;
};

let roomsInFlight = false;

export const useCampusStore = create<CampusState>((set, get) => ({
  rooms: [],
  selectedRoomId: null,
  loading: true,
  error: null,
  refreshing: false,
  phoneOnline: true,
  cachedAt: null,
  fromCache: false,
  history: null,
  historyRefreshing: false,
  chartPeriod: "live",
  chartMetric: "temperature",

  hydrateFromCache: async () => {
    const cache = await loadRoomsCache();
    if (!cache) {
      return;
    }
    set({
      rooms: cache.rooms,
      cachedAt: cache.cachedAt,
      fromCache: true,
      loading: false,
    });
  },

  loadRooms: async (isRefresh = false) => {
    if (roomsInFlight) {
      return;
    }
    roomsInFlight = true;
    if (isRefresh) {
      set({ refreshing: true });
    }
    try {
      const data = await fetchRooms();
      set({
        rooms: data.rooms,
        error: null,
        fromCache: false,
        cachedAt: new Date().toISOString(),
        loading: false,
        refreshing: false,
      });
      await saveRoomsCache(data.rooms);
    } catch {
      const cache = await loadRoomsCache();
      if (cache && cache.rooms.length > 0) {
        set({
          rooms: cache.rooms,
          cachedAt: cache.cachedAt,
          fromCache: true,
          error: null,
          loading: false,
          refreshing: false,
        });
      } else if (get().rooms.length === 0) {
        set({
          error: "Impossible de joindre le serveur",
          loading: false,
          refreshing: false,
        });
      } else {
        set({ fromCache: true, error: null, loading: false, refreshing: false });
      }
    } finally {
      roomsInFlight = false;
    }
  },

  refreshHistory: async (deviceId: string) => {
    set({ historyRefreshing: true });
    await get().loadHistory(deviceId);
  },

  loadHistory: async (deviceId: string) => {
    try {
      const data = await fetchDeviceHistory(deviceId);
      if (get().selectedRoomId) {
        set({ history: data });
      }
    } catch {
      // Latest KPIs still come from the rooms poll.
    } finally {
      set({ historyRefreshing: false });
    }
  },

  selectRoom: (roomId) => {
    set({ selectedRoomId: roomId, history: null });
  },

  setPhoneOnline: (online) => set({ phoneOnline: online }),
  setChartPeriod: (period) => set({ chartPeriod: period }),
  setChartMetric: (metric) => set({ chartMetric: metric }),
}));
