import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Shield, AlertTriangle, CheckCircle, Users,
  Bell, Clock, XCircle, Activity,
  Phone, Edit3, Lock, Unlock,
  MessageSquare, Flag
} from 'lucide-react';
import { cn } from '../lib/utils';

const ROUTE_PATHS = [
  {
    color: '#3b82f6',
    stops: [
      { pos: [18.5016, 73.8568], name: 'Swargate' },
      { pos: [18.5162, 73.8419], name: 'Deccan' },
      { pos: [18.5437, 73.8183], name: 'Aundh' },
      { pos: [18.5623, 73.7802], name: 'Wakad' },
      { pos: [18.5910, 73.7210], name: 'Hinjewadi' },
    ],
  },
  {
    color: '#10b981',
    stops: [
      { pos: [18.4522, 73.8614], name: 'Katraj' },
      { pos: [18.4818, 73.8636], name: 'Market Yard' },
      { pos: [18.5200, 73.8567], name: 'Pune Station' },
      { pos: [18.5424, 73.9009], name: 'Nagar Road' },
      { pos: [18.5731, 73.9064], name: 'Vishrantwadi' },
    ],
  },
  {
    color: '#8b5cf6',
    stops: [
      { pos: [18.5070, 73.8143], name: 'Kothrud' },
      { pos: [18.5122, 73.8320], name: 'Karve Road' },
      { pos: [18.5204, 73.8560], name: 'Shivajinagar' },
      { pos: [18.4980, 73.8950], name: 'Wanowrie' },
      { pos: [18.5090, 73.9261], name: 'Hadapsar' },
    ],
  },
];

function interpolateAlongRoute(stops, progress) {
  const N = stops.length;
  if (N < 2) return stops[0]?.pos ?? [18.52, 73.85];
  const clamped = Math.min(Math.max(progress, 0), 0.9999);
  const segIdx  = Math.min(Math.floor(clamped * (N - 1)), N - 2);
  const segFrac = clamped * (N - 1) - segIdx;
  const [lat1, lng1] = stops[segIdx].pos;
  const [lat2, lng2] = stops[segIdx + 1].pos;
  return [lat1 + (lat2 - lat1) * segFrac, lng1 + (lng2 - lng1) * segFrac];
}

function createSchoolBusIcon(status) {
  const color = status === 'alert' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#22c55e';
  return L.divIcon({
    html: `
      <div style="position:relative;width:32px;height:32px;">
        ${status === 'alert' ? `<div style="position:absolute;inset:-4px;border-radius:50%;
          background:${color}33;animation:ping 1s cubic-bezier(0,0,0.2,1) infinite;"></div>` : ''}
        <div style="width:32px;height:32px;border-radius:50%;
          background:${color}22;border:2.5px solid ${color};
          display:flex;align-items:center;justify-content:center;
          font-size:14px;position:relative;z-index:1;">🚌</div>
      </div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

// ── Toast system ──────────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="fixed top-6 right-6 flex flex-col gap-2 z-[9999] pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm animate-fade-in',
          t.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
          t.type === 'alert'   ? 'bg-red-50 border-red-200 text-red-700'       :
          t.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                 'bg-blue-50 border-blue-200 text-blue-700'
        )}>
          {t.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <div>
            <p className="font-semibold">{t.title}</p>
            <p className="text-xs opacity-70">{t.message}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Student badge ─────────────────────────────────────────────────────────────
function StudentBadge({ status, isManual }) {
  const cfg = {
    boarded: { color: 'bg-green-50 border-green-200 text-green-600',   icon: <CheckCircle size={11} />, label: 'Boarded'  },
    pending: { color: 'bg-yellow-50 border-yellow-200 text-yellow-600', icon: <Clock size={11} />,        label: 'Pending'  },
    absent:  { color: 'bg-red-50 border-red-200 text-red-600',          icon: <XCircle size={11} />,      label: 'Absent'   },
  };
  const c = cfg[status] || cfg.pending;
  return (
    <div className="flex items-center gap-1">
      <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium', c.color)}>
        {c.icon} {c.label}
      </span>
      {isManual && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-50
          border border-blue-200 rounded-full text-blue-600 text-xs">
          <Edit3 size={9} /> Manual
        </span>
      )}
    </div>
  );
}

// ── Manual RFID Override ──────────────────────────────────────────────────────
function ManualOverridePanel({ student, onConfirm, onClose }) {
  const [confirmed, setConfirmed] = useState(false);

  function handleConfirm() {
    setConfirmed(true);
    setTimeout(() => {
      onConfirm(student);
      onClose();
    }, 1000);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center
      justify-center z-[9999] p-4">
      <div className="bg-white border border-blue-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-5">
          <div className="w-14 h-14 bg-blue-50 border border-blue-200 rounded-full
            flex items-center justify-center mx-auto mb-3">
            <Edit3 size={24} className="text-blue-600" />
          </div>
          <p className="text-slate-800 font-bold text-lg">Manual RFID Override</p>
          <p className="text-slate-500 text-sm mt-1">
            RFID reader failed or card not present
          </p>
        </div>

        {/* Student card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 border border-blue-200
              flex items-center justify-center text-blue-700 font-bold">
              {student.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <p className="text-slate-800 font-semibold">{student.name}</p>
              <p className="text-slate-500 text-xs">{student.stop} · {student.busId}</p>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-700">
          ⚠️ Manual override is logged separately. School admin can see all manual entries
          in monthly analytics to identify RFID reader issues.
        </div>

        <p className="text-slate-600 text-sm text-center mb-4">
          Confirm <span className="text-slate-800 font-medium">{student.name}</span> is physically on the bus?
        </p>

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-slate-50 border border-slate-200 rounded-xl
              text-slate-500 text-sm hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleConfirm}
            disabled={confirmed}
            className={cn(
              'flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all',
              confirmed
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
            )}>
            {confirmed ? '✓ Confirmed' : 'Confirm Boarded'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Parent Call Panel ─────────────────────────────────────────────────────────
function ParentCallPanel({ student, onClose, onLog }) {
  const [callState, setCallState] = useState('idle');
  const [smsSent,   setSmsSent]   = useState(false);

  const parents = [
    { name: `${student.name.split(' ')[0]}'s Mother`, phone: '98XXXX1234' },
    { name: `${student.name.split(' ')[0]}'s Father`, phone: '98XXXX5678' },
  ];

  function handleCall(parent) {
    setCallState('calling');
    setTimeout(() => {
      const answered = Math.random() > 0.35;
      const outcome  = answered ? 'answered' : 'no_answer';
      setCallState(outcome);
      onLog({
        type:    'call',
        parent:  parent.name,
        outcome,
        ts:      new Date(),
        duration: answered ? '1:24' : null,
      });
    }, 2000);
  }

  function handleSMS(parent) {
    setSmsSent(true);
    onLog({
      type:   'sms',
      parent: parent.name,
      ts:     new Date(),
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center
      justify-center z-[9999] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <p className="text-slate-800 font-bold">Contact Parent</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XCircle size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Workflow demo — in production, calls trigger via Twilio · SMS via MSG91. All contacts logged as incidents.
        </p>

        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-xs text-red-700">
          🚨 Alert: <span className="font-medium">{student.name}</span> has not boarded at {student.stop}.
          All calls and SMS are logged against this incident.
        </div>

        <div className="space-y-3">
          {parents.map((parent, i) => (
            <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-slate-800 text-sm font-medium">{parent.name}</p>
                  <p className="text-slate-400 text-xs">••••{parent.phone.slice(-4)}</p>
                </div>
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  callState === 'answered' ? 'bg-green-500' :
                  callState === 'no_answer' ? 'bg-red-500' : 'bg-slate-300'
                )} />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleCall(parent)}
                  disabled={callState !== 'idle'}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-medium transition-all',
                    callState === 'idle'      ? 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100' :
                    callState === 'calling'   ? 'bg-green-100 border-green-200 text-green-700 animate-pulse' :
                    callState === 'answered'  ? 'bg-green-50 border-green-200 text-green-700' :
                                               'bg-red-50 border-red-200 text-red-600'
                  )}>
                  <Phone size={12} className={callState === 'calling' ? 'animate-bounce' : ''} />
                  {callState === 'idle'     ? 'Call' :
                   callState === 'calling'  ? 'Calling...' :
                   callState === 'answered' ? '✓ Answered 1:24' :
                                             'No Answer'}
                </button>

                {callState === 'no_answer' && !smsSent && (
                  <button
                    onClick={() => handleSMS(parent)}
                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg
                      border bg-blue-50 border-blue-200 text-blue-600 text-xs
                      hover:bg-blue-100 transition-all">
                    <MessageSquare size={12} /> Send SMS
                  </button>
                )}
                {smsSent && (
                  <div className="flex-1 flex items-center justify-center gap-1 py-2 text-xs text-blue-600">
                    <CheckCircle size={12} /> SMS Sent
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {(callState === 'answered' || smsSent) && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700">
            <CheckCircle size={12} className="inline mr-1" />
            Contact logged against this incident. Alert can now be marked as resolved.
          </div>
        )}

        <button onClick={onClose}
          className="w-full mt-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl
            text-slate-500 text-sm hover:bg-slate-100 transition-colors">
          Close
        </button>
      </div>
    </div>
  );
}

// ── Headcount Lock ────────────────────────────────────────────────────────────
function HeadcountLock({ bus, students, onClose }) {
  const boarded   = students.filter(s => s.busId === bus.busId && s.status === 'boarded');
  const [alighted, setAlighted] = useState(boarded.map(s => s.id));
  const [emergency, setEmergency] = useState(false);
  const [closed,    setClosed]   = useState(false);

  const stillOnBus = boarded.filter(s => !alighted.includes(s.id));
  const allClear   = stillOnBus.length === 0;

  function toggleAlighted(id) {
    setAlighted(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  function handleClose() {
    if (!allClear) return;
    setClosed(true);
    setTimeout(onClose, 1500);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center
      justify-center z-[9999] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className={cn(
          'px-6 py-5 border-b border-slate-200',
          !allClear ? 'bg-red-50' : 'bg-green-50'
        )}>
          <div className="flex items-center gap-3">
            {allClear
              ? <Unlock size={20} className="text-green-600" />
              : <Lock   size={20} className="text-red-500 animate-pulse" />
            }
            <div>
              <p className="text-slate-800 font-bold">End of Trip — Headcount</p>
              <p className="text-slate-500 text-sm">{bus.busId} · {bus.routeName}</p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <p className="text-slate-600 text-sm mb-4">
            Confirm every student has alighted. Trip cannot close until all students
            are accounted for.
          </p>

          {/* Student list */}
          <div className="space-y-2 mb-5 max-h-56 overflow-y-auto scrollbar-hide">
            {boarded.map(student => {
              const hasAlighted = alighted.includes(student.id);
              return (
                <button
                  key={student.id}
                  onClick={() => toggleAlighted(student.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left',
                    hasAlighted
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200 animate-pulse'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold',
                      hasAlighted
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    )}>
                      {student.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-slate-800 text-sm font-medium">{student.name}</p>
                      <p className="text-slate-400 text-xs">{student.stop}</p>
                    </div>
                  </div>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full border font-medium',
                    hasAlighted
                      ? 'bg-green-100 border-green-200 text-green-700'
                      : 'bg-red-100 border-red-200 text-red-600'
                  )}>
                    {hasAlighted ? '✓ Alighted' : '! On Bus'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Status */}
          {!allClear && !emergency && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-red-600 font-semibold text-sm mb-1 flex items-center gap-2">
                <AlertTriangle size={14} /> Trip Blocked
              </p>
              <p className="text-slate-500 text-xs">
                {stillOnBus.map(s => s.name).join(', ')} not confirmed alighted.
                Tap their name above to mark as alighted, or trigger emergency if they cannot be found.
              </p>
            </div>
          )}

          {allClear && !closed && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4
              flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle size={16} /> All {boarded.length} students confirmed alighted
            </div>
          )}

          {closed && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4
              text-center">
              <CheckCircle size={24} className="text-green-600 mx-auto mb-2" />
              <p className="text-green-700 font-bold">Trip Closed</p>
              <p className="text-slate-500 text-xs mt-1">
                Parents notified · School admin updated
              </p>
            </div>
          )}

          {/* Actions */}
          {!closed && (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleClose}
                disabled={!allClear}
                className={cn(
                  'w-full py-3 rounded-xl border font-bold text-sm transition-all',
                  allClear
                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                    : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                )}>
                {allClear ? 'Confirm All Clear — Close Trip' : `${stillOnBus.length} student${stillOnBus.length > 1 ? 's' : ''} not confirmed`}
              </button>

              {!allClear && (
                <button
                  onClick={() => setEmergency(true)}
                  className="w-full py-2.5 bg-red-50 border border-red-200
                    rounded-xl text-red-600 text-sm font-medium hover:bg-red-100 transition-colors
                    flex items-center justify-center gap-2">
                  <AlertTriangle size={14} /> Emergency — Child Cannot Be Found
                </button>
              )}

              {emergency && (
                <div className="bg-red-500 border border-red-400 rounded-xl p-4 text-white text-sm animate-pulse">
                  🚨 <span className="font-bold">EMERGENCY ALERT SENT</span> to school admin.
                  Bus location shared. Do not move the bus.
                </div>
              )}

              <button onClick={onClose}
                className="w-full py-2 text-slate-400 text-xs hover:text-slate-600 transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SafeSchool({ buses, fetchStudents }) {
  const [students,        setStudents]        = useState([]);
  const [toasts,          setToasts]          = useState([]);
  const [selectedBus,     setSelectedBus]     = useState('all');
  const [loading,         setLoading]         = useState(true);
  const [overrideStudent, setOverrideStudent] = useState(null);
  const [callStudent,     setCallStudent]     = useState(null);
  const [headcountBus,    setHeadcountBus]    = useState(null);
  const [callLog,         setCallLog]         = useState([]);
  const [expandedStudent, setExpandedStudent] = useState(null);
  const [flaggedDrivers,  setFlaggedDrivers]  = useState([]);
  const [busProgress,     setBusProgress]     = useState([0.12, 0.45, 0.71]);
  const [broadcastMsg,    setBroadcastMsg]    = useState('Bus is running 10 minutes late due to traffic near Shivajinagar.');
  const [broadcastSent,   setBroadcastSent]   = useState(false);
  const [incidentLog,     setIncidentLog]     = useState([
    { time: '07:38', bus: 'MH12-CD-5678', type: 'RFID Scan',       detail: 'Ananya Joshi boarded at Yerwada',             severity: 'ok'      },
    { time: '07:42', bus: 'MH12-AB-1234', type: 'RFID Scan',       detail: 'Arjun Mehta boarded at Aundh',                severity: 'ok'      },
    { time: '07:45', bus: 'MH12-EF-9012', type: 'RFID Scan',       detail: 'Sneha Kulkarni boarded at Kothrud',           severity: 'ok'      },
    { time: '07:51', bus: 'MH12-AB-1234', type: 'Speed Alert',     detail: 'Bus exceeded 65 km/h on Aundh–Wakad stretch', severity: 'warning' },
    { time: '07:55', bus: 'MH12-CD-5678', type: 'Absent Flag',     detail: 'Kabir Singh not boarded at Nagar Road stop',  severity: 'alert'   },
    { time: '08:02', bus: 'MH12-AB-1234', type: 'Manual Override', detail: 'Rohan Desai manually confirmed by driver',    severity: 'warning' },
  ]);

  useEffect(() => {
    fetchStudents().then(data => { setStudents(data); setLoading(false); });
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setBusProgress(prev => prev.map(p => {
        const next = p + 0.008;
        return next >= 1 ? 0 : next;
      }));
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const schoolBuses = buses.slice(0, 3);

  function addToast(toast) {
    const id = Date.now();
    setToasts(p => [...p, { ...toast, id }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }

  function addIncident({ type, detail, severity, busId = '—' }) {
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setIncidentLog(prev => [{ time, bus: busId, type, detail, severity, isNew: true }, ...prev]);
  }

  function handleRFIDScan(student) {
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setStudents(prev => prev.map(s =>
      s.id === student.id
        ? { ...s, status: 'boarded', boardingTime: now, isManual: false }
        : s
    ));
    addToast({ type: 'success', title: `${student.name} boarded`, message: `RFID scan confirmed · ${student.stop}` });
    addIncident({ type: 'RFID Scan', detail: `${student.name} boarded at ${student.stop}`, severity: 'ok', busId: student.busId });
  }

  function handleManualOverride(student) {
    const now = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setStudents(prev => prev.map(s =>
      s.id === student.id
        ? { ...s, status: 'boarded', boardingTime: now, isManual: true }
        : s
    ));
    addToast({ type: 'warning', title: `${student.name} — Manual Override`, message: 'Boarded manually · Logged for review' });
    addIncident({ type: 'Manual Override', detail: `${student.name} manually confirmed by driver`, severity: 'warning', busId: student.busId });
  }

  function handleCallLog(log) {
    setCallLog(prev => [log, ...prev]);
    if (log.outcome === 'answered' || log.type === 'sms') {
      addToast({
        type: 'success',
        title: log.type === 'sms' ? 'SMS sent to parent' : 'Call connected',
        message: `Logged against ${callStudent?.name}'s incident`,
      });
      addIncident({
        type: log.type === 'sms' ? 'SMS Sent' : 'Parent Called',
        detail: `${log.type === 'sms' ? 'SMS sent to' : 'Call answered by'} ${log.parent}`,
        severity: 'ok',
        busId: callStudent?.busId ?? '—',
      });
    } else if (log.outcome === 'no_answer') {
      addIncident({
        type: 'No Answer',
        detail: `${log.parent} did not pick up — awaiting callback`,
        severity: 'warning',
        busId: callStudent?.busId ?? '—',
      });
    }
  }

  function handleFlagDriver(busId) {
    if (!flaggedDrivers.includes(busId)) {
      setFlaggedDrivers(prev => [...prev, busId]);
      const driver = buses.find(b => b.busId === busId)?.driverName ?? 'Driver';
      addToast({ type: 'warning', title: 'Driver flagged for review', message: `${driver} flagged · Admin notified` });
      addIncident({ type: 'Driver Flagged', detail: `${driver} flagged for conduct review`, severity: 'warning', busId });
    }
  }

  function handleBroadcast() {
    if (!broadcastMsg.trim()) return;
    const preview = broadcastMsg.length > 55 ? broadcastMsg.slice(0, 55) + '…' : broadcastMsg;
    addToast({ type: 'success', title: `Broadcast sent to ${total} parents`, message: `"${preview}"` });
    addIncident({ type: 'Broadcast', detail: `Message sent to all parents: "${preview}"`, severity: 'ok', busId: 'ALL' });
    setBroadcastSent(true);
    setTimeout(() => setBroadcastSent(false), 3500);
  }

  function triggerDeviation(bus) {
    addToast({ type: 'alert', title: 'Route Deviation Alert', message: `${bus.busId} has left the planned route corridor` });
    addIncident({ type: 'Route Deviation', detail: `${bus.busId} left planned route corridor`, severity: 'alert', busId: bus.busId });
  }

  const boarded  = students.filter(s => s.status === 'boarded').length;
  const pending  = students.filter(s => s.status === 'pending').length;
  const absent   = students.filter(s => s.status === 'absent').length;
  const manual   = students.filter(s => s.isManual).length;
  const total    = students.length;

  const displayedStudents = selectedBus === 'all'
    ? students
    : students.filter(s => s.busId === selectedBus);

  const pendingStudents = students.filter(s => s.status === 'pending');

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Shield size={24} className="animate-pulse mr-3" /> Loading SafeRide...
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <Toast toasts={toasts} />

      {/* Modals */}
      {overrideStudent && (
        <ManualOverridePanel
          student={overrideStudent}
          onConfirm={handleManualOverride}
          onClose={() => setOverrideStudent(null)}
        />
      )}
      {callStudent && (
        <ParentCallPanel
          student={callStudent}
          onClose={() => setCallStudent(null)}
          onLog={handleCallLog}
        />
      )}
      {headcountBus && (
        <HeadcountLock
          bus={headcountBus}
          students={students}
          onClose={() => {
            addToast({ type: 'success', title: 'Trip closed', message: `${headcountBus.busId} headcount confirmed` });
            setHeadcountBus(null);
          }}
        />
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total',   value: total,   color: 'text-slate-800'       },
          { label: 'Boarded', value: boarded, color: 'text-green-600'       },
          { label: 'Pending', value: pending, color: 'text-amber-600'       },
          { label: 'Absent',  value: absent,  color: absent > 0 ? 'text-red-600' : 'text-slate-800' },
          { label: 'Manual',  value: manual,  color: manual > 0 ? 'text-blue-600' : 'text-slate-400',
            sub: 'override entries' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-slate-500 text-xs mb-1">{s.label}</p>
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            {s.sub && <p className="text-slate-400 text-xs mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Absent alert with parent call */}
      {absent > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
            <p className="text-red-700 font-semibold text-sm">
              {absent} student{absent > 1 ? 's' : ''} not boarded — contact parents
            </p>
          </div>
          <div className="space-y-2">
            {students.filter(s => s.status === 'absent').map(s => (
              <div key={s.id} className="flex items-center justify-between bg-white
                border border-red-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-slate-800 text-sm font-medium">{s.name}</p>
                  <p className="text-slate-500 text-xs">{s.stop} · {s.busId}</p>
                </div>
                <button
                  onClick={() => setCallStudent(s)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-50
                    border border-green-200 rounded-lg text-green-600 text-xs
                    hover:bg-green-100 transition-colors"
                >
                  <Phone size={12} /> Call Parent
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: Map + bus cards */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Map */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: '380px' }}>
            <MapContainer center={[18.5204, 73.8567]} zoom={13}
              style={{ width: '100%', height: '100%', background: '#f1f5f9' }}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; CARTO'
              />

              {/* Route polylines + stop dots */}
              {ROUTE_PATHS.flatMap((route, ri) => [
                <Polyline key={`line-${ri}`}
                  positions={route.stops.map(s => s.pos)}
                  pathOptions={{ color: route.color, weight: 3.5, opacity: 0.75, dashArray: '8,5' }}
                />,
                ...route.stops.map(stop => (
                  <CircleMarker key={`stop-${ri}-${stop.name}`}
                    center={stop.pos} radius={4}
                    pathOptions={{ color: '#fff', fillColor: route.color, fillOpacity: 1, weight: 2 }}>
                    <Popup><span style={{ fontSize: '12px', fontWeight: 600 }}>{stop.name}</span></Popup>
                  </CircleMarker>
                )),
              ])}

              {/* Live bus markers — positions interpolated along route polylines */}
              {schoolBuses.map((bus, idx) => {
                const route = ROUTE_PATHS[idx % ROUTE_PATHS.length];
                const pos   = interpolateAlongRoute(route.stops, busProgress[idx] ?? 0);
                return (
                  <Marker key={bus.busId} position={pos}
                    icon={createSchoolBusIcon(bus.speed > 65 ? 'alert' : 'ok')}>
                    <Popup>
                      <div style={{ background: 'white', color: '#1e293b', padding: '4px', minWidth: '160px' }}>
                        <p style={{ fontWeight: 700, marginBottom: '4px' }}>{bus.busId}</p>
                        <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '8px' }}>{bus.routeName}</p>
                        <p style={{ fontSize: '12px' }}>Speed: <b style={{ color: bus.speed > 65 ? '#ef4444' : '#16a34a' }}>{bus.speed} km/h</b></p>
                        <p style={{ fontSize: '12px' }}>Driver: {bus.driverName}</p>
                        <p style={{ fontSize: '12px', marginTop: '4px', color: '#64748b' }}>
                          {students.filter(s => s.busId === bus.busId && s.status === 'boarded').length} boarded
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>

          {/* Bus cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {schoolBuses.map(bus => {
              const busStudents = students.filter(s => s.busId === bus.busId);
              const busBoarded  = busStudents.filter(s => s.status === 'boarded').length;
              const hasAlert    = bus.speed > 65;
              const isFlagged   = flaggedDrivers.includes(bus.busId);

              return (
                <div key={bus.busId} className={cn(
                  'bg-white border rounded-xl p-4 shadow-sm transition-all',
                  selectedBus === bus.busId ? 'border-blue-300 bg-blue-50' : 'border-slate-200',
                  hasAlert && 'border-red-300'
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 cursor-pointer"
                      onClick={() => setSelectedBus(p => p === bus.busId ? 'all' : bus.busId)}>
                      <div className={cn('w-2 h-2 rounded-full',
                        hasAlert ? 'bg-red-500 animate-pulse' : 'bg-green-500')} />
                      <p className="text-slate-800 font-semibold text-sm">{bus.busId}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {isFlagged && (
                        <span className="px-1.5 py-0.5 bg-red-50 border border-red-200
                          rounded-full text-red-600 text-xs flex items-center gap-1">
                          <Flag size={9} /> Flagged
                        </span>
                      )}
                      {hasAlert && <AlertTriangle size={14} className="text-red-500" />}
                    </div>
                  </div>

                  <p className="text-slate-500 text-xs mb-2 truncate">{bus.routeName}</p>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">Students</span>
                    <span className="text-green-600 font-medium">{busBoarded}/{busStudents.length}</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-3">
                    <div className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${busStudents.length ? (busBoarded/busStudents.length)*100 : 0}%` }} />
                  </div>
                  <p className="text-slate-400 text-xs mb-3">Driver: {bus.driverName?.split(' ')[0]}</p>

                  {/* Action buttons */}
                  <div className="space-y-1.5">
                    <button
                      onClick={() => triggerDeviation(bus)}
                      className="w-full py-1.5 bg-red-50 border border-red-200
                        rounded-lg text-red-600 text-xs hover:bg-red-100 transition-colors">
                      Simulate Deviation Alert
                    </button>
                    <button
                      onClick={() => setHeadcountBus(bus)}
                      className="w-full py-1.5 bg-blue-50 border border-blue-200
                        rounded-lg text-blue-600 text-xs hover:bg-blue-100 transition-colors
                        flex items-center justify-center gap-1">
                      <Lock size={11} /> End Trip Headcount
                    </button>
                    <button
                      onClick={() => handleFlagDriver(bus.busId)}
                      disabled={isFlagged}
                      className={cn(
                        'w-full py-1.5 rounded-lg text-xs transition-colors flex items-center justify-center gap-1',
                        isFlagged
                          ? 'bg-slate-50 border border-slate-200 text-slate-300 cursor-not-allowed'
                          : 'bg-amber-50 border border-amber-200 text-amber-600 hover:bg-amber-100'
                      )}>
                      <Flag size={11} />
                      {isFlagged ? 'Driver Flagged' : 'Flag Driver for Review'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Student manifest + RFID */}
        <div className="flex flex-col gap-4">

          {/* RFID Simulator */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
              <Activity size={12} className="text-blue-600" />
              RFID Scanner — Pending Boarding
            </p>
            {pendingStudents.length === 0 ? (
              <div className="text-center py-4 text-green-600 text-xs">
                <CheckCircle size={20} className="mx-auto mb-1" />
                All students accounted for
              </div>
            ) : (
              <div className="space-y-2">
                {pendingStudents.map(s => (
                  <div key={s.id} className="flex items-center gap-2">
                    <button
                      onClick={() => handleRFIDScan(s)}
                      className="flex-1 flex items-center justify-between px-3 py-2.5
                        bg-blue-50 border border-blue-200 rounded-xl
                        hover:bg-blue-100 transition-all group text-left"
                    >
                      <div>
                        <p className="text-slate-800 text-sm font-medium">{s.name}</p>
                        <p className="text-slate-500 text-xs">{s.stop}</p>
                      </div>
                      <div className="flex items-center gap-1 text-blue-600 text-xs">
                        <Activity size={12} className="animate-pulse" /> Scan
                      </div>
                    </button>
                    {/* Manual override button */}
                    <button
                      onClick={() => setOverrideStudent(s)}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl
                        text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-all"
                      title="Manual RFID override"
                    >
                      <Edit3 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Student manifest */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <p className="text-slate-700 text-sm font-semibold flex items-center gap-2">
                <Users size={14} className="text-blue-600" />
                Student Manifest
              </p>
              <span className="text-slate-400 text-xs">
                {selectedBus === 'all' ? 'All buses' : selectedBus}
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto scrollbar-hide">
              {displayedStudents.map(student => (
                <div key={student.id}>
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer
                      hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedStudent(
                      expandedStudent === student.id ? null : student.id
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 text-sm font-medium truncate">{student.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-slate-400 text-xs">{student.stop}</span>
                        {student.boardingTime && (
                          <span className="text-slate-400 text-xs">· {student.boardingTime}</span>
                        )}
                      </div>
                    </div>
                    <StudentBadge status={student.status} isManual={student.isManual} />
                  </div>

                  {/* Expanded: call parent */}
                  {expandedStudent === student.id && student.status === 'absent' && (
                    <div className="px-4 pb-3 bg-slate-50">
                      <button
                        onClick={() => setCallStudent(student)}
                        className="w-full flex items-center justify-center gap-2 py-2
                          bg-green-50 border border-green-200 rounded-lg
                          text-green-600 text-xs hover:bg-green-100 transition-colors"
                      >
                        <Phone size={12} /> Call Parent Directly
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Broadcast */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
              <Bell size={12} className="text-purple-600" />
              Broadcast to Parents
            </p>
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5
                text-slate-800 text-sm resize-none outline-none focus:border-blue-400
                placeholder-slate-400 mb-2"
              rows={2}
              placeholder="Message all parents on this route..."
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
            />
            <button
              onClick={handleBroadcast}
              disabled={!broadcastMsg.trim() || broadcastSent}
              className={cn(
                'w-full py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
                broadcastSent
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 disabled:opacity-40'
              )}>
              {broadcastSent
                ? <><CheckCircle size={14} /> Sent to {total} parents</>
                : <><Bell size={14} /> Send to All Parents</>}
            </button>
          </div>

          {/* Call log */}
          {callLog.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">
                Parent Contact Log
              </p>
              <div className="space-y-2">
                {callLog.map((log, i) => (
                  <div key={i} className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg border text-xs',
                    log.outcome === 'answered' || log.type === 'sms'
                      ? 'bg-green-50 border-green-200 text-green-600'
                      : 'bg-red-50 border-red-200 text-red-600'
                  )}>
                    {log.type === 'sms'
                      ? <MessageSquare size={11} />
                      : <Phone size={11} />
                    }
                    <span className="flex-1">
                      {log.type === 'sms' ? 'SMS sent' : log.outcome === 'answered' ? `Called · ${log.duration}` : 'No answer'}
                      {' · '}{log.parent}
                    </span>
                    <span className="text-slate-400">
                      {new Date(log.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Incident log */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <p className="text-slate-700 text-sm font-semibold">Today's Incident Log</p>
          <span className="text-slate-400 text-xs">{incidentLog.length} events</span>
        </div>
        <div className="divide-y divide-slate-100">
          {incidentLog.map((log, i) => (
            <div key={i} className={cn(
              'flex items-center gap-4 px-5 py-3 text-xs hover:bg-slate-50 transition-colors',
              log.isNew && 'bg-blue-50/60 border-l-2 border-blue-400'
            )}>
              <span className="text-slate-400 w-12 flex-shrink-0">{log.time}</span>
              <span className="text-slate-500 w-24 flex-shrink-0 truncate">{log.bus}</span>
              <span className={cn(
                'px-2 py-0.5 rounded-full border text-xs flex-shrink-0',
                log.severity === 'ok'      ? 'bg-green-50 border-green-200 text-green-600' :
                log.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-600' :
                                             'bg-red-50 border-red-200 text-red-600'
              )}>{log.type}</span>
              <span className="text-slate-600 truncate">{log.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        .leaflet-popup-content-wrapper {
          background: white !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 12px !important;
          padding: 0 !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important;
        }
        .leaflet-popup-content { margin: 12px !important; color: #1e293b !important; }
        .leaflet-popup-tip { background: white !important; }
        .leaflet-popup-close-button { color: #94a3b8 !important; }
        .leaflet-control-attribution {
          background: rgba(255,255,255,0.8) !important;
          color: #64748b !important;
          font-size: 9px !important;
        }
      `}</style>
    </div>
  );
}
