import { useState, useEffect } from 'react';
import { subscribeToSOS, replyToAlert, resolveSOSAlert } from '../lib/sosStore';
import {
  Shield, AlertTriangle, CheckCircle, Users, Bell, Phone,
  Clock, XCircle, Activity, MessageSquare, Flag, Bus,
  ChevronRight, Send, Lock, TrendingUp, Navigation,
  Radio, RefreshCw, AlertOctagon, Edit3,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ── Seed data ─────────────────────────────────────────────────────────────────
const INITIAL_ALERTS = [
  {
    id: 'PA001', severity: 'critical', status: 'new', type: 'Not Picked Up',
    parent: "Isha Wagh's Mother", phone: '98XXXX2341', student: 'Isha Wagh',
    busId: 'MH12-GH-3456', stop: 'Pimpri', time: '07:58',
    message: "My daughter was at the Pimpri stop at 7:45 but the bus didn't come. She is still waiting outside. Please help urgently.",
    thread: [],
  },
  {
    id: 'PA002', severity: 'high', status: 'new', type: 'Safety Concern',
    parent: "Arjun Mehta's Father", phone: '98XXXX5671', student: 'Arjun Mehta',
    busId: 'MH12-AB-1234', stop: 'Aundh', time: '08:05',
    message: "I received an alert that bus MH12-AB-1234 was overspeeding. My son is on that bus. Please ensure the driver drives safely.",
    thread: [],
  },
  {
    id: 'PA003', severity: 'medium', status: 'in_progress', type: 'Late Bus',
    parent: "Priya Sharma's Mother", phone: '98XXXX1234', student: 'Priya Sharma',
    busId: 'MH12-AB-1234', stop: 'Wakad', time: '07:52',
    message: "Bus is running more than 15 minutes late at Wakad stop. My daughter has an exam today, please prioritise this route.",
    thread: [
      { from: 'Admin', text: 'We are aware of the delay due to traffic near FC Road. Bus is now approximately 5 minutes away. Apologies for the inconvenience.', time: '07:59' },
    ],
  },
  {
    id: 'PA004', severity: 'low', status: 'resolved', type: 'General Query',
    parent: "Kabir Singh's Father", phone: '98XXXX8890', student: 'Kabir Singh',
    busId: 'MH12-CD-5678', stop: 'Nagar Road', time: '07:40',
    message: "Can you confirm whether Kabir boarded the bus today? He left home at 7:30 but I have not received a notification.",
    thread: [
      { from: 'Admin', text: 'Kabir was marked absent at the Nagar Road stop today. Please check if he needs alternate transport to school.', time: '07:48' },
      { from: "Kabir's Father", text: 'Understood, he is unwell and will not attend today. Thank you.', time: '07:52' },
    ],
  },
];

const SEED_FEED = [
  { time: '07:33', bus: 'MH12-IJ-7890', type: 'rfid',      msg: 'Advait Nair boarded at Wagholi',              sev: 'ok'      },
  { time: '07:38', bus: 'MH12-CD-5678', type: 'rfid',      msg: 'Ananya Joshi boarded at Yerwada',             sev: 'ok'      },
  { time: '07:42', bus: 'MH12-AB-1234', type: 'rfid',      msg: 'Arjun Mehta boarded at Aundh',                sev: 'ok'      },
  { time: '07:44', bus: 'MH12-IJ-7890', type: 'rfid',      msg: 'Mira Jain boarded at Kharadi',                sev: 'ok'      },
  { time: '07:45', bus: 'MH12-EF-9012', type: 'rfid',      msg: 'Sneha Kulkarni boarded at Kothrud',           sev: 'ok'      },
  { time: '07:51', bus: 'MH12-EF-9012', type: 'rfid',      msg: 'Dev Patil boarded at Karve Road',             sev: 'ok'      },
  { time: '07:51', bus: 'MH12-AB-1234', type: 'speed',     msg: 'Speed alert: 71 km/h on Aundh–Wakad stretch', sev: 'warning' },
  { time: '07:55', bus: 'MH12-CD-5678', type: 'absent',    msg: 'Kabir Singh not boarded at Nagar Road',       sev: 'alert'   },
  { time: '07:58', bus: 'MH12-GH-3456', type: 'absent',    msg: 'Isha Wagh not boarded at Pimpri',             sev: 'alert'   },
  { time: '08:02', bus: 'MH12-AB-1234', type: 'override',  msg: 'Manual override: Rohan Desai confirmed',      sev: 'warning' },
  { time: '08:05', bus: 'ALL',          type: 'broadcast', msg: 'Admin broadcast sent to all parents',         sev: 'ok'      },
];

const LIVE_EVENTS = [
  { bus: 'MH12-AB-1234', type: 'geo',      msg: 'Approaching Wakad — 2 km away',       sev: 'ok'      },
  { bus: 'MH12-CD-5678', type: 'speed',    msg: 'Speed normalised: 52 km/h',            sev: 'ok'      },
  { bus: 'MH12-EF-9012', type: 'geo',      msg: 'Reached Karve Road stop',              sev: 'ok'      },
  { bus: 'MH12-IJ-7890', type: 'rfid',     msg: 'All students boarded — en route',      sev: 'ok'      },
  { bus: 'MH12-GH-3456', type: 'absent',   msg: 'Still no boarding at Pimpri stop',     sev: 'alert'   },
  { bus: 'MH12-AB-1234', type: 'geo',      msg: 'Reached Wakad — 2 min stop',           sev: 'ok'      },
  { bus: 'MH12-CD-5678', type: 'rfid',     msg: 'All boarded — route on schedule',      sev: 'ok'      },
];

const SEV_COLOR = {
  critical: 'bg-red-600 text-white border-red-600',
  high:     'bg-orange-100 text-orange-700 border-orange-300',
  medium:   'bg-amber-50 text-amber-700 border-amber-300',
  low:      'bg-slate-100 text-slate-500 border-slate-200',
};

// ── Driver call modal ─────────────────────────────────────────────────────────
function DriverCallModal({ bus, onClose, onLog }) {
  const [state, setState] = useState('idle');

  function handleCall() {
    setState('calling');
    setTimeout(() => {
      const ans = Math.random() > 0.3;
      setState(ans ? 'answered' : 'no_answer');
      onLog(ans
        ? `Admin called ${bus.driverName} — call answered`
        : `Admin called ${bus.driverName} — no answer`
      );
    }, 2200);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-2">
          <p className="text-slate-800 font-bold">Call Driver</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><XCircle size={18} /></button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Workflow demo — in production this dials via Twilio. All calls are logged.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
          <p className="text-slate-800 font-semibold text-sm">{bus.driverName ?? 'Driver'}</p>
          <p className="text-slate-500 text-xs">{bus.busId} · {bus.routeName ?? 'Route'}</p>
          <p className="text-slate-400 text-xs mt-1">••••{String(Math.floor(Math.random()*9000)+1000)}</p>
        </div>
        <button
          onClick={handleCall}
          disabled={state !== 'idle'}
          className={cn(
            'w-full py-2.5 rounded-xl border text-sm font-medium transition-all flex items-center justify-center gap-2',
            state === 'idle'     ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' :
            state === 'calling'  ? 'bg-green-100 border-green-200 text-green-700 animate-pulse' :
            state === 'answered' ? 'bg-green-50 border-green-200 text-green-700' :
                                   'bg-red-50 border-red-200 text-red-600'
          )}>
          <Phone size={14} className={state === 'calling' ? 'animate-bounce' : ''} />
          {state === 'idle' ? 'Call Driver' : state === 'calling' ? 'Calling…' : state === 'answered' ? '✓ Call Connected' : 'No Answer'}
        </button>
        <button onClick={onClose}
          className="w-full mt-2 py-2 text-slate-400 text-xs hover:text-slate-600 transition-colors">
          Close
        </button>
      </div>
    </div>
  );
}

// ── Feed icon map ─────────────────────────────────────────────────────────────
const FEED_ICON = {
  rfid:      <CheckCircle size={11} className="text-green-600" />,
  speed:     <AlertTriangle size={11} className="text-amber-500" />,
  absent:    <XCircle size={11} className="text-red-500" />,
  override:  <Edit3 size={11} className="text-blue-500" />,
  broadcast: <Bell size={11} className="text-purple-500" />,
  emergency: <AlertOctagon size={11} className="text-red-600" />,
  geo:       <Navigation size={11} className="text-blue-400" />,
  reroute:   <RefreshCw size={11} className="text-amber-500" />,
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SafeAdmin({ buses, fetchStudents }) {
  const [parentAlerts,  setParentAlerts]  = useState(INITIAL_ALERTS);
  const [activityFeed,  setActivityFeed]  = useState(SEED_FEED);
  const [students,      setStudents]      = useState([]);
  const [toasts,        setToasts]        = useState([]);
  const [expandedAlert, setExpandedAlert] = useState(null);
  const [replyText,     setReplyText]     = useState('');
  const [filterTab,     setFilterTab]     = useState('all');
  const [emergencies,   setEmergencies]   = useState(new Set());
  const [callBus,       setCallBus]       = useState(null);
  const [broadcastMsg,  setBroadcastMsg]  = useState('');
  const [broadcastSent, setBroadcastSent] = useState(false);

  useEffect(() => {
    fetchStudents().then(setStudents).catch(() => {});
  }, []);

  // Subscribe to live SOS alerts raised from SafeParent
  useEffect(() => {
    const unsub = subscribeToSOS(liveAlerts => {
      if (liveAlerts.length === 0) return;
      setParentAlerts(prev => {
        const existingIds = new Set(prev.map(a => a.id));
        const incoming = liveAlerts.filter(a => !existingIds.has(a.id));
        // Also sync status/thread updates for already-known SOS alerts
        const merged = prev.map(a => {
          const live = liveAlerts.find(l => l.id === a.id);
          return live ? { ...a, status: live.status, thread: live.thread } : a;
        });
        return incoming.length > 0 ? [...incoming, ...merged] : merged;
      });
    });
    return unsub;
  }, []);

  // Drip in simulated live events every 12 seconds
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      if (i >= LIVE_EVENTS.length) { clearInterval(id); return; }
      const ev = LIVE_EVENTS[i++];
      const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setActivityFeed(prev => [{ ...ev, time, isNew: true }, ...prev]);
    }, 12000);
    return () => clearInterval(id);
  }, []);

  const schoolBuses = buses.slice(0, 5);
  const boarded     = students.filter(s => s.status === 'boarded').length;
  const total       = students.length;
  const openAlerts  = parentAlerts.filter(a => a.status !== 'resolved').length;

  function addToast(toast) {
    const id = Date.now();
    setToasts(p => [...p, { ...toast, id }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4500);
  }

  function addFeedEvent(ev) {
    const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    setActivityFeed(prev => [{ ...ev, time, isNew: true }, ...prev]);
  }

  function resolveAlert(id) {
    const alert = parentAlerts.find(a => a.id === id);
    setParentAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'resolved' } : a));
    if (alert?._isSOS) resolveSOSAlert(id);
    addToast({ type: 'success', title: 'Alert resolved', message: 'Parent will receive SMS confirmation' });
  }

  function escalateAlert(id) {
    setParentAlerts(prev => prev.map(a => a.id === id ? { ...a, status: 'in_progress', escalated: true } : a));
    addToast({ type: 'warning', title: 'Escalated to management', message: 'Principal and transport head notified' });
    addFeedEvent({ bus: '—', type: 'override', msg: `Alert ${id} escalated to principal`, sev: 'warning' });
  }

  function sendReply(alertId) {
    if (!replyText.trim()) return;
    const time  = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const reply = { from: 'Admin', text: replyText, time };
    const alert = parentAlerts.find(a => a.id === alertId);
    setParentAlerts(prev => prev.map(a =>
      a.id === alertId
        ? { ...a, status: 'in_progress', thread: [...a.thread, reply] }
        : a
    ));
    if (alert?._isSOS) replyToAlert(alertId, reply);
    addFeedEvent({ bus: alert?.busId ?? '—', type: 'broadcast', msg: `Admin replied to ${alert?._isSOS ? 'SOS' : 'parent'} alert`, sev: 'ok' });
    setReplyText('');
    addToast({ type: 'success', title: 'Reply sent', message: alert?._isSOS ? 'Parent can see your reply live' : 'Parent will receive SMS notification' });
  }

  function triggerEmergency(busId) {
    setEmergencies(prev => new Set([...prev, busId]));
    addFeedEvent({ bus: busId, type: 'emergency', msg: 'EMERGENCY STOP triggered by admin', sev: 'alert' });
    addToast({ type: 'alert', title: '🚨 Emergency Stop Triggered', message: `${busId} — driver and school principal notified` });
  }

  function sendReroute(bus) {
    addFeedEvent({ bus: bus.busId, type: 'reroute', msg: `Reroute request sent to ${bus.driverName}`, sev: 'warning' });
    addToast({ type: 'warning', title: 'Reroute request sent', message: `${bus.driverName} notified via driver app` });
  }

  function handleBroadcast() {
    if (!broadcastMsg.trim()) return;
    const preview = broadcastMsg.length > 60 ? broadcastMsg.slice(0, 60) + '…' : broadcastMsg;
    addFeedEvent({ bus: 'ALL', type: 'broadcast', msg: `Broadcast: "${preview}"`, sev: 'ok' });
    addToast({ type: 'success', title: `Broadcast sent to ${total || '—'} parents`, message: `"${preview}"` });
    setBroadcastMsg('');
    setBroadcastSent(true);
    setTimeout(() => setBroadcastSent(false), 3000);
  }

  const filteredAlerts =
    filterTab === 'new'      ? parentAlerts.filter(a => a.status === 'new') :
    filterTab === 'open'     ? parentAlerts.filter(a => a.status === 'in_progress') :
    filterTab === 'resolved' ? parentAlerts.filter(a => a.status === 'resolved') :
    parentAlerts;

  return (
    <div className="flex flex-col gap-5">

      {/* Toasts */}
      <div className="fixed top-6 right-6 flex flex-col gap-2 z-[9999] pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={cn(
            'flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm',
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

      {/* Driver call modal */}
      {callBus && (
        <DriverCallModal
          bus={callBus}
          onClose={() => setCallBus(null)}
          onLog={msg => addFeedEvent({ bus: callBus.busId, type: 'rfid', msg, sev: 'ok' })}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-slate-800 font-bold text-xl">Admin Control Center</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            SafeRide · Transport Management · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-700 text-xs font-medium">Live</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Open Alerts',      value: openAlerts,                       icon: AlertTriangle, col: openAlerts > 0 ? 'text-red-600' : 'text-slate-400', bg: openAlerts > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200' },
          { label: 'Buses Active',     value: `${schoolBuses.length}/${schoolBuses.length}`, icon: Bus,           col: 'text-green-600', bg: 'bg-white border-slate-200' },
          { label: 'Students Boarded', value: total > 0 ? `${boarded}/${total}` : '—',      icon: Users,         col: 'text-blue-600',  bg: 'bg-white border-slate-200' },
          { label: 'Feed Events',      value: activityFeed.length,              icon: Activity,      col: 'text-purple-600', bg: 'bg-white border-slate-200' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-xl border px-4 py-3 shadow-sm', s.bg)}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon size={13} className={s.col} />
              <p className="text-slate-500 text-xs">{s.label}</p>
            </div>
            <p className={cn('text-2xl font-bold', s.col)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: Alert inbox + activity feed ── */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Alert inbox */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-red-500" />
                <p className="text-slate-800 font-semibold">Parent Alert Inbox</p>
                {openAlerts > 0 && (
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">{openAlerts}</span>
                )}
              </div>
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { key: 'all',      label: 'All' },
                  { key: 'new',      label: 'New' },
                  { key: 'open',     label: 'In Progress' },
                  { key: 'resolved', label: 'Resolved' },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setFilterTab(tab.key)}
                    className={cn(
                      'px-3 py-1 rounded-md text-xs font-medium transition-all',
                      filterTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    )}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredAlerts.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <CheckCircle size={28} className="mx-auto mb-2 text-green-400" />
                  No alerts in this category
                </div>
              )}

              {filteredAlerts.map(alert => (
                <div key={alert.id} className={cn(alert.status === 'new' && 'bg-red-50/20')}>
                  {/* Summary row */}
                  <div
                    className="px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full border text-xs font-bold flex-shrink-0 mt-0.5',
                        SEV_COLOR[alert.severity]
                      )}>
                        {alert.severity.toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5 gap-2">
                          <p className="text-slate-800 font-semibold text-sm">{alert.type}</p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-slate-400 text-xs">{alert.time}</span>
                            {alert.status === 'new'         && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                            {alert.status === 'resolved'    && <CheckCircle size={13} className="text-green-500" />}
                            {alert.status === 'in_progress' && (
                              <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 text-xs rounded-full">
                                In Progress
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-slate-500 text-xs mb-1">
                          {alert.parent} · {alert.student} · {alert.busId}
                        </p>
                        <p className="text-slate-600 text-sm line-clamp-2">{alert.message}</p>
                        {alert.thread.length > 0 && (
                          <p className="text-slate-400 text-xs mt-1 flex items-center gap-1">
                            <MessageSquare size={10} />
                            {alert.thread.length} repl{alert.thread.length === 1 ? 'y' : 'ies'}
                          </p>
                        )}
                      </div>
                      <ChevronRight size={14} className={cn(
                        'text-slate-300 flex-shrink-0 transition-transform mt-1',
                        expandedAlert === alert.id && 'rotate-90'
                      )} />
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expandedAlert === alert.id && (
                    <div className="px-5 pb-4 bg-slate-50/80 border-t border-slate-100">
                      {/* Full message */}
                      <div className="mt-3 mb-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
                        <p className="text-slate-500 text-xs font-medium mb-1">Full Message from {alert.parent}</p>
                        <p className="text-slate-700 text-sm leading-relaxed">{alert.message}</p>
                      </div>

                      {/* Reply thread */}
                      {alert.thread.length > 0 && (
                        <div className="space-y-2 mb-3">
                          {alert.thread.map((msg, i) => (
                            <div key={i} className={cn(
                              'px-3 py-2 rounded-xl text-xs',
                              msg.from === 'Admin'
                                ? 'bg-blue-50 border border-blue-100 text-blue-800 ml-6'
                                : 'bg-white border border-slate-200 text-slate-700 mr-6'
                            )}>
                              <span className="font-semibold">{msg.from}</span>
                              <span className="text-slate-400 ml-2">{msg.time}</span>
                              <p className="mt-0.5 leading-relaxed">{msg.text}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply input */}
                      {alert.status !== 'resolved' && (
                        <div className="flex gap-2 mb-3">
                          <input
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && sendReply(alert.id)}
                            placeholder="Type a reply to parent…"
                            className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm
                              focus:outline-none focus:ring-2 focus:ring-blue-300
                              text-slate-800 placeholder-slate-400"
                          />
                          <button
                            onClick={() => sendReply(alert.id)}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                              transition-colors flex items-center gap-1.5 text-sm font-medium"
                          >
                            <Send size={13} /> Reply
                          </button>
                        </div>
                      )}

                      {/* Action row */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setCallBus(buses.find(b => b.busId === alert.busId) ?? { busId: alert.busId, driverName: alert.parent })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200
                            rounded-lg text-slate-600 text-xs hover:bg-slate-50 transition-colors"
                        >
                          <Phone size={11} /> Call Parent
                        </button>
                        {!alert.escalated && alert.status !== 'resolved' && (
                          <button
                            onClick={() => escalateAlert(alert.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200
                              rounded-lg text-amber-700 text-xs hover:bg-amber-100 transition-colors"
                          >
                            <TrendingUp size={11} /> Escalate to Principal
                          </button>
                        )}
                        {alert.escalated && (
                          <span className="flex items-center gap-1 px-3 py-1.5 bg-amber-50 border border-amber-200
                            rounded-lg text-amber-600 text-xs">
                            <Flag size={11} /> Escalated
                          </span>
                        )}
                        {alert.status !== 'resolved' && (
                          <button
                            onClick={() => resolveAlert(alert.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200
                              rounded-lg text-green-700 text-xs hover:bg-green-100 transition-colors"
                          >
                            <CheckCircle size={11} /> Mark Resolved
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Live activity feed */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={15} className="text-blue-600" />
                <p className="text-slate-800 font-semibold">Live Activity Feed</p>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              </div>
              <span className="text-slate-400 text-xs">{activityFeed.length} events today</span>
            </div>
            <div className="max-h-80 overflow-y-auto scrollbar-hide divide-y divide-slate-50">
              {activityFeed.map((ev, i) => (
                <div key={i} className={cn(
                  'flex items-center gap-3 px-5 py-2.5 text-xs transition-colors',
                  ev.isNew ? 'bg-blue-50/40 border-l-2 border-blue-400' : 'hover:bg-slate-50'
                )}>
                  <span className="text-slate-400 w-12 flex-shrink-0 font-mono">{ev.time}</span>
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                    {FEED_ICON[ev.type] ?? <Activity size={11} />}
                  </div>
                  <span className={cn(
                    'w-28 flex-shrink-0 truncate font-mono text-xs',
                    ev.bus === 'ALL' ? 'text-purple-600' : 'text-slate-500'
                  )}>{ev.bus}</span>
                  <span className={cn(
                    'flex-1 truncate',
                    ev.sev === 'alert'   ? 'text-red-600 font-medium' :
                    ev.sev === 'warning' ? 'text-amber-600' : 'text-slate-600'
                  )}>{ev.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Bus control + broadcast ── */}
        <div className="flex flex-col gap-4">

          {/* Bus control */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <Radio size={14} className="text-blue-600" />
              <p className="text-slate-800 font-semibold text-sm">Bus Control</p>
            </div>
            <div className="divide-y divide-slate-100">
              {schoolBuses.slice(0, 3).map(bus => {
                const isEmergency = emergencies.has(bus.busId);
                const speed = bus.speed ?? 0;
                return (
                  <div key={bus.busId} className={cn('p-4 transition-colors', isEmergency && 'bg-red-50')}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-2 h-2 rounded-full flex-shrink-0',
                          isEmergency ? 'bg-red-500 animate-pulse' :
                          speed > 65  ? 'bg-amber-500 animate-pulse' : 'bg-green-500'
                        )} />
                        <p className="text-slate-800 font-semibold text-sm">{bus.busId}</p>
                      </div>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full border font-medium',
                        speed > 65 ? 'bg-red-50 border-red-200 text-red-600'
                                   : 'bg-green-50 border-green-200 text-green-600'
                      )}>{speed} km/h</span>
                    </div>
                    <p className="text-slate-400 text-xs mb-0.5 truncate">{bus.routeName}</p>
                    <p className="text-slate-500 text-xs mb-3">
                      Driver: <span className="font-medium">{bus.driverName?.split(' ')[0] ?? '—'}</span>
                    </p>

                    {isEmergency ? (
                      <div className="bg-red-100 border border-red-300 rounded-lg px-3 py-2
                        text-red-700 text-xs font-bold text-center animate-pulse">
                        🚨 EMERGENCY STOP ACTIVE
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          onClick={() => setCallBus(bus)}
                          className="w-full py-1.5 bg-green-50 border border-green-200
                            rounded-lg text-green-700 text-xs hover:bg-green-100
                            transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Phone size={11} /> Call Driver
                        </button>
                        <button
                          onClick={() => sendReroute(bus)}
                          className="w-full py-1.5 bg-blue-50 border border-blue-200
                            rounded-lg text-blue-700 text-xs hover:bg-blue-100
                            transition-colors flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw size={11} /> Send Reroute Request
                        </button>
                        <button
                          onClick={() => triggerEmergency(bus.busId)}
                          className="w-full py-1.5 bg-red-50 border border-red-200
                            rounded-lg text-red-600 text-xs hover:bg-red-100
                            transition-colors flex items-center justify-center gap-1.5"
                        >
                          <AlertOctagon size={11} /> Emergency Stop
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick broadcast */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Bell size={14} className="text-purple-600" />
              <p className="text-slate-800 font-semibold text-sm">Broadcast to Parents</p>
            </div>
            <textarea
              value={broadcastMsg}
              onChange={e => setBroadcastMsg(e.target.value)}
              rows={3}
              placeholder="Message all parents on all active routes…"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5
                text-slate-800 text-sm resize-none outline-none focus:border-blue-300
                placeholder-slate-400 mb-2"
            />
            <button
              onClick={handleBroadcast}
              disabled={!broadcastMsg.trim() || broadcastSent}
              className={cn(
                'w-full py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2',
                broadcastSent
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-purple-50 border border-purple-200 text-purple-700 hover:bg-purple-100 disabled:opacity-40'
              )}
            >
              {broadcastSent
                ? <><CheckCircle size={14} /> Sent to all parents</>
                : <><Bell size={14} /> Send to All Parents {total > 0 && `(${total})`}</>}
            </button>
          </div>

          {/* Legend */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium mb-2 uppercase tracking-wide">Alert Severity Guide</p>
            <div className="space-y-1.5">
              {[
                { sev: 'CRITICAL', desc: 'Child safety at immediate risk', color: 'bg-red-600 text-white' },
                { sev: 'HIGH',     desc: 'Safety concern reported',         color: 'bg-orange-100 text-orange-700 border border-orange-300' },
                { sev: 'MEDIUM',   desc: 'Service issue affecting parent',  color: 'bg-amber-50 text-amber-700 border border-amber-300' },
                { sev: 'LOW',      desc: 'Query or non-urgent report',      color: 'bg-slate-100 text-slate-500 border border-slate-200' },
              ].map(s => (
                <div key={s.sev} className="flex items-center gap-2">
                  <span className={cn('px-1.5 py-0.5 rounded text-xs font-bold flex-shrink-0', s.color)}>{s.sev}</span>
                  <span className="text-slate-500 text-xs">{s.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
