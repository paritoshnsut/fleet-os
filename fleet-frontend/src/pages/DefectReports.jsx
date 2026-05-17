import { useState } from 'react';
import {
  ClipboardList, CheckCircle, AlertTriangle, XCircle,
  Camera, ChevronDown, ChevronUp, Clock, User,
  Wrench, Bus, Shield, Play, Square, RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';

const PRE_TRIP_ITEMS = [
  { id: 'tyres',         label: 'Tyre Condition',           icon: '🛞', category: 'safety'    },
  { id: 'headlights',    label: 'Headlights & Indicators',  icon: '💡', category: 'safety'    },
  { id: 'brakes',        label: 'Brake Response',           icon: '🛑', category: 'safety'    },
  { id: 'horn',          label: 'Horn',                     icon: '📯', category: 'safety'    },
  { id: 'wipers',        label: 'Windshield & Wipers',      icon: '🪟', category: 'safety'    },
  { id: 'mirrors',       label: 'Mirrors (all)',            icon: '🪞', category: 'safety'    },
  { id: 'charging_port', label: 'Charging Port Condition',  icon: '⚡', category: 'ev'        },
  { id: 'doors',         label: 'Door Operation',           icon: '🚪', category: 'passenger' },
];

const POST_TRIP_ITEMS = [
  { id: 'body_damage',   label: 'Body Damage Check',        icon: '🚌', category: 'body'      },
  { id: 'interior',      label: 'Interior Cleanliness',     icon: '🧹', category: 'passenger' },
  { id: 'fluid_leaks',   label: 'Fluid Leaks Under Bus',    icon: '💧', category: 'mechanical'},
  { id: 'battery_temp',  label: 'Battery Temperature',      icon: '🌡️', category: 'ev'        },
  { id: 'seat_damage',   label: 'Seat Condition',           icon: '💺', category: 'passenger' },
  { id: 'emergency_kit', label: 'Emergency Kit Present',    icon: '🧰', category: 'safety'    },
];

const STATUS_OPTIONS = [
  { value: 'ok',        label: 'OK',              color: 'bg-green-50 border-green-200 text-green-600'   },
  { value: 'attention', label: 'Needs Attention', color: 'bg-amber-50 border-amber-200 text-amber-600'  },
  { value: 'critical',  label: 'Critical Issue',  color: 'bg-red-50 border-red-200 text-red-600'        },
];

const SEED_REPORTS = [
  {
    id: 'RPT-001', type: 'pre', busId: 'MH12-AB-1234', driverName: 'Ramesh Patil',
    submittedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), status: 'flagged',
    items: [
      { id: 'tyres',         status: 'attention', note: 'Front left tyre pressure slightly low' },
      { id: 'headlights',    status: 'ok',        note: '' },
      { id: 'brakes',        status: 'ok',        note: '' },
      { id: 'horn',          status: 'ok',        note: '' },
      { id: 'wipers',        status: 'ok',        note: '' },
      { id: 'mirrors',       status: 'ok',        note: '' },
      { id: 'charging_port', status: 'ok',        note: '' },
      { id: 'doors',         status: 'critical',  note: 'Rear door not closing fully — safety risk' },
    ],
    managerNote: 'Rear door issue — bus held for maintenance. Spare dispatched.', overrideBy: 'Depot Manager',
  },
  {
    id: 'RPT-002', type: 'post', busId: 'MH12-CD-5678', driverName: 'Suresh Jadhav',
    submittedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), status: 'clear',
    items: [
      { id: 'body_damage',   status: 'ok', note: '' },
      { id: 'interior',      status: 'ok', note: '' },
      { id: 'fluid_leaks',   status: 'ok', note: '' },
      { id: 'battery_temp',  status: 'ok', note: '' },
      { id: 'seat_damage',   status: 'ok', note: '' },
      { id: 'emergency_kit', status: 'ok', note: '' },
    ],
    managerNote: '', overrideBy: null,
  },
  {
    id: 'RPT-003', type: 'pre', busId: 'MH12-EF-9012', driverName: 'Anil Deshmukh',
    submittedAt: new Date(Date.now() - 30 * 60 * 1000), status: 'blocked',
    items: [
      { id: 'tyres',         status: 'ok',        note: '' },
      { id: 'headlights',    status: 'ok',        note: '' },
      { id: 'brakes',        status: 'critical',  note: 'Brake pedal feels spongy — possible fluid issue' },
      { id: 'horn',          status: 'ok',        note: '' },
      { id: 'wipers',        status: 'ok',        note: '' },
      { id: 'mirrors',       status: 'attention', note: 'Driver side mirror loose' },
      { id: 'charging_port', status: 'ok',        note: '' },
      { id: 'doors',         status: 'ok',        note: '' },
    ],
    managerNote: '', overrideBy: null,
  },
];

function timeAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function reportStatusConfig(status) {
  return {
    clear:   { label: 'All Clear',   color: 'bg-green-50 border-green-200 text-green-600',  icon: <CheckCircle  size={12} /> },
    flagged: { label: 'Flagged',     color: 'bg-amber-50 border-amber-200 text-amber-600',  icon: <AlertTriangle size={12} /> },
    blocked: { label: 'Trip Blocked',color: 'bg-red-50 border-red-200 text-red-600',        icon: <XCircle      size={12} /> },
  }[status] || {};
}

function ChecklistItem({ item, value, note, onStatusChange, onNoteChange, disabled }) {
  return (
    <div className={cn(
      'border rounded-xl p-4 transition-all',
      value === 'critical'  ? 'bg-red-50 border-red-200'    :
      value === 'attention' ? 'bg-amber-50 border-amber-200' :
      value === 'ok'        ? 'bg-green-50 border-green-200' :
                              'bg-slate-50 border-slate-200'
    )}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-xl">{item.icon}</span>
        <p className="text-slate-800 font-medium text-sm flex-1">{item.label}</p>
        {value === 'critical' && <AlertTriangle size={14} className="text-red-500 animate-pulse" />}
      </div>

      <div className="flex gap-1.5 mb-3">
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            disabled={disabled}
            onClick={() => onStatusChange(item.id, opt.value)}
            className={cn(
              'flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all',
              value === opt.value
                ? opt.color
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {(value === 'attention' || value === 'critical') && (
        <div className="flex gap-2">
          <input
            disabled={disabled}
            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2
              text-slate-900 text-xs outline-none focus:border-blue-400 placeholder-slate-400"
            placeholder="Describe the issue..."
            value={note}
            onChange={e => onNoteChange(item.id, e.target.value)}
          />
          <button className={cn(
            'px-2.5 py-2 rounded-lg border text-slate-400 hover:text-slate-600 transition-colors',
            'bg-slate-50 border-slate-200 text-xs',
            disabled && 'cursor-not-allowed'
          )}>
            <Camera size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function LiveChecklist({ buses, onSubmit }) {
  const [type,     setType]     = useState('pre');
  const [busId,    setBusId]    = useState('');
  const [items,    setItems]    = useState({});
  const [notes,    setNotes]    = useState({});
  const [step,     setStep]     = useState('form');
  const [blocker,  setBlocker]  = useState(null);
  const [override, setOverride] = useState(false);
  const [ovrNote,  setOvrNote]  = useState('');

  const checklistItems = type === 'pre' ? PRE_TRIP_ITEMS : POST_TRIP_ITEMS;
  const allAnswered    = checklistItems.every(i => items[i.id]);
  const hasCritical    = checklistItems.some(i => items[i.id] === 'critical');
  const hasAttention   = checklistItems.some(i => items[i.id] === 'attention');

  function handleStatusChange(id, val) { setItems(prev => ({ ...prev, [id]: val })); }
  function handleNoteChange(id, val)   { setNotes(prev => ({ ...prev, [id]: val })); }

  function handleSubmit() {
    if (!busId || !allAnswered) return;
    if (hasCritical && !override) {
      setBlocker(checklistItems.find(i => items[i.id] === 'critical'));
      setStep('blocked');
      return;
    }
    const report = {
      id:          `RPT-${Date.now()}`,
      type, busId,
      driverName:  'Current Driver',
      submittedAt: new Date(),
      status:      hasCritical ? (override ? 'flagged' : 'blocked') : hasAttention ? 'flagged' : 'clear',
      items:       checklistItems.map(i => ({ id: i.id, status: items[i.id] || 'ok', note: notes[i.id] || '' })),
      managerNote: override ? ovrNote : '',
      overrideBy:  override ? 'Depot Manager' : null,
    };
    onSubmit(report);
    setStep('submitted');
  }

  function handleReset() {
    setItems({}); setNotes({}); setStep('form');
    setBlocker(null); setOverride(false); setOvrNote(''); setBusId('');
  }

  if (step === 'blocked') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
        <div className="w-16 h-16 bg-red-100 border border-red-200 rounded-full
          flex items-center justify-center mx-auto mb-4">
          <XCircle size={32} className="text-red-500" />
        </div>
        <p className="text-red-700 font-bold text-xl mb-2">Trip Blocked</p>
        <p className="text-slate-600 text-sm mb-1">
          Critical issue detected: <span className="text-red-600 font-medium">{blocker?.label}</span>
        </p>
        <p className="text-slate-500 text-sm mb-6">
          Bus {busId} cannot depart until this is resolved. Manager override required.
        </p>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
          <p className="text-red-700 text-sm font-medium mb-1">{blocker?.label}</p>
          <p className="text-slate-500 text-xs">
            {notes[blocker?.id] || 'No additional notes provided'}
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-left">
          <p className="text-slate-600 text-sm font-medium mb-3 flex items-center gap-2">
            <Shield size={14} className="text-amber-500" />
            Manager Override
          </p>
          <p className="text-slate-500 text-xs mb-3">
            Override allows the trip to proceed despite the critical flag. Your name and reason
            are logged permanently against this report.
          </p>
          <textarea
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3
              text-slate-900 text-sm resize-none outline-none focus:border-amber-400
              placeholder-slate-400 mb-3"
            rows={3}
            placeholder="Reason for override (required)..."
            value={ovrNote}
            onChange={e => setOvrNote(e.target.value)}
          />
          <button
            onClick={() => { setOverride(true); handleSubmit(); }}
            disabled={!ovrNote.trim()}
            className={cn(
              'w-full py-2.5 rounded-xl border text-sm font-medium transition-all',
              ovrNote.trim()
                ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
            )}
          >
            Override & Allow Trip — Logged as {'"'}Depot Manager{'"'}
          </button>
        </div>

        <button onClick={handleReset}
          className="w-full py-2.5 bg-slate-50 border border-slate-200 rounded-xl
            text-slate-500 text-sm hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
          <RotateCcw size={14} /> Start New Checklist
        </button>
      </div>
    );
  }

  if (step === 'submitted') {
    return (
      <div className={cn(
        'border rounded-2xl p-6 text-center',
        hasCritical && override ? 'bg-amber-50 border-amber-200' :
        hasAttention             ? 'bg-amber-50 border-amber-200' :
                                   'bg-green-50 border-green-200'
      )}>
        <div className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border',
          hasCritical && override ? 'bg-amber-100 border-amber-200' :
          hasAttention             ? 'bg-amber-100 border-amber-200' :
                                     'bg-green-100 border-green-200'
        )}>
          <CheckCircle size={32} className={
            hasCritical && override ? 'text-amber-600' :
            hasAttention             ? 'text-amber-600' : 'text-green-600'
          } />
        </div>
        <p className="text-slate-800 font-bold text-xl mb-2">
          {hasCritical && override ? 'Submitted with Override'
           : hasAttention ? 'Submitted — Issues Flagged'
           : 'All Clear — Trip Approved'}
        </p>
        <p className="text-slate-500 text-sm mb-6">
          {type === 'pre' ? 'Pre-trip' : 'Post-trip'} check for {busId} recorded.
          {hasAttention && !hasCritical && ' Maintenance team notified of attention items.'}
          {hasCritical && override && ' Critical override logged against Depot Manager.'}
        </p>
        <button onClick={handleReset}
          className="w-full py-2.5 bg-slate-100 border border-slate-200 rounded-xl
            text-slate-600 text-sm hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
          <RotateCcw size={14} /> New Checklist
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-slate-500 text-xs mb-2">Checklist Type</p>
          <div className="flex gap-2">
            {[
              { value: 'pre',  label: '▶ Pre-Trip',  icon: Play   },
              { value: 'post', label: '■ Post-Trip', icon: Square },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => { setType(value); setItems({}); setNotes({}); }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all',
                  type === value
                    ? 'bg-blue-50 border-blue-300 text-blue-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                )}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-slate-500 text-xs mb-2">Select Bus</p>
          <select
            value={busId}
            onChange={e => setBusId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5
              text-slate-700 text-sm outline-none focus:border-blue-400 appearance-none cursor-pointer"
          >
            <option value="">Select bus...</option>
            {buses.map(b => (
              <option key={b.busId} value={b.busId}>{b.busId} — {b.routeNo}</option>
            ))}
          </select>
        </div>
      </div>

      {busId && (
        <div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-500">
              {Object.keys(items).length} of {checklistItems.length} completed
            </span>
            {hasCritical && (
              <span className="text-red-600 font-medium flex items-center gap-1">
                <AlertTriangle size={11} /> Critical issue detected
              </span>
            )}
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                hasCritical  ? 'bg-red-500' :
                hasAttention ? 'bg-amber-500' : 'bg-green-500'
              )}
              style={{ width: `${(Object.keys(items).length / checklistItems.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {busId ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {checklistItems.map(item => (
            <ChecklistItem
              key={item.id}
              item={item}
              value={items[item.id] || ''}
              note={notes[item.id] || ''}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
              disabled={false}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-slate-400 border border-slate-200 rounded-xl border-dashed">
          <Bus size={32} className="mx-auto mb-3 opacity-30" />
          <p>Select a bus to begin the checklist</p>
        </div>
      )}

      {busId && (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered}
          className={cn(
            'w-full py-3 rounded-xl border font-semibold text-sm transition-all flex items-center justify-center gap-2',
            allAnswered
              ? hasCritical
                ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                : hasAttention
                ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
              : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
          )}
        >
          <ClipboardList size={16} />
          {!allAnswered
            ? `Complete all ${checklistItems.length - Object.keys(items).length} remaining items`
            : hasCritical
            ? 'Submit — Critical Issue Will Block Trip'
            : hasAttention
            ? 'Submit — Flag Attention Items'
            : 'Submit — All Clear'
          }
        </button>
      )}
    </div>
  );
}

function ReportCard({ report, isExpanded, onToggle, onOverride }) {
  const [ovrNote, setOvrNote] = useState('');
  const cfg      = reportStatusConfig(report.status);
  const critical = report.items.filter(i => i.status === 'critical');
  const attention = report.items.filter(i => i.status === 'attention');

  return (
    <div className={cn(
      'bg-white border rounded-xl overflow-hidden transition-all shadow-sm',
      report.status === 'blocked' ? 'border-red-200'   :
      report.status === 'flagged' ? 'border-amber-200' :
                                    'border-slate-200'
    )}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left">
        <div className={cn(
          'px-2.5 py-1 rounded-lg border text-xs font-medium flex-shrink-0',
          report.type === 'pre'
            ? 'bg-blue-50 border-blue-200 text-blue-600'
            : 'bg-purple-50 border-purple-200 text-purple-600'
        )}>
          {report.type === 'pre' ? '▶ Pre' : '■ Post'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-slate-800 font-semibold text-sm">{report.busId}</p>
            <span className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs', cfg.color)}>
              {cfg.icon} {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 text-xs flex-wrap">
            <span className="flex items-center gap-1"><User size={10} />{report.driverName}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Clock size={10} />{timeAgo(report.submittedAt)}</span>
            {critical.length > 0  && <span className="text-red-600">{critical.length} critical</span>}
            {attention.length > 0 && <span className="text-amber-600">{attention.length} attention</span>}
          </div>
        </div>

        {isExpanded
          ? <ChevronUp   size={16} className="text-slate-400" />
          : <ChevronDown size={16} className="text-slate-400" />
        }
      </button>

      {isExpanded && (
        <div className="border-t border-slate-200 px-5 py-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
            {report.items.map(item => {
              const def = [...PRE_TRIP_ITEMS, ...POST_TRIP_ITEMS].find(i => i.id === item.id);
              return (
                <div key={item.id} className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs',
                  item.status === 'critical'  ? 'bg-red-50 border-red-200'    :
                  item.status === 'attention' ? 'bg-amber-50 border-amber-200' :
                                               'bg-green-50 border-green-200'
                )}>
                  <span>{def?.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 truncate">{def?.label}</p>
                    {item.note && <p className="text-slate-400 truncate mt-0.5">{item.note}</p>}
                  </div>
                  {item.status === 'critical'  && <XCircle      size={12} className="text-red-500 flex-shrink-0"   />}
                  {item.status === 'attention' && <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />}
                  {item.status === 'ok'        && <CheckCircle   size={12} className="text-green-500 flex-shrink-0" />}
                </div>
              );
            })}
          </div>

          {report.managerNote && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3">
              <p className="text-amber-700 text-xs font-medium mb-1 flex items-center gap-1">
                <Shield size={11} /> Manager Override — {report.overrideBy}
              </p>
              <p className="text-slate-600 text-xs">{report.managerNote}</p>
            </div>
          )}

          {report.status === 'blocked' && !report.overrideBy && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-slate-600 text-sm font-medium mb-3 flex items-center gap-2">
                <Shield size={14} className="text-amber-500" />
                Manager Override Required
              </p>
              <textarea
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5
                  text-slate-900 text-sm resize-none outline-none focus:border-amber-400
                  placeholder-slate-400 mb-2"
                rows={2}
                placeholder="Override reason (required)..."
                value={ovrNote}
                onChange={e => setOvrNote(e.target.value)}
              />
              <button
                onClick={() => ovrNote.trim() && onOverride(report.id, ovrNote)}
                disabled={!ovrNote.trim()}
                className={cn(
                  'w-full py-2 rounded-xl border text-sm font-medium transition-all',
                  ovrNote.trim()
                    ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                    : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                )}
              >
                Override & Allow — Logged against your account
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DefectReports({ buses }) {
  const [reports,    setReports]    = useState(SEED_REPORTS);
  const [expandedId, setExpandedId] = useState('RPT-003');
  const [view,       setView]       = useState('reports');

  function handleNewReport(report) {
    setReports(prev => [report, ...prev]);
    setTimeout(() => { setView('reports'); setExpandedId(report.id); }, 2000);
  }

  function handleOverride(reportId, note) {
    setReports(prev => prev.map(r =>
      r.id === reportId
        ? { ...r, status: 'flagged', managerNote: note, overrideBy: 'Depot Manager' }
        : r
    ));
  }

  const blocked = reports.filter(r => r.status === 'blocked').length;
  const flagged = reports.filter(r => r.status === 'flagged').length;
  const clear   = reports.filter(r => r.status === 'clear').length;

  return (
    <div className="flex flex-col gap-5">

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Trip Blocked',    value: blocked, color: 'text-red-600',   bg: blocked > 0 ? 'bg-red-50' : 'bg-white' },
          { label: 'Issues Flagged',  value: flagged, color: 'text-amber-600', bg: 'bg-white' },
          { label: 'All Clear Today', value: clear,   color: 'text-green-600', bg: 'bg-white' },
        ].map(s => (
          <div key={s.label} className={cn('border border-slate-200 rounded-xl px-4 py-3 shadow-sm', s.bg)}>
            <p className="text-slate-500 text-xs mb-1">{s.label}</p>
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {blocked > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200
          rounded-xl px-5 py-3">
          <XCircle size={18} className="text-red-500 flex-shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-red-700 font-semibold text-sm">
              {blocked} bus{blocked !== 1 ? 'es' : ''} blocked from departure
            </p>
            <p className="text-red-500 text-xs mt-0.5">
              Critical defect reported. Manager override required before trip can start.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {[
          { id: 'reports', label: '📋 All Reports'   },
          { id: 'new',     label: '+ New Checklist' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)}
            className={cn(
              'px-5 py-2.5 rounded-xl border text-sm font-medium transition-all',
              view === tab.id
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      {view === 'new' ? (
        <LiveChecklist buses={buses} onSubmit={handleNewReport} />
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map(report => (
            <ReportCard
              key={report.id}
              report={report}
              isExpanded={expandedId === report.id}
              onToggle={() => setExpandedId(p => p === report.id ? null : report.id)}
              onOverride={handleOverride}
            />
          ))}
        </div>
      )}
    </div>
  );
}
