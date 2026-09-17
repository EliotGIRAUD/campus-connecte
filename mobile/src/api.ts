import Constants from "expo-constants";

export type Quantity = {
  value: number;
  unit: string;
};

export type LatestMeasurement = {
  message_id: string;
  observed_at: string;
  received_at: string | null;
  age_ms: number;
  freshness: "fresh" | "stale" | "unknown";
  temperature: Quantity;
  co2: Quantity;
};

export type DeviceSummary = {
  device_id: string;
  room_id: string;
  label: string;
  ventilation: boolean | null;
  availability: {
    status: string;
    reason: string | null;
    reported_at: string | null;
  };
  latest: LatestMeasurement | null;
};

export type RoomSummary = {
  room_id: string;
  label: string;
  devices: DeviceSummary[];
};

export type RoomsResponse = {
  rooms: RoomSummary[];
};

export type DeviceHistory = {
  device_id: string;
  room_id: string;
  window_ms: number;
  retention_days: number;
  measurements: HistoryMeasurement[];
  averages: HistoryAverage[];
  daily: HistoryDaily[];
};

export type HistoryMeasurement = {
  message_id: string;
  observed_at: string;
  temperature: Quantity;
  co2: Quantity;
};

export type HistoryAverage = {
  window_start: string;
  sample_count: number;
  temperature: Quantity;
  co2: Quantity;
};

export type HistoryDaily = {
  day: string;
  sample_count: number;
  temperature: Quantity;
  co2: Quantity;
};

const FETCH_TIMEOUT_MS = 8_000;

function lanHostFromExpo(): string | null {
  const candidates = [Constants.expoConfig?.hostUri, Constants.linkingUri];
  for (const value of candidates) {
    if (!value) {
      continue;
    }
    const match = value.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/** Prefer explicit env (Android emulator 10.0.2.2, LAN override), then Expo host, then localhost. */
export function getApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  const lanHost = lanHostFromExpo();
  if (lanHost) {
    return `http://${lanHost}:3000`;
  }
  return "http://localhost:3000";
}

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${getApiUrl()}${path}`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Délai dépassé");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchRooms(): Promise<RoomsResponse> {
  return fetchJson<RoomsResponse>("/api/rooms");
}

export async function fetchDeviceHistory(deviceId: string): Promise<DeviceHistory> {
  return fetchJson<DeviceHistory>(`/api/devices/${encodeURIComponent(deviceId)}/history`);
}
