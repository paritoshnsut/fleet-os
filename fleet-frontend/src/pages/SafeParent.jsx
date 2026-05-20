import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  CheckCircle, Clock, AlertTriangle, User, Users,
  Bell, X, Send, Bus, MapPin,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { subscribeToBroadcasts, subscribeToBoardingState } from '../lib/safeRideStore';
import { raiseSOS, subscribeToSOS } from '../lib/sosStore';

const ROUTE_PATHS = [
  { color: '#3b82f6', stops: [
    { pos: [18.5016, 73.8568], name: 'Swargate' }, { pos: [18.5162, 73.8419], name: 'Deccan' },
    { pos: [18.5437, 73.8183], name: 'Aundh' },    { pos: [18.5623, 73.7802], name: 'Wakad' },
    { pos: [18.5910, 73.7210], name: 'Hinjewadi' },
  ]},
  { color: '#10b981', stops: [
    { pos: [18.4522, 73.8614], name: 'Katraj' },      { pos: [18.4818, 73.8636], name: 'Market Yard' },
    { pos: [18.5200, 73.8567], name: 'Pune Station' }, { pos: [18.5424, 73.9009], name: 'Nagar Road' },
    { pos: [18.5731, 73.9064], name: 'Vishrantwadi' },
  ]},
  { color: '#8b5cf6', stops: [
    { pos: [18.5070, 73.8143], name: 'Kothrud' },     { pos: [18.5122, 73.8320], name: 'Karve Road' },
    { pos: [18.5204, 73.8560], name: 'Shivajinagar' }, { pos: [18.4980, 73.8950], name: 'Wanowrie' },
    { pos: [18.5090, 73.9261], name: 'Hadapsar' },
  ]},
  { color: '#f59e0b', stops: [
    { pos: [18.6298, 73.7997], name: 'Pimpri' },   { pos: [18.5890, 73.7761], name: 'Chinchwad' },
    { pos: [18.5522, 73.8019], name: 'Bopodi' },   { pos: [18.5310, 73.8446], name: 'Shivajinagar' },
    { pos: [18.5204, 73.8567], name: 'Pune Station' },
  ]},
  { color: '#ef4444', stops: [
    { pos: [18.5590, 73.9070], name: 'Wagholi' },  { pos: [18.5490, 73.8990], name: 'Kharadi' },
    { pos: [18.5424, 73.9009], name: 'Nagar Road' }, { pos: [18.5300, 73.8700], name: 'Yerwada' },
    { pos: [18.5204, 73.8567], name: 'Pune Station' },
  ]},
];

function interpolate(stops, progress) {
  const N = stops.length;
  if (N < 2) return stops[0]?.pos ?? [18.52, 73.85];
  const c = Math.min(Math.max(progress, 0), 0.9999);
  const i = Math.min(Math.floor(c * (N - 1)), N - 2);
  const f = c * (N - 1) - i;
  const [la1, ln1] = stops[i].pos;
  const [la2, ln2] = stops[i + 1].pos;
  return [la1 + (la2 - la1) * f, ln1 + (ln2 - ln1) * f];
}

function createBusMarker(color, highlighted) {
  const size = highlighted ? 38 : 28;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;
      background:${color}22;border:${highlighted ? 3 : 2}px solid ${color};
      display:flex;align-items:center;justify-content:center;font-size:${highlighted ? 17 : 13}px;
      box-shadow:${highlighted ? `0 0 16px ${color}66` : 'none'};">🚌</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 4],
  });
}

// ── Status card ───────────────────────────────────────────────────────────────
function StatusCard({ student, boardingStatus, boardingTime }) {
  if (!student) return null;
  const boarded = boardingStatus === 'boarded';
  return (
    <div className={cn(
      'rounded-2xl border p-5',
      boarded ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
    )}>
      <div className="flex items-center gap-4">
        <div className={cn('w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0',
          boarded ? 'bg-green-100 border border-green-200' : 'bg-amber-100 border border-amber-200'
        )}>
          {boarded
            ? <CheckCircle size={28} className="text-green-600" />
            : <Clock size={28} className="text-amber-500" />}
        </div>
        <div>
          <p className={cn('font-bold text-lg', boarded ? 'text-green-700' : 'text-amber-700')}>
            {boarded ? `${student.name.split(' ')[0]} is safely on the bus` : `Waiting for ${student.name.split(' ')[0]} to board`}
          </p>
          <p className="text-slate-500 text-sm mt-0.5">
            {boarded
              ? `Boarded at ${boardingTime} · ${student.stop}`
              : `Expected pickup at ${student.stop}`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Broadcast banner ──────────────────────────────────────────────────────────
function BroadcastBanner({ broadcasts, onDismiss }) {
  if (broadcasts.length === 0) return null;
  const latest = broadcasts[0];
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex items-start gap-3">
      <Bell size={16} className="text-purple-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-purple-700 font-semibold text-sm">Message from School</p>
        <p className="text-slate-700 text-sm mt-0.5 leading-relaxed">{latest.message}</p>
        <p className="text-slate-400 text-xs mt-1">{latest.time}</p>
        {broadcasts.length > 1 && (
          <p className="text-purple-500 text-xs mt-1">{broadcasts.length - 1} earlier message{broadcasts.length > 2 ? 's' : ''}</p>
        )}
      </div>
      <button onClick={onDismiss} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
        <X size={15} />
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SafeParent() {
  const [students,      setStudents]      = useState([]);
  const [buses,         setBuses]         = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [boardingState, setBoardingState] = useState({});
  const [broadcasts,    setBroadcasts]    = useState([]);
  const [showBroadcast, setShowBroadcast] = useState(true);
  const [loading,       setLoading]       = useState(true);
  const [busProgress,   setBusProgress]   = useState(
    Array.from({ length: 5 }, () => Math.random() * 0.4)
  );

  // SOS state
  const [sosOpen,   setSosOpen]   = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [sosMsg,    setSosMsg]    = useState('');
  const [sosAlerts, setSosAlerts] = useState([]);

  // Load students + buses from Supabase
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: sData } = await supabase
        .from('saferide_students')
        .select('*, fleet_buses(id, bus_number)')
        .eq('is_active', true)
        .order('created_at')
        .limit(20);
      const list = sData ?? [];
      setStudents(list);
      if (list.length > 0) setSelectedChild(list[0]);

      // Collect unique bus IDs to load buses for map
      const busIds = [...new Set(list.map(s => s.bus_id).filter(Boolean))];
      if (busIds.length > 0) {
        const { data: bData } = await supabase
          .from('fleet_buses')
          .select('id, bus_number, fuel_type, seats')
          .in('id', busIds)
          .eq('is_active', true)
          .order('bus_number');
        setBuses(bData ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  // Animate buses along routes
  useEffect(() => {
    const id = setInterval(() => {
      setBusProgress(prev => prev.map(p => {
        const next = p + 0.006;
        return next >= 1 ? 0 : next;
      }));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => subscribeToBoardingState(state => setBoardingState(state)), []);

  // Subscribe to broadcasts
  useEffect(() => {
    return subscribeToBroadcasts(msgs => {
      setBroadcasts(msgs);
      if (msgs.length > 0) setShowBroadcast(true);
    });
  }, []);

  // Subscribe to SOS replies
  useEffect(() => {
    return subscribeToSOS(alerts => setSosAlerts(alerts));
  }, []);

  function handleSendSOS() {
    if (!selectedChild) return;
    const msg = sosMsg.trim() || `My child ${selectedChild.name} needs urgent assistance at ${selectedChild.stop}.`;
    raiseSOS({
      id:       `SOS-${Date.now()}`,
      severity: 'critical',
      status:   'new',
      type:     'SOS Emergency',
      parent:   `${selectedChild.name.split(' ')[0]}'s Parent`,
      phone:    '98XXXX0000',
      student:  selectedChild.name,
      busId:    selectedChild.fleet_buses?.bus_number ?? '—',
      stop:     selectedChild.stop,
      time:     new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      message:  msg,
      thread:   [],
      _isSOS:   true,
    });
    setSosActive(true);
    setSosOpen(false);
    setSosMsg('');
  }

  const childBoardingStatus = selectedChild ? (boardingState[selectedChild.id]?.status ?? 'pending') : 'pending';
  const childBoardingTime   = selectedChild ? boardingState[selectedChild.id]?.time : null;
  const myAlert = sosAlerts.find(a => a.student === selectedChild?.name && a._isSOS);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading…
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-20 text-slate-400 text-sm">
        <Users size={32} className="mx-auto mb-3 opacity-30" />
        No students registered yet. The school admin needs to add students in the Control Panel.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">

      {/* Broadcast banner */}
      {showBroadcast && broadcasts.length > 0 && (
        <BroadcastBanner broadcasts={broadcasts} onDismiss={() => setShowBroadcast(false)} />
      )}

      {/* Child selector */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">Select Child</p>
        <div className="flex gap-2 flex-wrap">
          {students.slice(0, 8).map(s => {
            const status = boardingState[s.id]?.status ?? 'pending';
            return (
              <button key={s.id}
                onClick={() => { setSelectedChild(s); setSosActive(false); setSosOpen(false); }}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all',
                  selectedChild?.id === s.id
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                <User size={14} />
                {s.name.split(' ')[0]}
                <div className={cn('w-2 h-2 rounded-full flex-shrink-0',
                  status === 'boarded' ? 'bg-green-500' : 'bg-amber-400'
                )} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Status card */}
      {selectedChild && (
        <StatusCard
          student={selectedChild}
          boardingStatus={childBoardingStatus}
          boardingTime={childBoardingTime}
        />
      )}

      {/* Live map */}
      <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 320 }}>
        <MapContainer center={[18.5204, 73.8567]} zoom={12} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            attribution="&copy; CARTO"
          />
          {ROUTE_PATHS.flatMap((route, ri) => [
            <Polyline key={`line-${ri}`}
              positions={route.stops.map(s => s.pos)}
              pathOptions={{ color: route.color, weight: 3, opacity: 0.6, dashArray: '8 5' }}
            />,
            ...route.stops.map(stop => (
              <CircleMarker key={`stop-${ri}-${stop.name}`}
                center={stop.pos} radius={4}
                pathOptions={{ color: '#fff', fillColor: route.color, fillOpacity: 1, weight: 2 }}>
                <Popup><span style={{ fontSize: 12, fontWeight: 600 }}>{stop.name}</span></Popup>
              </CircleMarker>
            )),
          ])}
          {buses.map((bus, idx) => {
            const route       = ROUTE_PATHS[idx % ROUTE_PATHS.length];
            const pos         = interpolate(route.stops, busProgress[idx] ?? 0);
            const isMyBus     = bus.id === selectedChild?.bus_id;
            return (
              <Marker key={bus.id} position={pos}
                icon={createBusMarker(route.color, isMyBus)}>
                <Popup>
                  <div style={{ minWidth: 140, color: '#1e293b' }}>
                    <p style={{ fontWeight: 700, marginBottom: 4 }}>{bus.bus_number}</p>
                    {isMyBus && (
                      <p style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
                        ← {selectedChild?.name?.split(' ')[0]}'s bus
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Child info */}
      {selectedChild && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">Trip Details</p>
          <div className="space-y-2">
            {[
              { icon: User,   label: 'Student',     value: selectedChild.name },
              { icon: MapPin, label: 'Boarding stop', value: selectedChild.stop },
              { icon: Bus,    label: 'Bus',           value: selectedChild.fleet_buses?.bus_number ?? 'Not assigned' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3 text-sm">
                <row.icon size={14} className="text-slate-400 flex-shrink-0" />
                <span className="text-slate-500 w-28 flex-shrink-0">{row.label}</span>
                <span className="text-slate-800 font-medium">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Broadcast history */}
      {broadcasts.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-slate-700 font-semibold text-sm flex items-center gap-2">
              <Bell size={13} className="text-purple-600" /> School Messages
            </p>
          </div>
          <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
            {broadcasts.map(b => (
              <div key={b.id} className="px-4 py-3">
                <p className="text-slate-700 text-sm">{b.message}</p>
                <p className="text-slate-400 text-xs mt-0.5">{b.time}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SOS section */}
      <div className="flex flex-col gap-2">
        {sosActive && myAlert && (
          <div className="bg-red-50 border border-red-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-red-500 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-white" />
                <p className="text-white font-bold text-sm">SOS Alert Sent</p>
              </div>
              <span className={cn(
                'text-xs px-2 py-0.5 rounded-full font-medium',
                myAlert.status === 'resolved'    ? 'bg-green-100 text-green-700' :
                myAlert.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                                                   'bg-white/20 text-white animate-pulse'
              )}>
                {myAlert.status === 'resolved' ? '✓ Resolved' :
                 myAlert.status === 'in_progress' ? 'Admin Responding' : 'Awaiting response'}
              </span>
            </div>
            <div className="px-4 py-2 border-b border-red-100">
              <p className="text-red-700 text-xs">{myAlert.message}</p>
            </div>
            {myAlert.thread?.length > 0 && (
              <div className="px-4 py-3 space-y-2">
                <p className="text-slate-500 text-xs font-medium">School Response</p>
                {myAlert.thread.map((msg, i) => (
                  <div key={i} className={cn('px-3 py-2 rounded-xl text-xs',
                    msg.from === 'Admin' ? 'bg-blue-50 border border-blue-100 text-blue-800' : 'bg-white border border-slate-200 text-slate-700'
                  )}>
                    <span className="font-semibold">{msg.from === 'Admin' ? 'School Admin' : msg.from}</span>
                    <span className="text-slate-400 ml-2">{msg.time}</span>
                    <p className="mt-0.5 leading-relaxed">{msg.text}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="px-4 pb-3">
              <button onClick={() => setSosActive(false)} className="text-red-400 text-xs hover:text-red-600 transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {!sosActive && sosOpen && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-semibold text-sm mb-2 flex items-center gap-2">
              <AlertTriangle size={14} /> Send SOS to School Admin
            </p>
            <p className="text-slate-500 text-xs mb-3">Admin will be alerted immediately and respond here.</p>
            <textarea
              value={sosMsg}
              onChange={e => setSosMsg(e.target.value)}
              rows={3}
              placeholder={`My child ${selectedChild?.name ?? ''} needs urgent help at ${selectedChild?.stop ?? 'the stop'}…`}
              className="w-full bg-white border border-red-200 rounded-lg px-3 py-2 text-slate-800 text-sm resize-none outline-none focus:border-red-400 placeholder-slate-400 mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => setSosOpen(false)}
                className="flex-1 py-2 bg-white border border-slate-200 rounded-xl text-slate-500 text-sm hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleSendSOS}
                className="flex-1 py-2 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors flex items-center justify-center gap-2">
                <Send size={13} /> Send SOS
              </button>
            </div>
          </div>
        )}

        {!sosActive && !sosOpen && (
          <button onClick={() => setSosOpen(true)}
            className="w-full py-3 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2 bg-red-50 border-red-200 text-red-600 hover:bg-red-100">
            <AlertTriangle size={16} /> SOS Emergency Alert
          </button>
        )}
      </div>

      <style>{`
        .leaflet-popup-content-wrapper {
          background: white !important; border: 1px solid #e2e8f0 !important;
          border-radius: 12px !important; padding: 0 !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important;
        }
        .leaflet-popup-content { margin: 12px !important; }
        .leaflet-popup-tip { background: white !important; }
        .leaflet-control-attribution { font-size: 9px !important; }
      `}</style>
    </div>
  );
}
