import { StyleSheet, Text, View } from "react-native";
import { formatDate } from "../format";
import { colors } from "../theme";

type StatusBannerProps = {
  phoneOnline: boolean;
  fromCache: boolean;
  cachedAt: string | null;
  softError?: string | null;
};

export function StatusBanner({ phoneOnline, fromCache, cachedAt, softError }: StatusBannerProps) {
  if (!phoneOnline) {
    return (
      <View style={styles.offlineBanner} accessibilityRole="alert">
        <Text style={styles.offlineBannerText}>Téléphone hors ligne</Text>
        {cachedAt ? (
          <Text style={styles.offlineBannerHint}>
            Cache local du {formatDate(cachedAt)}
            {fromCache ? " · consultation hors ligne" : ""}
          </Text>
        ) : (
          <Text style={styles.offlineBannerHint}>Aucune donnée en cache</Text>
        )}
      </View>
    );
  }

  if (fromCache && cachedAt) {
    return (
      <View style={styles.cacheBanner} accessibilityRole="summary">
        <Text style={styles.cacheBannerText}>
          Affichage du cache ({formatDate(cachedAt)}) — reconnexion…
        </Text>
      </View>
    );
  }

  if (softError) {
    return (
      <View style={styles.errorBanner} accessibilityRole="alert">
        <Text style={styles.errorBannerText}>{softError}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  offlineBanner: {
    backgroundColor: colors.dangerMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  offlineBannerText: { color: colors.danger, fontWeight: "700", fontSize: 14 },
  offlineBannerHint: { marginTop: 2, color: colors.muted, fontSize: 12 },
  cacheBanner: {
    backgroundColor: colors.warnMuted,
    borderBottomWidth: 1,
    borderBottomColor: colors.warn,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cacheBannerText: { color: colors.warn, fontWeight: "600", fontSize: 13 },
  errorBanner: {
    marginHorizontal: 20,
    marginTop: 8,
    backgroundColor: colors.dangerMuted,
    borderColor: colors.danger,
    borderWidth: 1,
    padding: 12,
    borderRadius: 12,
  },
  errorBannerText: { color: colors.danger, fontWeight: "600" },
});
