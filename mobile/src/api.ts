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

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export function getApiUrl(): string {
  return API_URL;
}

export async function fetchRooms(): Promise<RoomsResponse> {
  const response = await fetch(`${API_URL}/api/rooms`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<RoomsResponse>;
}
