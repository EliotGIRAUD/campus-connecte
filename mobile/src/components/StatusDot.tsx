import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

export function StatusDot({ online }: { online: boolean }) {
  return <View style={[styles.dot, { backgroundColor: online ? colors.ok : colors.danger }]} />;
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
});
