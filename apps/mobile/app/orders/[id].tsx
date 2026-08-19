import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, ApiError } from "../../lib/api";
import { useAuthStore, hasPermission } from "../../store/useAuthStore";

type OrderDetail = {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  specialInstructions: string | null;
  internalNotes: string | null;
  grandTotal: number;
  branch: { name: string; code: string };
  items: Array<{
    id: string;
    nameSnapshot: string;
    quantity: number;
    specialInstructions: string | null;
    choices: Array<{ nameSnapshot: string }>;
    addons: Array<{ nameSnapshot: string; quantity: number }>;
  }>;
};

const FLOW: Record<string, { next: string; label: string }[]> = {
  PENDING: [
    { next: "CONFIRMED", label: "Accept Order" },
    { next: "CANCELLED", label: "Reject" },
  ],
  CONFIRMED: [{ next: "PREPARING", label: "Start Preparing" }],
  PREPARING: [{ next: "READY", label: "Mark Ready" }],
  READY: [{ next: "DELIVERED", label: "Mark Delivered" }],
  OUT_FOR_DELIVERY: [{ next: "DELIVERED", label: "Mark Delivered" }],
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.me);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [updating, setUpdating] = useState(false);

  const load = useCallback(async () => {
    const data = await api.get<OrderDetail>(`/staff/orders/${id}`);
    setOrder(data);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const canUpdate = hasPermission(me, "orders.edit") || hasPermission(me, "kitchen.updateStatus");

  async function transition(nextStatus: string) {
    if (!order) return;
    setUpdating(true);
    try {
      await api.patch(`/staff/orders/${order.id}/status`, { status: nextStatus });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? e.message : "Could not update order");
    } finally {
      setUpdating(false);
    }
  }

  if (!order) return <View style={styles.container} />;

  const actions =
    order.status === "READY" && order.type === "ONLINE_DELIVERY"
      ? [{ next: "OUT_FOR_DELIVERY", label: "Out for Delivery" }]
      : FLOW[order.status] ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.orderNumber}>{order.orderNumber}</Text>
      <Text style={styles.meta}>{order.branch.name} · {order.type.replace(/_/g, " ")} · {order.status.replace(/_/g, " ")}</Text>

      {order.specialInstructions && <Text style={styles.instructions}>Note: {order.specialInstructions}</Text>}

      <View style={styles.items}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Text style={styles.itemName}>{item.quantity}x {item.nameSnapshot}</Text>
            {item.choices.length > 0 && <Text style={styles.itemSub}>{item.choices.map((c) => c.nameSnapshot).join(", ")}</Text>}
            {item.addons.length > 0 && <Text style={styles.itemSub}>+ {item.addons.map((a) => a.nameSnapshot).join(", ")}</Text>}
            {item.specialInstructions && <Text style={styles.itemNote}>{item.specialInstructions}</Text>}
          </View>
        ))}
      </View>

      {canUpdate && actions.length > 0 && (
        <View style={styles.actions}>
          {actions.map((a) => (
            <TouchableOpacity
              key={a.next}
              disabled={updating}
              style={[styles.actionButton, a.next === "CANCELLED" && styles.actionButtonDanger]}
              onPress={() => transition(a.next)}
            >
              <Text style={styles.actionButtonText}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1220" },
  back: { color: "#94a3b8", marginBottom: 12 },
  orderNumber: { color: "#fff", fontSize: 22, fontWeight: "700" },
  meta: { color: "#94a3b8", marginTop: 4 },
  instructions: { color: "#fbbf24", marginTop: 10, fontStyle: "italic" },
  items: { marginTop: 20 },
  item: { backgroundColor: "#1e293b", borderRadius: 10, padding: 12, marginBottom: 8 },
  itemName: { color: "#fff", fontWeight: "600" },
  itemSub: { color: "#94a3b8", fontSize: 12, marginTop: 2 },
  itemNote: { color: "#fbbf24", fontSize: 12, marginTop: 2 },
  actions: { marginTop: 24, gap: 10 },
  actionButton: { backgroundColor: "#c8102e", borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  actionButtonDanger: { backgroundColor: "#334155" },
  actionButtonText: { color: "#fff", fontWeight: "600" },
});
