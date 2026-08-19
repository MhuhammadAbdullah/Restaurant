import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../lib/api";
import { useAuthStore } from "../store/useAuthStore";
import { useRealtimeOrders } from "../lib/useRealtime";

type OrderListItem = {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  grandTotal: number;
  createdAt: string;
  branch: { name: string; code: string };
  customer: { name: string; phone: string } | null;
  table: { number: string } | null;
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  CONFIRMED: "#3b82f6",
  PREPARING: "#a855f7",
  READY: "#22c55e",
  OUT_FOR_DELIVERY: "#06b6d4",
  DELIVERED: "#16a34a",
  CANCELLED: "#ef4444",
  REFUNDED: "#94a3b8",
};

export default function OrdersScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const me = useAuthStore((s) => s.me);
  const selectedBranchId = useAuthStore((s) => s.selectedBranchId);
  const logout = useAuthStore((s) => s.logout);
  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!selectedBranchId && me && !me.isOwner) return;
    try {
      const query = selectedBranchId ? `?branchId=${selectedBranchId}` : "";
      const data = await api.get<OrderListItem[]>(`/staff/orders${query}`);
      setOrders(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedBranchId, me]);

  useEffect(() => {
    if (staff) load();
  }, [staff, load]);

  useRealtimeOrders(load);

  if (!staff) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{staff.name}</Text>
          <Text style={styles.headerSubtitle}>{staff.role}</Text>
        </View>
        <TouchableOpacity onPress={() => logout().then(() => router.replace("/login"))}>
          <Text style={styles.logout}>Logout</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#fff" />}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No orders yet.</Text> : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/orders/${item.id}`)}>
            <View style={styles.cardRow}>
              <Text style={styles.orderNumber}>{item.orderNumber}</Text>
              <View style={[styles.badge, { backgroundColor: STATUS_COLORS[item.status] ?? "#64748b" }]}>
                <Text style={styles.badgeText}>{item.status.replace(/_/g, " ")}</Text>
              </View>
            </View>
            <Text style={styles.meta}>
              {item.type.replace("_", " ")} · {item.branch.code}
              {item.table ? ` · Table ${item.table.number}` : ""}
              {item.customer ? ` · ${item.customer.name}` : ""}
            </Text>
            <Text style={styles.time}>{new Date(item.createdAt).toLocaleTimeString()}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1220" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  headerSubtitle: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  logout: { color: "#f87171", fontSize: 13 },
  empty: { color: "#64748b", textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#1e293b", borderRadius: 12, padding: 14, marginBottom: 10 },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNumber: { color: "#fff", fontWeight: "700", fontSize: 15 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
  meta: { color: "#94a3b8", fontSize: 12, marginTop: 6 },
  time: { color: "#64748b", fontSize: 11, marginTop: 4 },
});
