import { useState, useEffect, useRef, useCallback } from 'react';
import { syncFleetToBackend } from '../lib/syncFleet';

const WS_URL  = import.meta.env.VITE_WS_URL  || 'ws://localhost:4000';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function useTelemetry(operatorId) {
  const [buses,   setBuses]   = useState([]);
  const [alerts,  setAlerts]  = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  // Keep last 20 alerts
  const pushAlert = useCallback((alert) => {
    setAlerts(prev => [
      { ...alert, id: Date.now(), ts: new Date().toLocaleTimeString() },
      ...prev
    ].slice(0, 20));
  }, []);

  useEffect(() => {
    if (!operatorId) return;

    let cancelled = false;

    async function startTelemetry() {
      // Sync fleet to backend first so the first WS broadcast has the correct buses
      await syncFleetToBackend(operatorId);
      if (cancelled) return;

      function connect() {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          console.log('WebSocket connected');
        };

        ws.onmessage = (e) => {
          const data = JSON.parse(e.data);
          if (data.type === 'telemetry') {
            setBuses(data.buses);
            data.buses.forEach(bus => {
              if (bus.lastAlert) pushAlert({ ...bus.lastAlert, busId: bus.busId, routeNo: bus.routeNo });
            });
          }
        };

        ws.onclose = () => {
          setConnected(false);
          if (!cancelled) setTimeout(connect, 2000);
        };

        ws.onerror = () => ws.close();
      }

      connect();
    }

    startTelemetry();

    return () => {
      cancelled = true;
      wsRef.current?.close();
    };
  }, [operatorId, pushAlert]);

  // REST helpers
  const fetchDrivers = useCallback(() =>
    fetch(`${API_URL}/drivers`).then(r => r.json()), []);

  const fetchGCC = useCallback(() =>
    fetch(`${API_URL}/gcc`).then(r => r.json()), []);

  const fetchStudents = useCallback(() =>
    fetch(`${API_URL}/saferide/students`).then(r => r.json()), []);

  const fetchArrivals = useCallback((stop) =>
    fetch(`${API_URL}/ondc/arrivals?stop=${stop}`).then(r => r.json()), []);

  return { buses, alerts, connected, fetchDrivers, fetchGCC, fetchStudents, fetchArrivals };
}
