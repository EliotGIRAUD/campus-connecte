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

export type Device = {
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

export type Room = {
  room_id: string;
  label: string;
  devices: Device[];
};
