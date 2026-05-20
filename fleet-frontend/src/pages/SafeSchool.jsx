import { useState, useEffect, useCallback } from 'react';
import {
  Shield, CheckCircle, AlertTriangle, Users, Bus,
  Bell, Play, RotateCcw, Loader2, RefreshCw,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  startSimulation, resetSimulation,
  subscribeToBoardingState, subscribeToIncidents,
  sendBroadcast,
} from '../lib/safeRideStore';

const SEV = {
  ok:      'bg-green-50 border-green-200 text-green-600',
  warning: 'bg-amber-50 border-amber-200 text-amber-600',
  alert:   'bg-red-50 border-red-200 text-red-600',
};

// ── Bus card ──────────────────────────────────────────────────────────────────
function BusCard({ bus, students, boardingState }) {
  const total   = students.length;
  const boarded = students.filter(s => (boardingState[s.id]?.status ?? s.status) === 'boarded').length;
  const pct     = total > 0 ? Math.round((boarded / total) * 100) : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', boarded === total && total > 0 ? 'bg-green-500' : 'bg-amber-400 animate-pulse')} />
          <p className="text-slate-800 font-semibold text-sm">{bus.bus_number}</p>
        </div>
        <span className="text-slate-400 text-xs">{bus.fuel_type}</span>
      </div>

      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">Boarded</span>
        <span className={cn('font-semibold', boarded === total && total > 0 ? 'text-green-600' : 'text-amber-600')}>
          {boarded}/{total}
        </span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      {total === 0 ? (
        <p className="text-slate-400 text-xs text-center py-1">No students assigned</p>
      ) : (
        <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-hide">
          {students.map(s => {
            const state  = boardingState[s.id]?.status ?? 'pending';
            const bTime  = boardingState[s.id]?.time;
            return (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <span className="text-slate-700 truncate flex-1">{s.name}</span>
                <span className="text-slate-400 flex-shrink-0 mr-2 text-xs">{s.stop}</span>
                <span className={cn('px-1.5 py-0.5 rounded-full border text-xs flex-shrink-0',
                  state === 'boarded' ? 'bg-green-50 border-green-200 text-green-600' : 'bg-amber-50 border-amber-200 text-amber-600'
                )}>
                  {state === 'boarded' ? `✓ ${bTime ?? ''}` : 'Waiting'}
                </span>
              </div>
            );
          })}
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

  function handleStartSim() {
    const studentsWithBus = students
      .filter(s => s.bus_id)
      .map(s => ({
        id:        s.id,
        name:      s.name,
        stop:      s.stop,
        busNumber: buses.find(b => b.id === s.bus_id)?.bus_number ?? '—',
      }));
    if (studentsWithBus.length === 0) return;
    startSimulation(studentsWithBus);
  }

  function handleBroadcast() {
    if (!broadcastMsg.trim()) return;
    sendBroadcast(broadcastMsg);
    setBroadcastSent(true);
    setBroadcastMsg('');
    setTimeout(() => setBroadcastSent(false), 3000);
  }

  const totalStudents  = students.length;
  const boardedCount   = Object.values(boardingState).filter(s => s.status === 'boarded').length;
  const pendingCount   = Object.values(boardingState).filter(s => s.status === 'pending').length;
  const unassigned     = students.filter(s => !s.bus_id).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Shield size={24} className="animate-pulse mr-3" /> Loading SafeRide…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* Header + simulation controls */}
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
              <Loader2 size={14} className="animate-spin" /> Simulation running…
            </div>
          ) : boardedCount > 0 ? (
            <button onClick={() => { resetSimulation(); }}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors">
              <RotateCcw size={14} /> Reset
            </button>
          ) : (
            <button
              onClick={handleStartSim}
              disabled={students.filter(s => s.bus_id).length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              <Play size={14} /> Start Morning Route
            </button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Students', value: totalStudents,                              color: 'text-slate-800',  icon: Users       },
          { label: 'Boarded',        value: boardedCount,                               color: 'text-green-600',  icon: CheckCircle },
          { label: 'Waiting',        value: pendingCount,                               color: 'text-amber-600',  icon: Bus         },
          { label: 'Unassigned',     value: unassigned,                                 color: unassigned > 0 ? 'text-red-600' : 'text-slate-400', icon: AlertTriangle },
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
          {unassigned} student{unassigned !== 1 ? 's are' : ' is'} not assigned to a bus. Assign them in the Admin Panel → Students tab.
        </div>
      )}

      {/* Bus cards */}
      {buses.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
          <Bus size={32} className="mx-auto mb-3 opacity-30" />
          No buses found. Add buses in the Admin Panel → Buses tab.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {buses.map(bus => (
            <BusCard
              key={bus.id}
              bus={bus}
              students={students.filter(s => s.bus_id === bus.id)}
              boardingState={boardingState}
            />
          ))}
        </div>
      )}

      {/* Bottom row: incident log + broadcast */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Incident log */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <p className="text-slate-700 font-semibold text-sm">Today's Incident Log</p>
            <span className="text-slate-400 text-xs">{incidents.length} events</span>
          </div>
          {incidents.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              No events yet. Start the morning route simulation to generate live events.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto scrollbar-hide">
              {incidents.map(ev => (
                <div key={ev.id} className="flex items-center gap-4 px-5 py-3 text-xs hover:bg-slate-50 transition-colors">
                  <span className="text-slate-400 w-12 flex-shrink-0 font-mono">{ev.time}</span>
                  <span className="text-slate-500 w-20 flex-shrink-0 truncate text-xs font-mono">{ev.bus}</span>
                  <span className={cn('px-2 py-0.5 rounded-full border text-xs flex-shrink-0', SEV[ev.severity] ?? SEV.ok)}>
                    {ev.type}
                  </span>
                  <span className="text-slate-600 truncate">{ev.detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Broadcast panel */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <p className="text-slate-700 font-semibold text-sm flex items-center gap-2">
            <Bell size={14} className="text-purple-600" /> Broadcast to Parents
          </p>
          <textarea
            rows={4}
            value={broadcastMsg}
            onChange={e => setBroadcastMsg(e.target.value)}
            placeholder="Type a message for all parents…"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 text-sm resize-none outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 placeholder-slate-400"
          />
          <button
            onClick={handleBroadcast}
            disabled={!broadcastMsg.trim() || broadcastSent}
            className={cn(
              'w-full py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
              broadcastSent
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40'
            )}
          >
            {broadcastSent
              ? <><CheckCircle size={14} /> Sent to all parents</>
              : <><Bell size={14} /> Send to All Parents</>}
          </button>
          <p className="text-slate-400 text-xs text-center">Parents see this instantly in their app</p>
        </div>
      </div>
    </div>
  );
}
