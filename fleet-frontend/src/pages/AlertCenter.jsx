import { useState } from 'react';
import { AlertTriangle, Activity, Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

/* ── helpers ──────────────────────────────────────────── */
const NEXT_STATUS = {
  new:          'acknowledged',
  acknowledged: 'in_progress',
  in_progress:  'resolved',
};

const SEV_ICON = {
  high:   <AlertTriangle size={13} className="text-red-500 flex-shrink-0"   />,
  medium: <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />,
  low:    <Activity      size={13} className="text-blue-400 flex-shrink-0"  />,
};

function timeAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}


/* ── Note modal (optional, shown before each transition) */
function NoteModal({ from, to, onConfirm, onCancel }) {
  const [note, setNote] = useState('');
  const labels = { new: 'New', acknowledged: 'Acknowledged', in_progress: 'In Progress', resolved: 'Resolved' };
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-slate-800 font-bold text-lg mb-1">Update Status</h3>
        <p className="text-slate-400 text-sm mb-4">
          <span className="text-slate-900 font-medium">{labels[from]}</span>
          {' → '}
          <span className="text-slate-900 font-medium">{labels[to]}</span>
        </p>
        <textarea
          autoFocus
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900
            text-sm resize-none outline-none focus:border-blue-400 placeholder-slate-400 mb-4"
          rows={3}
          placeholder={
            to === 'acknowledged' ? 'e.g. Contacted driver, monitoring…' :
            to === 'in_progress'  ? 'e.g. Dispatched support vehicle…'  :
                                    'e.g. Resolved — driver back on route.'
          }
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-sm hover:bg-slate-100">
            Cancel
          </button>
          <button onClick={() => onConfirm(note)}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold text-sm">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Single alert row ─────────────────────────────────── */
function AlertRow({ incident, onStatusChange }) {
  const [modal, setModal] = useState(false);
  const nextSt = NEXT_STATUS[incident.status];

  const routeLabel = incident.route_no
    ? (incident.route_no.toString().startsWith('Route') ? incident.route_no : `Route ${incident.route_no}`)
    : null;

  return (
    <>
      {modal && nextSt && (
        <NoteModal
          from={incident.status}
          to={nextSt}
          onConfirm={note => { setModal(false); onStatusChange(incident.id, nextSt, note); }}
          onCancel={() => setModal(false)}
        />
      )}
      <tr className="border-b border-slate-100 hover:bg-slate-50/60 transition-colors group">
        <td className="pl-5 pr-2 py-3 w-5">
          {SEV_ICON[incident.severity] ?? SEV_ICON.medium}
        </td>
        <td className="px-3 py-3 min-w-0">
          <p className="text-slate-800 text-sm font-medium leading-snug truncate max-w-xs">
            {incident.message}
          </p>
          <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-1.5">
            {incident.bus_id  && <span>{incident.bus_id}</span>}
            {incident.bus_id  && routeLabel && <span>·</span>}
            {routeLabel       && <span>{routeLabel}</span>}
            {incident.driver_name && <><span>·</span><span>{incident.driver_name}</span></>}
          </p>
        </td>
        <td className="px-3 py-3 text-right text-slate-400 text-xs whitespace-nowrap w-20">
          {timeAgo(incident.detected_at)}
        </td>
        <td className="px-3 py-3 text-right w-36">
          {nextSt ? (
            <button
              onClick={() => setModal(true)}
              className={cn(
                'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all',
                incident.status === 'new'
                  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  : incident.status === 'acknowledged'
                  ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                  : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
              )}
            >
              {incident.status === 'new'          ? 'Acknowledge'    :
               incident.status === 'acknowledged' ? '→ In Progress' : '→ Resolve'}
            </button>
          ) : (
            <span className="text-green-600 text-xs font-medium">✓ Resolved</span>
          )}
        </td>
        <td className="pr-4 py-3 w-8">
          {incident.severity === 'high' && (
            <span className="px-1.5 py-0.5 bg-red-50 border border-red-200 text-red-600 text-[10px] rounded-full font-medium whitespace-nowrap">
              High
            </span>
          )}
        </td>
      </tr>
    </>
  );
}

/* ── Section (Requires Action / In Progress / Resolved) ─ */
const PER_PAGE = 10;

function AlertSection({ title, dotColor, incidents, onStatusChange, defaultOpen = true }) {
  const [open,    setOpen]    = useState(defaultOpen);
  const [showing, setShowing] = useState(PER_PAGE);

  const visible = incidents.slice(0, showing);
  const hasMore = incidents.length > showing;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <button
        className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setOpen(p => !p)}
      >
        <span className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', dotColor)} />
        <span className="text-slate-800 font-semibold text-sm flex-1">{title}</span>
        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
          {incidents.length}
        </span>
        {open
          ? <ChevronUp   size={15} className="text-slate-400" />
          : <ChevronDown size={15} className="text-slate-400" />}
      </button>

      {open && (
        incidents.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">All clear</div>
        ) : (
          <>
            <table className="w-full">
              <tbody>
                {visible.map(inc => (
                  <AlertRow key={inc.id} incident={inc} onStatusChange={onStatusChange} />
                ))}
              </tbody>
            </table>
            {hasMore && (
              <button
                onClick={() => setShowing(p => p + PER_PAGE)}
                className="w-full py-2.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors border-t border-slate-100"
              >
                Show {Math.min(PER_PAGE, incidents.length - showing)} more ↓
              </button>
            )}
          </>
        )
      )}
    </div>
  );
}

/* ══ AlertCenter ═════════════════════════════════════════ */
export default function AlertCenter({ incidents = [], updateStatus, wsAccum = [] }) {
  const [localStatuses, setLocalStatuses] = useState({});

  // Supabase incidents take priority; app-level WS accumulator is the fallback
  const raw = incidents.length > 0 ? incidents : wsAccum;

  // Apply local-state overrides for WS-only rows
  const display = raw.map(i =>
    i._wsOnly ? { ...i, status: localStatuses[i.id] ?? i.status } : i
  );

  function handleStatusChange(id, newStatus, note) {
    const inc = display.find(i => i.id === id);
    if (!inc) return;
    if (inc._wsOnly) {
      setLocalStatuses(prev => ({ ...prev, [id]: newStatus }));
    } else {
      updateStatus(id, newStatus, note);
    }
  }

  const needsAction = display.filter(i => i.status === 'new');
  const inProgress  = display.filter(i => i.status === 'acknowledged' || i.status === 'in_progress');
  const resolved    = display.filter(i => i.status === 'resolved');

  return (
    <div className="flex flex-col gap-4">

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total',           value: display.length,      color: 'text-slate-800', bg: 'bg-white' },
          { label: 'Requires Action', value: needsAction.length,  color: 'text-red-600',   bg: needsAction.length > 0 ? 'bg-red-50' : 'bg-white' },
          { label: 'In Progress',     value: inProgress.length,   color: 'text-blue-600',  bg: 'bg-white' },
          { label: 'Resolved',        value: resolved.length,     color: 'text-green-600', bg: 'bg-white' },
        ].map(s => (
          <div key={s.label} className={cn(
            'border border-slate-200 rounded-xl px-4 py-3 shadow-sm', s.bg
          )}>
            <p className="text-slate-500 text-xs mb-1">{s.label}</p>
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Unresolved banner */}
      {needsAction.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3">
          <Bell size={15} className="text-red-500 flex-shrink-0 animate-pulse" />
          <p className="text-red-700 text-sm">
            <span className="font-bold">{needsAction.length} alert{needsAction.length !== 1 ? 's' : ''} need immediate attention.</span>
            {' '}Click <span className="font-semibold">Acknowledge</span> to confirm you have seen each one.
          </p>
        </div>
      )}

      {/* Three sections */}
      <AlertSection
        title="Requires Action"
        dotColor="bg-red-500"
        incidents={needsAction}
        onStatusChange={handleStatusChange}
        defaultOpen={true}
      />
      <AlertSection
        title="In Progress / Acknowledged"
        dotColor="bg-blue-500"
        incidents={inProgress}
        onStatusChange={handleStatusChange}
        defaultOpen={true}
      />
      <AlertSection
        title="Resolved"
        dotColor="bg-green-500"
        incidents={resolved}
        onStatusChange={handleStatusChange}
        defaultOpen={false}
      />
    </div>
  );
}
