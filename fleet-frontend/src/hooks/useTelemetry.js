import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL  = import.meta.env.VITE_WS_URL  || 'ws://localhost:4000';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export function useTelemetry() {
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
          // Extract alerts from telemetry
          data.buses.forEach(bus => {
            if (bus.lastAlert) pushAlert({ ...bus.lastAlert, busId: bus.busId, routeNo: bus.routeNo });
          });
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Reconnect after 2s
        setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => wsRef.current?.close();
  }, [pushAlert]);

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