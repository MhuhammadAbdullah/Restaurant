"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Branch } from "./types";
import { useLocationStore } from "../store/useLocationStore";

const KARACHI_TIME_ZONE = "Asia/Karachi";

function minutesSinceMidnight(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

function currentKarachiMinute(timestamp: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function nextTransitionDelay(schedule: Pick<Branch, "openingTime" | "closingTime" | "breakStart" | "breakEnd">, timestamp: number): number | null {
  const times = [schedule.openingTime, schedule.closingTime, schedule.breakStart, schedule.breakEnd]
    .filter((time): time is string => !!time)
    .map(minutesSinceMidnight)
    .filter((time): time is number => time !== null);
  if (times.length === 0) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: KARACHI_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const second = Number(parts.find((part) => part.type === "second")?.value ?? 0);
  const milliseconds = timestamp % 1000;
  const nowMinute = currentKarachiMinute(timestamp);
  const delay = Math.min(...times.map((time) => {
    let minutesUntil = (time - nowMinute + 1440) % 1440;
    // If this minute's transition has already been applied, the next one is tomorrow.
    if (minutesUntil === 0) minutesUntil = 1440;
    return minutesUntil * 60_000 - second * 1_000 - milliseconds;
  }));
  return Math.max(25, delay + 25);
}

function isInDailyRange(now: number, start: number, end: number): boolean {
  // Treat hours as a half-open interval so a branch is closed at the configured closing minute.
  if (start === end) return false;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function isWithinHours(branch: Branch, timestamp: number): boolean | null {
  if (!branch.openingTime || !branch.closingTime) return null;
  const opening = minutesSinceMidnight(branch.openingTime);
  const closing = minutesSinceMidnight(branch.closingTime);
  if (opening === null || closing === null) return null;

  const now = currentKarachiMinute(timestamp);
  if (!isInDailyRange(now, opening, closing)) return false;

  if (branch.breakStart && branch.breakEnd) {
    const breakStart = minutesSinceMidnight(branch.breakStart);
    const breakEnd = minutesSinceMidnight(branch.breakEnd);
    if (breakStart !== null && breakEnd !== null && isInDailyRange(now, breakStart, breakEnd)) return false;
  }
  return true;
}

/** Loads today's schedule once, then changes open/closed status at its scheduled boundaries. */
export function useBranchOpenStatus(): boolean {
  const branch = useLocationStore((state) => state.branch);
  const resolvedIsOpen = useLocationStore((state) => state.isBranchOpen);
  const [now, setNow] = useState<number | null>(null);

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api.public.get<Branch[]>("/branches"),
    enabled: !!branch,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const latestBranch = branch ? branches?.find((candidate) => candidate.id === branch.id) ?? branch : null;
  const openingTime = latestBranch?.openingTime;
  const closingTime = latestBranch?.closingTime;
  const breakStart = latestBranch?.breakStart;
  const breakEnd = latestBranch?.breakEnd;

  useEffect(() => {
    if (!branch) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshClock = () => setNow(Date.now());
    const scheduleNextTransition = () => {
      if (timer) clearTimeout(timer);
      const timestamp = Date.now();
      const delay = nextTransitionDelay({ openingTime, closingTime, breakStart, breakEnd }, timestamp);
      if (delay === null) return;
      timer = setTimeout(() => {
        refreshClock();
        scheduleNextTransition();
      }, delay);
    };
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") {
        refreshClock();
        scheduleNextTransition();
      }
    };

    refreshClock();
    scheduleNextTransition();
    window.addEventListener("focus", refreshOnReturn);
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", refreshOnReturn);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [branch?.id, openingTime, closingTime, breakStart, breakEnd]);

  if (!branch || now === null) return resolvedIsOpen;

  const currentBranch = branches?.find((candidate) => candidate.id === branch.id) ?? branch;
  if (currentBranch.status && currentBranch.status !== "ACTIVE") return false;
  return isWithinHours(currentBranch, now) ?? resolvedIsOpen;
}
