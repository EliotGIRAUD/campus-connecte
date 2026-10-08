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

export type AlertSummary = {
  alert_id: string;
  device_id: string;
  type: string;
  status: string;
  threshold_ppm: number;
  close_threshold_ppm: number;
  opened_at: string;
  opened_co2: number;
  peak_co2: number;
  resolved_at: string | null;
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
  active_alert: AlertSummary | null;
};

export type Room = {
  room_id: string;
  label: string;
  devices: Device[];
};
