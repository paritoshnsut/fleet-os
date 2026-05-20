import { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Shield, CheckCircle, AlertTriangle, Users, Bus,
  Bell, Play, RotateCcw, Loader2, RefreshCw, UserCheck, UserX,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  startSimulation, resetSimulation,
  subscribeToBoardingState, subscribeToIncidents,
  sendBroadcast, manualBoard, markAbsent,
} from '../lib/safeRideStore';

// ── Route paths ───────────────────────────────────────────────────────────────
const ROUTE_PATHS = [
  { color: '#3b82f6', stops: [
    { pos: [18.5016, 73.8568], name: 'Swargate'    },
    { pos: [18.5162, 73.8419], name: 'Deccan'      },
    { pos: [18.5437, 73.8183], name: 'Aundh'       },
    { pos: [18.5623, 73.7802], name: 'Wakad'       },
    { pos: [18.5910, 73.7210], name: 'Hinjewadi'   },
  ]},
  { color: '#10b981', stops: [
    { pos: [18.4522, 73.8614], name: 'Katraj'      },
    { pos: [18.4818, 73.8636], name: 'Market Yard' },
    { pos: [18.5200, 73.8567], name: 'Pune Station'},
    { pos: [18.5424, 73.9009], name: 'Nagar Road'  },
    { pos: [18.5731, 73.9064], name: 'Vishrantwadi'},
  ]},
  { color: '#8b5cf6', stops: [
    { pos: [18.5070, 73.8143], name: 'Kothrud'     },
    { pos: [18.5122, 73.8320], name: 'Karve Road'  },
    { pos: [18.5204, 73.8560], name: 'Shivajinagar'},
    { pos: [18.4980, 73.8950], name: 'Wanowrie'    },
    { pos: [18.5090, 73.9261], name: 'Hadapsar'    },
  ]},
  { color: '#f59e0b', stops: [
    { pos: [18.6298, 73.7997], name: 'Pimpri'      },
    { pos: [18.5890, 73.7761], name: 'Chinchwad'   },
    { pos: [18.5522, 73.8019], name: 'Bopodi'      },
    { pos: [18.5310, 73.8446], name: 'Shivajinagar'},
    { pos: [18.5204, 73.8567], name: 'Pune Station'},
  ]},
  { color: '#ef4444', stops: [
    { pos: [18.5590, 73.9070], name: 'Wagholi'     },
    { pos: [18.5490, 73.8990], name: 'Kharadi'     },
    { pos: [18.5424, 73.9009], name: 'Nagar Road'  },
    { pos: [18.5300, 73.8700], name: 'Yerwada'     },
    { pos: [18.5204, 73.8567], name: 'Pune Station'},
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

function busIcon(color, boarded, total) {
  const allIn = total > 0 && boarded === total;
  return L.divIcon({
    html: `<div style="position:relative;width:36px;height:36px;">
      ${!allIn ? `<div style="position:absolute;inset:-3px;border-radius:50%;background:${color}33;animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;"></div>` : ''}
      <div style="width:36px;height:36px;border-radius:50%;background:${color}22;border:2.5px solid ${color};
        display:flex;align-items:center;justify-content:center;font-size:15px;position:relative;z-index:1;">🚌</div>
      <div style="position:absolute;top:-6px;right:-6px;background:${allIn ? '#22c55e' : color};color:white;
        border-radius:999px;font-size:9px;font-weight:700;padding:1px 5px;border:1.5px solid white;white-space:nowrap;">
        ${boarded}/${total}
      </div>
    </div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -22],
  });
}

const SEV = {
  ok:      'bg-green-50 border-green-200 text-green-600',
  warning: 'bg-amber-50 border-amber-200 text-amber-600',
  alert:   'bg-red-50 border-red-200 text-red-600',
};

// ── Attendance row ────────────────────────────────────────────────────────────
function AttendanceRow({ student, boardingState, busNumber }) {
  const state = boardingState[student.id]?.status;
  const time  = boardingState[student.id]?.time;
  const isManual = boardingState[student.id]?.isManual;

  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-50 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-slate-800 text-xs font-medium truncate">{student.name}</p>
        <p className="text-slate-400 text-xs truncate">{student.stop}</p>
      </div>

      {state === 'boarded' ? (
        <span className={cn(
          'px-2 py-0.5 rounded-full border text-xs flex-shrink-0 flex items-center gap-1',
          isManual ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-green-50 border-green-200 text-green-600'
        )}>
          <CheckCircle size={10} /> {time ?? ''}
          {isManual && <span className="text-blue-400 ml-0.5">M</span>}
        </span>
      ) : state === 'absent' ? (
        <span className="px-2 py-0.5 rounded-full border text-xs flex-shrink-0 bg-red-50 border-red-200 text-red-600">
          Absent
        </span>
      ) : (
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={() => manualBoard(student.id, student.name, busNumber)}
            title="Mark as attended"
            className="flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 text-green-600 rounded-lg text-xs hover:bg-green-100 transition-colors"
          >
            <UserCheck size={10} /> Attend
          </button>
          <button
            onClick={() => markAbsent(student.id, student.name, busNumber)}
            title="Mark as absent"
            className="p-1 bg-red-50 border border-red-200 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
          >
            <UserX size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Bus attendance card ───────────────────────────────────────────────────────
function BusCard({ bus, students, boardingState, routeColor }) {
  const total   = students.length;
  const boarded = students.filter(s => (boardingState[s.id]?.status) === 'boarded').length;
  const absent  = students.filter(s => (boardingState[s.id]?.status) === 'absent').length;
  const pct     = total > 0 ? Math.round((boarded / total) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between"
        style={{ borderLeft: `3px solid ${routeColor ?? '#94a3b8'}` }}>
        <div>
          <p className="text-slate-800 font-semibold text-sm">{bus.bus_number}</p>
          <p className="text-slate-400 text-xs">{bus.fuel_type} · {bus.seats} seats</p>
        </div>
        <div className="text-right">
          <p className={cn('text-sm font-bold', boarded === total && total > 0 ? 'text-green-600' : 'text-amber-600')}>
            {boarded}/{total}
          </p>
          <p className="text-slate-400 text-xs">{absent > 0 ? `${absent} absent` : 'boarded'}</p>
        </div>
      </div>

      <div className="h-1" style={{ background: '#f1f5f9' }}>
        <div className="h-full bg-green-500 transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: routeColor ?? '#22c55e' }} />
      </div>

      {total === 0 ? (
        <p className="text-slate-400 text-xs text-center py-4">No students assigned</p>
      ) : (
        <div className="px-4 py-1 max-h-48 overflow-y-auto scrollbar-hide">
          {students.map(s => (
            <AttendanceRow
              key={s.id}
              student={s}
              boardingState={boardingState}
              busNumber={bus.bus_number}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SafeSchool() {
  const { user } = useAuth();
  const [buses,         setBuses]         = useState([]);
  const [students,      setStudents]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [boardingState, setBoardingState] = useState({});
  const [simRunning,    setSimRunning]    = useState(false);
  const [incidents,     setIncidents]     = useState([]);
  const [broadcastMsg,  setBroadcastMsg]  = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [busProgress,   setBusProgress]   = useState(
    Array.from({ length: 5 }, () => Math.random() * 0.4)
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: bData }, { data: sData }] = await Promise.all([
      supabase.from('fleet_buses').select('*').eq('operator_id', user.id).eq('is_active', true).order('bus_number'),
      supabase.from('saferide_students').select('*, fleet_buses(bus_number)').eq('school_id', user.id).eq('is_active', true).order('created_at'),
    ]);
    setBuses(bData ?? []);
    setStudents(sData ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => subscribeToBoardingState((state, running) => {
    setBoardingState(state);
    setSimRunning(running);
  }), []);

  useEffect(() => subscribeToIncidents(setIncidents), []);

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

  function handleStartSim() {
    const list = students
      .filter(s => s.bus_id)
      .map(s => ({
        id:        s.id,
        name:      s.name,
        stop:      s.stop,
        busNumber: buses.find(b => b.id === s.bus_id)?.bus_number ?? '—',
      }));
    if (list.length === 0) return;
    startSimulation(list);
  }

  function handleBroadcast() {
    if (!broadcastMsg.trim()) return;
    sendBroadcast(broadcastMsg);
    setBroadcastSent(true);
    setBroadcastMsg('');
    setTimeout(() => setBroadcastSent(false), 3000);
  }

  const totalStudents = students.length;
  const boardedCount  = Object.values(boardingState).filter(s => s.status === 'boarded').length;
  const absentCount   = Object.values(boardingState).filter(s => s.status === 'absent').length;
  const pendingCount  = Object.values(boardingState).filter(s => s.status === 'pending').length;
  const unassigned    = students.filter(s => !s.bus_id).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Shield size={24} className="animate-pulse mr-3" /> Loading SafeRide…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-slate-800 font-bold text-xl">School Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
            <RefreshCw size={14} />
          </button>
          {simRunning ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
              <Loader2 size={14} className="animate-spin" /> Route in progress…
            </div>
          ) : boardedCount > 0 ? (
            <button onClick={resetSimulation}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors">
              <RotateCcw size={14} /> Reset Day
            </button>
          ) : (
            <button onClick={handleStartSim}
              disabled={students.filter(s => s.bus_id).length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40">
              <Play size={14} /> Start Morning Route
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Students', value: totalStudents, color: 'text-slate-800',                                   icon: Users         },
          { label: 'Boarded',        value: boardedCount,  color: 'text-green-600',                                   icon: CheckCircle   },
          { label: 'Absent',         value: absentCount,   color: absentCount > 0 ? 'text-red-600' : 'text-slate-400', icon: AlertTriangle },
          { label: 'Waiting',        value: pendingCount,  color: 'text-amber-600',                                   icon: Bus           },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={13} className={s.color} />
              <p className="text-slate-500 text-xs">{s.label}</p>
            </div>
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {unassigned > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-sm flex items-center gap-2">
          <AlertTriangle size={15} className="flex-shrink-0" />
          {unassigned} student{unassigned !== 1 ? 's are' : ' is'} not assigned to a bus — assign them in Admin Panel → Students.
        </div>
      )}

      {/* Map + manifest side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Live map */}
        <div className="lg:col-span-3 rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 420 }}>
          <MapContainer center={[18.5204, 73.8567]} zoom={12} style={{ width: '100%', height: '100%' }}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; CARTO"
            />

            {/* Route polylines + stops */}
            {ROUTE_PATHS.flatMap((route, ri) => [
              <Polyline key={`line-${ri}`}
                positions={route.stops.map(s => s.pos)}
                pathOptions={{ color: route.color, weight: 3, opacity: 0.65, dashArray: '8 5' }}
              />,
              ...route.stops.map(stop => (
                <CircleMarker key={`stop-${ri}-${stop.name}`}
                  center={stop.pos} radius={4}
                  pathOptions={{ color: '#fff', fillColor: route.color, fillOpacity: 1, weight: 2 }}>
                  <Popup><span style={{ fontSize: 12, fontWeight: 600 }}>{stop.name}</span></Popup>
                </CircleMarker>
              )),
            ])}

            {/* Animated bus markers */}
            {buses.map((bus, idx) => {
              const route    = ROUTE_PATHS[idx % ROUTE_PATHS.length];
              const progress = busProgress[idx] ?? 0;
              const pos      = interpolate(route.stops, progress);
              const busStudents = students.filter(s => s.bus_id === bus.id);
              const boardedN    = busStudents.filter(s => boardingState[s.id]?.status === 'boarded').length;
              return (
                <Marker key={bus.id} position={pos}
                  icon={busIcon(route.color, boardedN, busStudents.length)}>
                  <Popup>
                    <div style={{ minWidth: 160, color: '#1e293b' }}>
                      <p style={{ fontWeight: 700, marginBottom: 4 }}>{bus.bus_number}</p>
                      <p style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>{bus.fuel_type} · {bus.seats} seats</p>
                      <p style={{ fontSize: 12 }}>
                        Students: <b style={{ color: boardedN === busStudents.length && busStudents.length > 0 ? '#16a34a' : '#d97706' }}>
                          {boardedN}/{busStudents.length} boarded
                        </b>
                      </p>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>

        {/* Student manifest + attendance */}
        <div className="lg:col-span-2 flex flex-col gap-0 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <p className="text-slate-700 font-semibold text-sm flex items-center gap-2">
              <Users size={14} className="text-blue-600" /> Attendance
            </p>
            <span className="text-slate-400 text-xs">{boardedCount + absentCount}/{totalStudents} marked</span>
          </div>
          <div className="overflow-y-auto flex-1" style={{ maxHeight: 370 }}>
            {buses.length === 0 ? (
              <p className="text-slate-400 text-xs text-center py-8">No buses added yet.</p>
            ) : buses.map((bus, idx) => {
              const busStudents = students.filter(s => s.bus_id === bus.id);
              if (busStudents.length === 0) return null;
              const route = ROUTE_PATHS[idx % ROUTE_PATHS.length];
              return (
                <div key={bus.id}>
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 sticky top-0">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: route.color }} />
                    <p className="text-slate-600 text-xs font-semibold">{bus.bus_number}</p>
                    <span className="text-slate-400 text-xs ml-auto">
                      {busStudents.filter(s => boardingState[s.id]?.status === 'boarded').length}/{busStudents.length}
                    </span>
                  </div>
                  <div className="px-4">
                    {busStudents.map(s => (
                      <AttendanceRow key={s.id} student={s} boardingState={boardingState} busNumber={bus.bus_number} />
                    ))}
                  </div>
                </div>
              );
            })}
            {students.filter(s => !s.bus_id).length > 0 && (
              <div>
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                  <p className="text-amber-600 text-xs font-semibold">Unassigned Students</p>
                </div>
                <div className="px-4">
                  {students.filter(s => !s.bus_id).map(s => (
                    <AttendanceRow key={s.id} student={s} boardingState={boardingState} busNumber="—" />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bus cards */}
      {buses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {buses.map((bus, idx) => (
            <BusCard
              key={bus.id}
              bus={bus}
              students={students.filter(s => s.bus_id === bus.id)}
              boardingState={boardingState}
              routeColor={ROUTE_PATHS[idx % ROUTE_PATHS.length]?.color}
            />
          ))}
        </div>
      )}

      {/* Incident log + broadcast */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <p className="text-slate-700 font-semibold text-sm">Today's Incident Log</p>
            <span className="text-slate-400 text-xs">{incidents.length} events</span>
          </div>
          {incidents.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              No events yet. Start the morning route or mark attendance manually.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto scrollbar-hide">
              {incidents.map(ev => (
                <div key={ev.id} className="flex items-center gap-3 px-5 py-2.5 text-xs hover:bg-slate-50">
                  <span className="text-slate-400 w-12 flex-shrink-0 font-mono">{ev.time}</span>
                  <span className="text-slate-500 w-24 flex-shrink-0 truncate font-mono">{ev.bus}</span>
                  <span className={cn('px-2 py-0.5 rounded-full border text-xs flex-shrink-0', SEV[ev.severity] ?? SEV.ok)}>
                    {ev.type}
                  </span>
                  <span className="text-slate-600 truncate">{ev.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <p className="text-slate-700 font-semibold text-sm flex items-center gap-2">
            <Bell size={14} className="text-purple-600" /> Broadcast to Parents
          </p>
          <textarea rows={4} value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
            placeholder="Type a message for all parents…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 text-sm resize-none outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 placeholder-slate-400"
          />
          <button onClick={handleBroadcast} disabled={!broadcastMsg.trim() || broadcastSent}
            className={cn(
              'w-full py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
              broadcastSent
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40'
            )}>
            {broadcastSent ? <><CheckCircle size={14} /> Sent to all parents</> : <><Bell size={14} /> Send to All Parents</>}
          </button>
          <p className="text-slate-400 text-xs text-center">Parents see this instantly in their app</p>
        </div>
      </div>

      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        .leaflet-popup-content-wrapper {
          background: white !important; border: 1px solid #e2e8f0 !important;
          border-radius: 12px !important; padding: 0 !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important;
        }
        .leaflet-popup-content { margin: 12px !important; }
        .leaflet-popup-tip { background: white !important; }
        .leaflet-popup-close-button { color: #94a3b8 !important; }
        .leaflet-control-attribution { font-size: 9px !important; }
      `}</style>
    </div>
  );
}
