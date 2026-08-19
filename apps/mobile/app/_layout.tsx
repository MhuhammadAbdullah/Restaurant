import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "../store/useAuthStore";
import { api, ApiError } from "../lib/api";
import { clearTokens, getAccessToken } from "../lib/storage";

export default function RootLayout() {
  const staff = useAuthStore((s) => s.staff);
  const hydrated = useAuthStore((s) => s.hydrated);
  const setHydrated = useAuthStore((s) => s.setHydrated);
  const setMe = useAuthStore((s) => s.setMe);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        setHydrated(null);
        return;
      }
      try {
        const me = await api.get<import("../store/useAuthStore").Me>("/auth/staff/me");
        setMe(me);
        setHydrated({ id: me.id, name: me.name, email: me.email, role: me.role });
      } catch (err) {
        if (err instanceof ApiError) await clearTokens();
        setHydrated(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const inAuthGroup = segments[0] === "login";
    if (!staff && !inAuthGroup) router.replace("/login");
    if (staff && inAuthGroup) router.replace("/");
  }, [hydrated, staff, segments, router]);

  if (!hydrated) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: "#101828" }, headerTintColor: "#fff" }} />
    </>
  );
}
