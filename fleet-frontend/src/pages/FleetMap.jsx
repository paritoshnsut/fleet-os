import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle, X, Play, Square,
} from 'lucide-react';
import { cn, getSpeedColor, formatINR } from '../lib/utils';
import { useFleetConfig } from '../contexts/FleetConfigContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const ROUTE_COLORS = {
  R1: '#3b82f6', R2: '#8b5cf6', R3: '#f59e0b',
  R4: '#10b981', R5: '#ef4444', R6: '#06b6d4',
  R7: '#f97316', R8: '#ec4899',
};

function createBusIcon(speed, fuelType, threshold = 65) {
  const color = speed > threshold ? '#ef4444' : speed > 50 ? '#f97316' : '#22c55e';
  const symbol = fuelType === 'Electric' ? '⚡' : fuelType === 'CNG' ? '⛽' : '🛢';
  const pulse = speed > threshold
    ? `<div style="position:absolute;inset:-4px;border-radius:50%;
        background:${color}33;animation:ping 1s cubic-bezier(0,0,0.2,1) infinite;"></div>`
    : '';
  const svg = `
    <div style="position:relative;width:28px;height:28px;">
      ${pulse}
      <div style="
        width:28px;height:28px;border-radius:50%;
        background:white;border:2.5px solid ${color};
        display:flex;align-items:center;justify-content:center;
        font-size:12px;position:relative;z-index:1;
        box-shadow:0 2px 8px rgba(0,0,0,0.15);
      ">${symbol}</div>
    </div>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize:   [28, 28],
    iconAnchor: [14, 14],
    popupAnchor:[0, -16],
  });
}

function createGroundedIcon() {
  const svg = `
    <div style="position:relative;width:32px;height:32px;">
      <div style="
        width:32px;height:32px;border-radius:50%;
        background:#f1f5f9;border:2.5px solid #94a3b8;
        display:flex;align-items:center;justify-content:center;
        font-size:13px;position:relative;z-index:1;
        box-shadow:0 2px 8px rgba(0,0,0,0.10);
        opacity:0.7;
      ">🔒</div>
    </div>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize:   [32, 32],
    iconAnchor: [16, 16],
    popupAnchor:[0, -18],
  });
}

function FitBounds({ buses }) {
  const map = useMap();
  useEffect(() => {
    if (buses.length > 0) {
      const bounds = buses.map(b => [b.lat, b.lng]);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, []);
  return null;
}

function StatCard({ label, value, sub, color = 'text-slate-900' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 min-w-[130px] shadow-sm">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      <p className={cn('text-xl font-bold', color)}>{value}</p>
      {sub && <p className="text-slate-400 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}


/* ── Alert Toast ── */
function AlertToast({ toast, onDismiss }) {
  const styles = {
    high:   { wrap: 'bg-red-50 border-red-300',    text: 'text-red-800',    icon: 'text-red-500',    bar: 'bg-red-400'    },
    medium: { wrap: 'bg-amber-50 border-amber-300', text: 'text-amber-800',  icon: 'text-amber-500',  bar: 'bg-amber-400'  },
    low:    { wrap: 'bg-blue-50 border-blue-300',   text: 'text-blue-800',   icon: 'text-blue-500',   bar: 'bg-blue-400'   },
  };
  const s = styles[toast.severity] ?? styles.medium;

  return (
    <div className={cn(
      'relative w-72 rounded-xl border shadow-lg overflow-hidden pointer-events-auto',
      s.wrap,
      toast._exiting ? 'toast-out' : 'toast-in'
    )}>
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle size={14} className={cn('mt-0.5 flex-shrink-0', s.icon)} />
        <div className="flex-1 min-w-0">
          <p className={cn('font-semibold text-xs leading-snug', s.text)}>{toast.message}</p>
          {(toast.busId || toast.routeNo) && (
            <p className="text-[10px] mt-0.5 text-slate-500">
              {toast.busId}{toast.routeNo ? ` · Route ${toast.routeNo}` : ''}
            </p>
          )}
        </div>
        <button onClick={onDismiss}
          className="text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0 mt-0.5">
          <X size={12} />
        </button>
      </div>
      {/* progress bar */}
      <div className={cn('h-0.5 w-full', s.bar, 'toast-progress')} />
    </div>
  );
}


function stableKey(a) {
  return `ws-${a.busId ?? 'x'}-${(a.type ?? a.message ?? '').slice(0, 30).replace(/\s+/g, '-').toLowerCase()}`;
}

/* ══════════════════════════════════════════════════════ */
const DEMO_EVENTS = [
  { message: 'Bus MH12-AB-1234 approaching Hinjewadi depot — ETA 4 min',      severity: 'low',    busId: 'MH12-AB-1234', routeNo: 'R1' },
  { message: 'MH12-CD-5678 overspeed 72 km/h detected on Wakad Road',         severity: 'high',   busId: 'MH12-CD-5678', routeNo: 'R2' },
  { message: 'Passenger load at 92% — bus MH12-EF-9012 on Route R3',          severity: 'medium', busId: 'MH12-EF-9012', routeNo: 'R3' },
  { message: 'Route deviation — MH12-AB-1234 is 200 m off designated route',  severity: 'medium', busId: 'MH12-AB-1234', routeNo: 'R1' },
  { message: 'All buses on schedule — no delays or incidents reported',        severity: 'low',    busId: null,           routeNo: null  },
];

export default function FleetMap({ buses, alerts, demoActive = false, setDemoActive, onDemoAlert }) {
  const { config } = useFleetConfig();
  const { overspeedThreshold, gccRatePerKm } = config;
  const { user } = useAuth();

  const [routes,      setRoutes]      = useState([]);
  const [showRoutes,  setShowRoutes]  = useState(true);
  const [filterFuel,  setFilterFuel]  = useState('all');
  const [toasts,      setToasts]      = useState([]);
  const [frozenBuses, setFrozenBuses] = useState([]);
  const [groundedIds, setGroundedIds] = useState(new Set());
  const seenRef       = useRef(new Set());
  const mountedRef    = useRef(false);
  const demoActiveRef = useRef(false);
  const busesRef      = useRef(buses);

  // Keep ref in sync so setTimeout closures always read the latest value
  useEffect(() => { demoActiveRef.current = demoActive; }, [demoActive]);

  // Always keep a ref to the latest buses so effects can read without stale closures
  useEffect(() => {
    busesRef.current = buses;
    // Capture initial snapshot so the map is static before demo starts
    if (frozenBuses.length === 0 && buses.length > 0) {
      setFrozenBuses(buses);
    }
  }, [buses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Freeze position when demo stops
  useEffect(() => {
    if (!demoActive && busesRef.current.length > 0) {
      setFrozenBuses([...busesRef.current]);
    }
  }, [demoActive]);

  const displayBuses = demoActive ? buses : frozenBuses;

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:4000/api'}/routes`)
      .then(r => r.json())
      .then(setRoutes)
      .catch(() => {});
  }, []);

  // Fetch grounded buses from Supabase and keep in sync via realtime
  useEffect(() => {
    if (!user) return;
    async function fetchGrounded() {
      const { data } = await supabase
        .from('fleet_buses')
        .select('bus_number')
        .eq('operator_id', user.id)
        .eq('is_grounded', true);
      setGroundedIds(new Set((data || []).map(b => b.bus_number)));
    }
    fetchGrounded();
    const channel = supabase
      .channel('fleet-map-grounded')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fleet_buses',
        filter: `operator_id=eq.${user.id}` }, fetchGrounded)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  // New WS alerts → queue toasts (no cleanup so timers fire independently)
  useEffect(() => {
    if (!alerts.length) return;
    alerts.forEach(alert => {
      const key = stableKey(alert);

      if (!mountedRef.current || !demoActiveRef.current) {
        // Before mount or outside demo: mark as seen silently — no toasts
        seenRef.current.add(key);
        return;
      }

      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      const tid = key;
      setToasts(prev => [...prev, { ...alert, _tid: tid, _exiting: false }].slice(-5));

      // Auto-dismiss: exit animation at 12 s, remove from DOM at 12.4 s
      setTimeout(() => {
        setToasts(prev => prev.map(t => t._tid === tid ? { ...t, _exiting: true } : t));
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t._tid !== tid));
        }, 400);
      }, 12000);
    });

    mountedRef.current = true;
  }, [alerts]);

  function runDemoEvents() {
    DEMO_EVENTS.forEach((event, i) => {
      setTimeout(() => {
        if (!demoActiveRef.current) return;
        const tid = `demo-${Date.now()}-${i}`;
        setToasts(prev => [...prev, { ...event, _tid: tid, detected_at: new Date().toISOString(), _exiting: false }].slice(-5));
        onDemoAlert?.(event);
        setTimeout(() => {
          setToasts(prev => prev.map(t => t._tid === tid ? { ...t, _exiting: true } : t));
          setTimeout(() => setToasts(prev => prev.filter(t => t._tid !== tid)), 400);
        }, 9000);
      }, i * 5000 + 800);
    });
  }

  // Replay demo events whenever FleetMap mounts while demo is already active (e.g. returning from another tab)
  useEffect(() => {
    if (demoActive) runDemoEvents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function startDemo() {
    if (demoActive) {
      demoActiveRef.current = false;
      setDemoActive(false);
      return;
    }
    demoActiveRef.current = true;
    setDemoActive(true);
    runDemoEvents();
  }

  function dismissToast(tid) {
    setToasts(prev => prev.map(t => t._tid === tid ? { ...t, _exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t._tid !== tid)), 400);
  }

  const activeBuses   = displayBuses.filter(b => !groundedIds.has(b.busId));
  const groundedBuses = displayBuses.filter(b => groundedIds.has(b.busId));

  function matchesFuelFilter(b) {
    if (filterFuel === 'all')    return true;
    if (filterFuel === 'ev')     return b.fuelType === 'Electric';
    if (filterFuel === 'cng')    return b.fuelType === 'CNG';
    if (filterFuel === 'diesel') return b.fuelType === 'Diesel';
    return true;
  }
  const filteredActive   = activeBuses.filter(matchesFuelFilter);
  const filteredGrounded = groundedBuses.filter(matchesFuelFilter);

  // Speed is only meaningful while demo is running — frozen snapshots carry stale values
  const avgSpeed  = demoActive && activeBuses.length ? Math.round(activeBuses.reduce((s, b) => s + b.speed, 0) / activeBuses.length) : 0;
  const overspeed = demoActive ? activeBuses.filter(b => b.speed > overspeedThreshold).length : 0;
  const evBuses   = activeBuses.filter(b => b.fuelType === 'Electric');
  const avgSOC    = evBuses.length
    ? Math.round(evBuses.reduce((s, b) => s + (b.soc || 0), 0) / evBuses.length) : 0;
  const totalRev  = activeBuses.reduce((s, b) => s + (b.kmToday || 0) * gccRatePerKm, 0);

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Summary bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatCard label="Buses Live"    value={activeBuses.length}  sub="active on routes" />
        {groundedBuses.length > 0 && (
          <StatCard label="Grounded" value={groundedBuses.length}
            sub="defect reported" color="text-red-600" />
        )}
        <StatCard label="Avg Speed"     value={`${avgSpeed} km/h`}  sub="fleet average"
          color={avgSpeed > 55 ? 'text-orange-600' : 'text-slate-900'} />
        <StatCard label="Overspeed"     value={overspeed}           sub={`buses >${overspeedThreshold} km/h`}
          color={overspeed > 0 ? 'text-red-600' : 'text-green-600'} />
        <StatCard label="Avg EV SOC"    value={`${avgSOC}%`}        sub={`${evBuses.length} electric buses`}
          color={avgSOC < 30 ? 'text-red-600' : 'text-green-600'} />
        <StatCard label="Revenue Today" value={formatINR(totalRev)} sub={`GCC ₹${gccRatePerKm}/km`}
          color="text-blue-600" />
        <div className="ml-auto">
          <button
            onClick={startDemo}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all shadow-sm',
              demoActive
                ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
            )}
          >
            {demoActive ? <><Square size={13} /> Stop Demo</> : <><Play size={13} /> Start Demo</>}
          </button>
        </div>
      </div>

      {/* Map row */}
      <div className="flex gap-3 flex-1" style={{ minHeight: '500px' }}>

        {/* Map */}
        <div className="relative flex-1 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">

          <MapContainer
            center={[18.5204, 73.8567]}
            zoom={12}
            style={{ width: '100%', height: '100%', minHeight: '500px', background: '#f1f5f9' }}
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://carto.com/">CARTO</a>'
              maxZoom={19}
            />

            {buses.length > 0 && <FitBounds buses={buses} />}

            {showRoutes && routes.map(route => {
              const coords = route.stops?.map(s => [s.lat, s.lng]) || [];
              return coords.length > 1 ? (
                <Polyline
                  key={route.id}
                  positions={coords}
                  color={ROUTE_COLORS[route.id] || '#94a3b8'}
                  weight={2.5}
                  opacity={0.6}
                  dashArray="6 8"
                />
              ) : null;
            })}

            {filteredGrounded.map(bus => {
              if (!bus.lat || !bus.lng) return null;
              return (
                <Marker key={`g-${bus.busId}`} position={[bus.lat, bus.lng]} icon={createGroundedIcon()}>
                  <Popup maxWidth={200}>
                    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '4px' }}>
                      <p style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a', marginBottom: '4px' }}>{bus.busId}</p>
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px' }}>
                        <p style={{ color: '#dc2626', fontWeight: 600, fontSize: '12px' }}>🔒 Bus Grounded</p>
                        <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>Defect reported — lift grounding in Trip Defect Reports</p>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {filteredActive.map(bus => {
              if (!bus.lat || !bus.lng) return null;
              const score = Math.max(0, 100
                - (bus.harshBrakingCount || 0) * 3
                - (bus.harshAccelCount   || 0) * 2
                - (bus.overspeedCount    || 0) * 4
              );
              return (
                <Marker
                  key={bus.busId}
                  position={[bus.lat, bus.lng]}
                  icon={createBusIcon(bus.speed, bus.fuelType, overspeedThreshold)}
                >
                  <Popup maxWidth={240}>
                    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '4px' }}>
                      <div style={{ marginBottom: '10px' }}>
                        <p style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>{bus.busId}</p>
                        <p style={{ color: '#94a3b8', fontSize: '12px' }}>
                          {bus.routeNo} · {bus.routeName}
                        </p>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                        {[
                          { label: 'Speed',    value: `${bus.speed} km/h`,
                            color: bus.speed > 65 ? '#dc2626' : bus.speed > 50 ? '#ea580c' : '#16a34a' },
                          { label: 'Passengers', value: `${bus.passengerLoad} pax`, color: '#0f172a' },
                          { label: 'Eng. Temp',  value: `${bus.engineTemp}°C`,
                            color: bus.engineTemp > 95 ? '#dc2626' : '#0f172a' },
                          { label: bus.fuelType === 'Electric' ? 'SOC' : 'Fuel',
                            value: bus.fuelType === 'Electric' && bus.soc != null ? `${Math.round(bus.soc)}%` : bus.fuelType,
                            color: bus.soc != null && bus.soc < 25 ? '#dc2626' : '#0f172a' },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{
                            background: '#f8fafc', borderRadius: '8px', padding: '8px',
                            border: '1px solid #e2e8f0'
                          }}>
                            <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '2px' }}>{label}</p>
                            <p style={{ color, fontWeight: 700, fontSize: '13px' }}>{value}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{
                        borderTop: '1px solid #e2e8f0', paddingTop: '8px', marginBottom: '8px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div>
                          <p style={{ color: '#94a3b8', fontSize: '11px' }}>Driver</p>
                          <p style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>{bus.driverName}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ color: '#94a3b8', fontSize: '11px' }}>Score</p>
                          <p style={{
                            fontWeight: 700, fontSize: '13px',
                            color: score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#dc2626'
                          }}>{score}/100</p>
                        </div>
                      </div>
                      {bus.nextStop && (
                        <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '8px' }}>
                          → Next: {bus.nextStop}
                        </p>
                      )}
                      <div style={{
                        background: '#eff6ff', border: '1px solid #bfdbfe',
                        borderRadius: '8px', padding: '8px',
                      }}>
                        <p style={{ color: '#2563eb', fontSize: '12px' }}>
                          {bus.kmToday} km · {formatINR(bus.kmToday * 80)} today
                        </p>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Demo badge */}
          {demoActive && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[999]
              bg-blue-600 text-white text-xs font-medium px-4 py-1.5 rounded-full shadow-lg
              flex items-center gap-2 pointer-events-none">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Demo Mode Active
            </div>
          )}

          {/* Map controls */}
          <div className="absolute bottom-4 left-4 flex gap-2 z-[999]">
            <button onClick={() => setShowRoutes(p => !p)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shadow-sm',
                showRoutes
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
              )}>
              Route Lines
            </button>
            {[
              { id: 'all',    label: 'All'     },
              { id: 'ev',     label: '⚡ EV'   },
              { id: 'cng',    label: '⛽ CNG'  },
              { id: 'diesel', label: '🛢 Diesel' },
            ].map(f => (
              <button key={f.id} onClick={() => setFilterFuel(f.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all shadow-sm',
                  filterFuel === f.id
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700'
                )}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Speed legend */}
          <div className="absolute bottom-4 right-4 bg-white border border-slate-200 shadow-sm rounded-xl p-3 z-[999]">
            <p className="text-slate-500 text-xs mb-2 font-medium">Speed</p>
            {[
              { color: '#22c55e', label: 'Normal <50' },
              { color: '#f97316', label: `Moderate 50–${overspeedThreshold}` },
              { color: '#ef4444', label: `Overspeed >${overspeedThreshold}` },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2 mb-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-slate-500 text-xs">{label}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Bottom-right toast stack — fixed to viewport */}
      <div className="fixed bottom-5 right-5 flex flex-col gap-2 z-[9999]"
        style={{ pointerEvents: 'none' }}>
        {toasts.map(t => (
          <AlertToast key={t._tid} toast={t} onDismiss={() => dismissToast(t._tid)} />
        ))}
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes toastSlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes toastSlideOut {
          from { transform: translateX(0);    opacity: 1; }
          to   { transform: translateX(110%); opacity: 0; }
        }
        @keyframes toastShrink {
          from { width: 100%; }
          to   { width: 0%; }
        }
        .toast-in  { animation: toastSlideIn  0.35s cubic-bezier(0.16,1,0.3,1) forwards; }
        .toast-out { animation: toastSlideOut 0.35s ease-in forwards; }
        .toast-progress { animation: toastShrink 12s linear forwards; }
      `}</style>
    </div>
  );
}
