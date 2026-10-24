import { useState, useEffect, useRef, useCallback } from 'react';
import { SeatUpdateMessage } from '../types';

interface UseEventWebSocketOptions {
  eventId: number | null;
  onRefresh?: () => void;
  enabled?: boolean;
}

interface WebSocketState {
  connected: boolean;
  liveCapacity: number | null;
  liveOccupied: number | null;
  liveAvailable: number | null;
  lastUpdated: string | null;
  reconnectCount: number;
}

export function useEventWebSocket({ eventId, onRefresh, enabled = true }: UseEventWebSocketOptions) {
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    liveCapacity: null,
    liveOccupied: null,
    liveAvailable: null,
    lastUpdated: null,
    reconnectCount: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const unmountedRef = useRef<boolean>(false);

  const connect = useCallback(() => {
    if (!eventId || !enabled || unmountedRef.current) return;

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const wsProto = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
    const host = apiUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}//${host}/api/v1/events/${eventId}/ws`;

    try {
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (unmountedRef.current) return;
        setState((prev) => ({
          ...prev,
          connected: true,
          reconnectCount: 0,
        }));

        // Send periodic heartbeat pings to keep socket alive
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'PING' }));
          }
        }, 25000);

        // When reconnecting, refresh authoritative state from REST API
        if (onRefresh) {
          onRefresh();
        }
      };

      socket.onmessage = (event) => {
        if (unmountedRef.current) return;
        try {
          const data: SeatUpdateMessage = JSON.parse(event.data);
          if (data.type === 'CONNECTED' || data.type === 'SEAT_UPDATE') {
            setState((prev) => ({
              ...prev,
              liveCapacity: data.capacity ?? prev.liveCapacity,
              liveOccupied: data.occupied_seats ?? prev.liveOccupied,
              liveAvailable: data.available_seats ?? prev.liveAvailable,
              lastUpdated: data.timestamp,
            }));
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      socket.onclose = () => {
        if (unmountedRef.current) return;
        setState((prev) => ({ ...prev, connected: false }));
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);

        // Exponential backoff reconnect
        setState((prev) => {
          const nextCount = prev.reconnectCount + 1;
          const delay = Math.min(1000 * Math.pow(1.5, nextCount), 15000);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            connect();
          }, delay);
          return { ...prev, reconnectCount: nextCount };
        });
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch {
      // Socket construction failed
    }
  }, [eventId, enabled, onRefresh]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    ...state,
    reconnect: connect,
  };
}
