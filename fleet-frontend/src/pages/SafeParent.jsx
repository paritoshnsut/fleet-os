import { useState, useEffect } from 'react';
import {
  CheckCircle, Clock, AlertTriangle, User, Users,
  Bell, X, Send, Bus, MapPin,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { subscribeToBroadcasts, subscribeToBoardingState } from '../lib/safeRideStore';
import { raiseSOS, subscribeToSOS } from '../lib/sosStore';

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
  const [selectedChild, setSelectedChild] = useState(null);
  const [boardingState, setBoardingState] = useState({});
  const [broadcasts,    setBroadcasts]    = useState([]);
  const [showBroadcast, setShowBroadcast] = useState(true);
  const [loading,       setLoading]       = useState(true);

  // SOS state
  const [sosOpen,   setSosOpen]   = useState(false);
  const [sosActive, setSosActive] = useState(false);
  const [sosMsg,    setSosMsg]    = useState('');
  const [sosAlerts, setSosAlerts] = useState([]);

  // Load students from Supabase (any school's students for demo)
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('saferide_students')
        .select('*, fleet_buses(bus_number)')
        .eq('is_active', true)
        .order('created_at')
        .limit(20);
      const list = data ?? [];
      setStudents(list);
      if (list.length > 0) setSelectedChild(list[0]);
      setLoading(false);
    }
    load();
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
    </div>
  );
}
