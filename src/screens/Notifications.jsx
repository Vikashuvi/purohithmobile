import React, { useCallback, useEffect, useState } from "react";
import { bindBrandStyles } from "../lib/brandStyles";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { Bell, BellOff, CalendarCheck2, CheckCheck, CircleX, IndianRupee, MessageSquareQuote, Sparkles } from "lucide-react-native";
import { colors, radii, spacing } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { listNotifications, markAllNotificationsRead, markNotificationRead, notificationRoute, subscribeNotifications } from "../lib/inbox";

const ICONS = {
  booking_request: CalendarCheck2,
  booking_accepted: IndianRupee,
  booking_confirmed: CalendarCheck2,
  booking_rejected: CircleX,
  booking_completed: CheckCheck,
  payment_confirmed: IndianRupee,
  open_request: Sparkles,
  proposal_received: MessageSquareQuote,
  proposal_updated: MessageSquareQuote,
  proposal_selected: Sparkles,
};

function timeAgo(value) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Notifications({ navigation }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await listNotifications());
      setError("");
    } catch (reason) {
      setError(reason?.message || "Could not load notifications");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    return subscribeNotifications(user?.id, load);
  }, [load, user?.id]);

  const open = async (item) => {
    if (!item.read_at) {
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
      markNotificationRead(item.id).catch(() => {});
    }
    const route = notificationRoute(user?.role, item);
    navigation.navigate(route.name, route.params);
  };

  const readAll = async () => {
    setItems((current) => current.map((row) => row.read_at ? row : { ...row, read_at: new Date().toISOString() }));
    await markAllNotificationsRead().catch(() => {});
  };

  const unread = items.filter((item) => !item.read_at).length;

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.saffron} /></View>;

  return <FlatList
    style={styles.root}
    contentContainerStyle={styles.content}
    data={items}
    keyExtractor={(item) => item.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.saffron} />}
    ListHeaderComponent={<View style={styles.header}>
      <View style={{ flex: 1 }}><Text style={styles.kicker}>UPDATES</Text><Text style={styles.h1}>Notifications</Text><Text style={styles.sub}>{unread ? `${unread} unread` : "You're all caught up"}</Text></View>
      {unread ? <Pressable testID="mark-all-read" onPress={readAll} style={styles.readAll}><CheckCheck size={15} color={colors.brandBrown} /><Text style={styles.readAllText}>Mark all read</Text></Pressable> : null}
    </View>}
    ListEmptyComponent={<View style={styles.empty}>{error ? <BellOff size={26} color={colors.muted2} /> : <Bell size={26} color={colors.saffron} />}<Text style={styles.emptyTitle}>{error ? "Couldn't load notifications" : "No notifications yet"}</Text><Text style={styles.emptyBody}>{error || (user?.role === "priest" ? "New booking requests and open pooja requests will show up here." : "We'll let you know when a Purohit accepts, declines, or sends a quote.")}</Text></View>}
    ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    renderItem={({ item }) => {
      const Icon = ICONS[item.type] || Bell;
      const isUnread = !item.read_at;
      const negative = item.type === "booking_rejected";
      return <Pressable testID={`notification-${item.id}`} onPress={() => open(item)} style={({ pressed }) => [styles.row, isUnread && styles.rowUnread, pressed && { opacity: .75 }]}>
        <View style={[styles.icon, negative && styles.iconNegative]}><Icon size={18} color={negative ? colors.danger : colors.brandBrown} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.rowTop}><Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={2}>{item.title}</Text>{isUnread ? <View style={styles.dot} /> : null}</View>
          {item.body ? <Text style={styles.body} numberOfLines={3}>{item.body}</Text> : null}
          <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
        </View>
      </Pressable>;
    }}
  />;
}

const styles = bindBrandStyles({
  root: { flex: 1, backgroundColor: colors.white },
  content: { padding: 20, paddingBottom: 40, width: "100%", maxWidth: 760, alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  header: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: spacing.lg },
  kicker: { color: colors.saffron, fontSize: 10, fontWeight: "700", letterSpacing: .8 },
  h1: { fontSize: 30, lineHeight: 36, fontWeight: "700", color: colors.ink },
  sub: { color: colors.muted2, fontSize: 12, marginTop: 3 },
  readAll: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.brandTint },
  readAllText: { color: colors.brandBrown, fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", gap: 12, padding: 14, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.warmBorder, backgroundColor: colors.white },
  rowUnread: { backgroundColor: "#FFF8F4", borderColor: "#F1C9B5" },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTint },
  iconNegative: { backgroundColor: "#FEE2E2" },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "600" },
  titleUnread: { fontWeight: "800" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandOrange, marginTop: 5 },
  body: { color: colors.muted2, fontSize: 12, lineHeight: 17, marginTop: 3 },
  time: { color: colors.muted2, fontSize: 10, marginTop: 6, fontWeight: "600" },
  empty: { alignItems: "center", padding: 32, borderRadius: radii.xl, backgroundColor: colors.muted },
  emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: "700", marginTop: 10 },
  emptyBody: { color: colors.muted2, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 5, maxWidth: 300 },
});
