import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Seeded demo incidents — all start as 'new', spread over the last few hours
const SEED_ALERTS = [
  { type: 'overspeed', message: 'Route 332 overspeed: 83 km/h',          severity: 'high',   bus_id: 'MH12-GH-3456', route_no: 'R3', driver_name: 'Vijay Shinde',   minsAgo: 3  },
  { type: 'deviation', message: 'Route deviation detected — Route 5',    severity: 'high',   bus_id: 'MH12-CD-5678', route_no: 'R5', driver_name: 'Suresh Patil',   minsAgo: 11 },
  { type: 'breakdown', message: 'Engine warning light — MH12-EF-9012',   severity: 'high',   bus_id: 'MH12-EF-9012', route_no: 'R2', driver_name: 'Ajay Deshmukh',  minsAgo: 18 },
  { type: 'harsh',     message: 'Harsh braking event on Route 1',        severity: 'medium', bus_id: 'MH12-AB-1234', route_no: 'R1', driver_name: 'Ramesh Kumar',   minsAgo: 25 },
  { type: 'geofence',  message: 'Geofence breach at Stop 4 — Route 4',   severity: 'medium', bus_id: 'MH12-IJ-2345', route_no: 'R4', driver_name: 'Nitin Jadhav',   minsAgo: 34 },
  { type: 'idle',      message: 'Excessive idling: 22 min — Route 7',    severity: 'low',    bus_id: 'MH12-KL-6789', route_no: 'R7', driver_name: 'Deepak Rane',    minsAgo: 47 },
];

export function useAlerts(liveAlerts = []) {
  const { user, isDemoMode } = useAuth();
  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const seenRef = useRef(new Set());

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const { data, error } = await supabase
      .from('fleet_alerts')
      .select('*')
      .eq('operator_id', user.id)
      .order('detected_at', { ascending: false })
      .limit(100);

    if (error) {
      // Table might not exist yet (migration not run) — fail silently
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    rows.forEach(r => r.source_key && seenRef.current.add(r.source_key));

    // Seed demo data once when table is empty
    if (rows.length === 0 && isDemoMode) {
      const now = Date.now();
      const toInsert = SEED_ALERTS.map((a, i) => {
        const ts = new Date(now - a.minsAgo * 60000).toISOString();
        return {
          operator_id:  user.id,
          source_key:   `seed-${i}`,
          bus_id:       a.bus_id,
          route_no:     a.route_no,
          driver_name:  a.driver_name,
          type:         a.type,
          message:      a.message,
          severity:     a.severity,
          status:       'new',
          timeline:     [{ by: 'System', note: a.message, ts, type: 'system' }],
          detected_at:  ts,
        };
      });

      const { data: inserted } = await supabase
        .from('fleet_alerts')
        .upsert(toInsert, { onConflict: 'operator_id,source_key' })
        .select();

      if (inserted) {
        const sorted = inserted.sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));
        setIncidents(sorted);
        inserted.forEach(r => seenRef.current.add(r.source_key));
        setLoading(false);
        return;
      }
    }

    setIncidents(rows);
    setLoading(false);
  }, [user, isDemoMode]);

  useEffect(() => { load(); }, [load]);

  // Persist new high-severity live alerts from WebSocket
  useEffect(() => {
    if (!user || !liveAlerts.length) return;
    const latest = liveAlerts[0];
    if (!latest) return;

    const key = `live-${latest.id}`;
    if (seenRef.current.has(key)) return;
    if (latest.severity !== 'high') return;

    seenRef.current.add(key);
    const ts = new Date().toISOString();

    supabase.from('fleet_alerts')
      .upsert({
        operator_id:  user.id,
        source_key:   key,
        bus_id:       latest.busId,
        route_no:     latest.routeNo,
        driver_name:  latest.driverName ?? null,
        type:         latest.type ?? 'alert',
        message:      latest.message || 'Live Alert',
        severity:     latest.severity,
        status:       'new',
        timeline:     [{ by: 'System', note: latest.message, ts, type: 'system' }],
      }, { onConflict: 'operator_id,source_key' })
      .then(() => load());
  }, [liveAlerts, user, load]);

  async function updateStatus(id, newStatus, note) {
    const inc = incidents.find(i => i.id === id);
    if (!inc) return;

    const entry = {
      by:   'Depot Manager',
      note: note || `Moved to ${newStatus.replace('_', ' ')}`,
      ts:   new Date().toISOString(),
      type: 'status',
    };
    const newTimeline = [...(inc.timeline ?? []), entry];

    await supabase
      .from('fleet_alerts')
      .update({ status: newStatus, timeline: newTimeline })
      .eq('id', id);

    setIncidents(prev => prev.map(i =>
      i.id === id ? { ...i, status: newStatus, timeline: newTimeline } : i
    ));
  }

  return { incidents, loading, updateStatus, refresh: load };
}
