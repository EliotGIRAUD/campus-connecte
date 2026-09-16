import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RoomSummary } from "./api";

const KEY = "campus.rooms.cache.v1";

export type RoomsCache = {
  rooms: RoomSummary[];
  cachedAt: string;
};

export async function loadRoomsCache(): Promise<RoomsCache | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as RoomsCache;
    if (!Array.isArray(parsed.rooms) || typeof parsed.cachedAt !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveRoomsCache(rooms: RoomSummary[]): Promise<void> {
  const payload: RoomsCache = {
    rooms,
    cachedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(payload));
}
