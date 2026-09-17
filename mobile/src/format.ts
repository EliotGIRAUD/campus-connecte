import { CO2_HIGH_PPM, CO2_WARN_PPM } from "./thresholds";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "medium" });
}

export function formatAge(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) {
    return `il y a ${seconds} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `il y a ${minutes} min`;
  }
  return formatDate(iso);
}

export function airQuality(co2: number): { label: string; tone: "ok" | "warn" | "danger" } {
  if (co2 >= CO2_HIGH_PPM) {
    return { label: "CO₂ élevé", tone: "danger" };
  }
  if (co2 >= CO2_WARN_PPM) {
    return { label: "Air chargé", tone: "warn" };
  }
  return { label: "Air confortable", tone: "ok" };
}

export function ventilationLabel(value: boolean | null): string {
  if (value === true) {
    return "Ventilation active";
  }
  if (value === false) {
    return "Ventilation arrêtée";
  }
  return "Ventilation inconnue";
}

export function freshnessLabel(freshness: string): string {
  if (freshness === "fresh") {
    return "Donnée récente";
  }
  if (freshness === "stale") {
    return "Donnée ancienne";
  }
  return "Aucune mesure";
}
