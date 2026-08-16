import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getPresence, updateMyPresence } from "../api/client";
import type { PresenceDoc, PresenceStatus, PresenceUpdateInput, PresenceView } from "../types/contracts";

export const PRESENCE_HEARTBEAT_MS = 20_000;
export const PRESENCE_POLL_MS = 10_000;
export const PRESENCE_IDLE_MS = 60_000;

function viewForPath(pathname: string): PresenceView {
  if (pathname.startsWith("/repository")) return "repository";
  if (pathname.startsWith("/overview")) return "overview";
  return "decks";
}

export function usePresence(enabled: boolean): PresenceDoc[] {
  const location = useLocation();
  const [presence, setPresence] = useState<PresenceDoc[]>([]);
  const routeRef = useRef(location.pathname);
  const viewRef = useRef<PresenceView>(viewForPath(location.pathname));
  const focusRef = useRef<string | undefined>(undefined);
  const statusRef = useRef<PresenceStatus>("active");
  const lastActivityRef = useRef(Date.now());
  const heartbeatRef = useRef<(keepalive?: boolean) => void>(() => undefined);

  useEffect(() => {
    routeRef.current = location.pathname;
    viewRef.current = viewForPath(location.pathname);
    focusRef.current = undefined;
    if (enabled) heartbeatRef.current();
  }, [enabled, location.pathname, location.search]);

  useEffect(() => {
    if (!enabled) {
      setPresence([]);
      return;
    }

    let disposed = false;
    let heartbeatPending = false;
    let heartbeatQueued = false;
    let pollPending = false;
    statusRef.current = document.hidden ? "idle" : "active";
    if (!document.hidden) lastActivityRef.current = Date.now();

    const heartbeat = (keepalive = false) => {
      if (heartbeatPending && !keepalive) {
        heartbeatQueued = true;
        return;
      }
      const input: PresenceUpdateInput = {
        view: viewRef.current,
        route: routeRef.current,
        status: statusRef.current,
        ...(focusRef.current ? { focus: focusRef.current } : {}),
      };
      heartbeatPending = true;
      void updateMyPresence(input, keepalive)
        .then((updatedPresence) => {
          if (!disposed) {
            setPresence((current) => [updatedPresence, ...current.filter((entry) => entry.id !== updatedPresence.id)]);
          }
        })
        .catch(() => undefined)
        .finally(() => {
          heartbeatPending = false;
          if (heartbeatQueued && !disposed) {
            heartbeatQueued = false;
            heartbeat();
          }
        });
    };
    heartbeatRef.current = heartbeat;

    const poll = () => {
      if (pollPending) return;
      pollPending = true;
      void getPresence()
        .then((nextPresence) => {
          if (!disposed) setPresence(nextPresence);
        })
        .catch(() => {
          if (!disposed) setPresence([]);
        })
        .finally(() => {
          pollPending = false;
        });
    };

    const markActive = () => {
      lastActivityRef.current = Date.now();
      if (document.hidden || statusRef.current === "active") return;
      statusRef.current = "active";
      heartbeat();
    };

    const handleInput = () => {
      markActive();
    };

    const captureLabelledFocus = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("input, textarea, select, option, [contenteditable='true']")) return;
      const labelledElement = event.target.closest<HTMLElement>("[data-presence-focus]");
      const label = labelledElement?.dataset.presenceFocus?.trim();
      if (label) {
        focusRef.current = label;
        heartbeat();
      }
      markActive();
    };

    const handleVisibility = () => {
      statusRef.current = document.hidden ? "idle" : "active";
      if (!document.hidden) lastActivityRef.current = Date.now();
      heartbeat(document.hidden);
    };

    const handlePageHide = () => {
      statusRef.current = "idle";
      heartbeat(true);
    };

    const checkIdle = () => {
      const nextStatus: PresenceStatus = document.hidden || Date.now() - lastActivityRef.current >= PRESENCE_IDLE_MS
        ? "idle"
        : "active";
      if (nextStatus === statusRef.current) return;
      statusRef.current = nextStatus;
      heartbeat();
    };

    document.addEventListener("click", captureLabelledFocus, true);
    document.addEventListener("pointerdown", markActive, true);
    document.addEventListener("scroll", markActive, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", handlePageHide);

    heartbeat();
    poll();
    const heartbeatId = window.setInterval(heartbeat, PRESENCE_HEARTBEAT_MS);
    const pollId = window.setInterval(poll, PRESENCE_POLL_MS);
    const idleId = window.setInterval(checkIdle, 5_000);

    return () => {
      disposed = true;
      window.clearInterval(heartbeatId);
      window.clearInterval(pollId);
      window.clearInterval(idleId);
      document.removeEventListener("click", captureLabelledFocus, true);
      document.removeEventListener("pointerdown", markActive, true);
      document.removeEventListener("scroll", markActive, true);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      statusRef.current = "idle";
      heartbeat(true);
      heartbeatRef.current = () => undefined;
    };
  }, [enabled]);

  return presence;
}