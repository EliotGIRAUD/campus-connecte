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

export function getApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const lanHost = lanHostFromExpo();
  if (lanHost) {
    return `http://${lanHost}:3000`;
  }
  return fromEnv ?? "http://localhost:3000";
}

export async function fetchRooms(): Promise<RoomsResponse> {
  const response = await fetch(`${getApiUrl()}/api/rooms`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<RoomsResponse>;
}
