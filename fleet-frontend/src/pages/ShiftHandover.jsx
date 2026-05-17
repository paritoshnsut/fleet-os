import { useState } from 'react';
import {
  ClipboardList, CheckCircle, AlertTriangle, Clock,
  User, ChevronDown, ChevronUp, Send, Eye,
  Bus, Activity, FileText, Users, Bell
} from 'lucide-react';
import { cn } from '../lib/utils';

const SEED_HANDOVERS = [
  {
    id:          'HO-001',
    outgoing:    'Rajesh Kumar',
    incoming:    'Sunil Mehta',
    shiftEnd:    new Date(Date.now() - 8 * 60 * 60 * 1000),
    acknowledgedAt: new Date(Date.now() - 7 * 60 * 60 * 1000),
    openIncidents: [
      { id: 'INC-1003', label: 'Route Deviation — MH12-EF-9012', status: 'in_progress' },
      { id: 'INC-1001', label: 'Overspeed — MH12-AB-1234',       status: 'acknowledged' },
    ],
    busesWithIssues: [
      { busId: 'MH12-EF-9012', note: 'Rear door sensor fault — maintenance scheduled for tomorrow AM' },
      { busId: 'MH12-GH-3456', note: 'AC unit running warm — monitor closely' },
    ],
    driverIncidents: [
      { driver: 'Vijay Shinde', note: 'Two harsh braking events near Shivajinagar — coached verbally' },
    ],
    pendingActions: 'Workshop needs confirmation on MH12-EF-9012 door repair ETA. STU compliance report due Friday — attach AIS data for 18th gap.',
    generalNotes:  'Overall quiet shift. EV charging completed for all 5 buses. Spare bus MH12-SP-001 fuelled and ready.',
  },
  {
    id:          'HO-002',
    outgoing:    'Sunil Mehta',
    incoming:    'Rajesh Kumar',
    shiftEnd:    new Date(Date.now() - 16 * 60 * 60 * 1000),
    acknowledgedAt: new Date(Date.now() - 15.5 * 60 * 60 * 1000),
    openIncidents: [],
    busesWithIssues: [
      { busId: 'MH12-AB-1234', note: 'Minor body scratch on left side — photographed and logged' },
    ],
    driverIncidents: [],
    pendingActions: 'Follow up on tyre replacement quote from vendor.',
    generalNotes:  'Clean shift. No major incidents.',
  },
];

function timeAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

const STATUS_COLORS = {
  new:          'bg-red-50 border-red-200 text-red-600',
  acknowledged: 'bg-amber-50 border-amber-200 text-amber-600',
  in_progress:  'bg-blue-50 border-blue-200 text-blue-600',
  resolved:     'bg-green-50 border-green-200 text-green-600',
};

function IncomingModal({ handover, onAcknowledge }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center
      justify-center z-[9999] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl
        max-h-[90vh] overflow-y-auto shadow-2xl">

        <div className="bg-blue-50 border-b border-blue-200 px-6 py-5">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-blue-100 border border-blue-200
              flex items-center justify-center">
              <ClipboardList size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-slate-800 font-bold text-lg">Shift Handover</p>
              <p className="text-blue-600 text-sm">
                From {handover.outgoing} · {formatTime(handover.shiftEnd)} · {formatDate(handover.shiftEnd)}
              </p>
            </div>
          </div>
          <p className="text-slate-500 text-xs mt-2">
            Review the handover before accessing the dashboard. Tap Acknowledge to confirm you have read it.
          </p>
        </div>

        <div className="p-6 space-y-5">

          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
              <Activity size={12} className="text-red-500" />
              Open Incidents ({handover.openIncidents.length})
            </p>
            {handover.openIncidents.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50
                border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle size={14} /> No open incidents
              </div>
            ) : (
              <div className="space-y-2">
                {handover.openIncidents.map(inc => (
                  <div key={inc.id} className="flex items-center justify-between
                    bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <div>
                      <p className="text-slate-800 text-sm font-medium">{inc.label}</p>
                      <p className="text-slate-400 text-xs mt-0.5">{inc.id}</p>
                    </div>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full border text-xs font-medium',
                      STATUS_COLORS[inc.status]
                    )}>
                      {inc.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
              <Bus size={12} className="text-orange-500" />
              Buses with Issues ({handover.busesWithIssues.length})
            </p>
            {handover.busesWithIssues.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50
                border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle size={14} /> All buses in good condition
              </div>
            ) : (
              <div className="space-y-2">
                {handover.busesWithIssues.map((b, i) => (
                  <div key={i} className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                    <p className="text-orange-700 font-medium text-sm">{b.busId}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{b.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
              <Users size={12} className="text-purple-500" />
              Driver Incidents ({handover.driverIncidents.length})
            </p>
            {handover.driverIncidents.length === 0 ? (
              <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50
                border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle size={14} /> No driver incidents this shift
              </div>
            ) : (
              <div className="space-y-2">
                {handover.driverIncidents.map((d, i) => (
                  <div key={i} className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
                    <p className="text-purple-700 font-medium text-sm">{d.driver}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{d.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {handover.pendingActions && (
            <div>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2 flex items-center gap-2">
                <AlertTriangle size={12} className="text-amber-500" />
                Pending Actions for This Shift
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-slate-700 text-sm leading-relaxed">{handover.pendingActions}</p>
              </div>
            </div>
          )}

          {handover.generalNotes && (
            <div>
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2 flex items-center gap-2">
                <FileText size={12} className="text-slate-400" />
                General Notes
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-slate-600 text-sm leading-relaxed">{handover.generalNotes}</p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-6 py-4">
          <button
            onClick={onAcknowledge}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl
              text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle size={16} />
            I have read and understood this handover — Acknowledge
          </button>
        </div>
      </div>
    </div>
  );
}

function HandoverCard({ handover, isExpanded, onToggle }) {
  return (
    <div className={cn(
      'bg-white border rounded-xl overflow-hidden transition-all shadow-sm',
      isExpanded ? 'border-blue-300' : 'border-slate-200 hover:border-slate-300'
    )}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left">

        <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200
          flex items-center justify-center text-slate-700 font-bold text-sm flex-shrink-0">
          {handover.outgoing.split(' ').map(n => n[0]).join('')}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-slate-800 font-semibold text-sm">{handover.outgoing}</p>
            <span className="text-slate-400 text-xs">→</span>
            <p className="text-slate-600 text-sm">{handover.incoming}</p>
            {handover.acknowledgedAt && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-50
                border border-green-200 rounded-full text-green-600 text-xs">
                <CheckCircle size={10} /> Acknowledged
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-slate-400 text-xs flex-wrap">
            <span className="flex items-center gap-1">
              <Clock size={10} /> {formatTime(handover.shiftEnd)} · {formatDate(handover.shiftEnd)}
            </span>
            <span>·</span>
            <span>{handover.openIncidents.length} open incidents</span>
            <span>·</span>
            <span>{handover.busesWithIssues.length} bus issues</span>
          </div>
        </div>

        {isExpanded
          ? <ChevronUp   size={16} className="text-slate-400 flex-shrink-0" />
          : <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
        }
      </button>

      {isExpanded && (
        <div className="border-t border-slate-200 px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">

          <div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
              Open Incidents
            </p>
            {handover.openIncidents.length === 0 ? (
              <p className="text-green-600 text-xs flex items-center gap-1">
                <CheckCircle size={11} /> None
              </p>
            ) : (
              <div className="space-y-1.5">
                {handover.openIncidents.map(inc => (
                  <div key={inc.id} className="flex items-center justify-between
                    bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <p className="text-slate-600 text-xs">{inc.label}</p>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-full border text-xs',
                      STATUS_COLORS[inc.status]
                    )}>
                      {inc.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                Bus Issues
              </p>
              {handover.busesWithIssues.length === 0 ? (
                <p className="text-green-600 text-xs flex items-center gap-1">
                  <CheckCircle size={11} /> None
                </p>
              ) : (
                <div className="space-y-1.5">
                  {handover.busesWithIssues.map((b, i) => (
                    <div key={i} className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                      <p className="text-orange-700 text-xs font-medium">{b.busId}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{b.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {handover.driverIncidents.length > 0 && (
              <div>
                <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                  Driver Incidents
                </p>
                {handover.driverIncidents.map((d, i) => (
                  <div key={i} className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                    <p className="text-purple-700 text-xs font-medium">{d.driver}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{d.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {handover.pendingActions && (
            <div className="md:col-span-2">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                Pending Actions
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-slate-700 text-sm">{handover.pendingActions}</p>
              </div>
            </div>
          )}

          {handover.generalNotes && (
            <div className="md:col-span-2">
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-2">
                General Notes
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-slate-600 text-sm">{handover.generalNotes}</p>
              </div>
            </div>
          )}

          {handover.acknowledgedAt && (
            <div className="md:col-span-2 flex items-center gap-2 text-green-600 text-xs">
              <CheckCircle size={11} />
              Acknowledged by {handover.incoming} at {formatTime(handover.acknowledgedAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewHandoverForm({ buses, alerts, onSubmit }) {
  const [openIncidents,   setOpenIncidents]   = useState([
    { id: 'INC-1003', label: 'Route Deviation — MH12-EF-9012', status: 'in_progress',  checked: true  },
    { id: 'INC-1001', label: 'Overspeed — MH12-AB-1234',       status: 'acknowledged', checked: true  },
    { id: 'INC-1005', label: 'Harsh Braking — MH12-CD-5678',   status: 'new',          checked: false },
  ]);
  const [busIssues,       setBusIssues]       = useState([]);
  const [busInput,        setBusInput]        = useState({ busId: '', note: '' });
  const [driverIncidents, setDriverIncidents] = useState([]);
  const [driverInput,     setDriverInput]     = useState({ driver: '', note: '' });
  const [pendingActions,  setPendingActions]  = useState('');
  const [generalNotes,    setGeneralNotes]    = useState('');
  const [incomingManager, setIncomingManager] = useState('');
  const [submitting,      setSubmitting]      = useState(false);

  function toggleIncident(id) {
    setOpenIncidents(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  }

  function addBusIssue() {
    if (!busInput.busId || !busInput.note.trim()) return;
    setBusIssues(prev => [...prev, { ...busInput }]);
    setBusInput({ busId: '', note: '' });
  }

  function addDriverIncident() {
    if (!driverInput.driver.trim() || !driverInput.note.trim()) return;
    setDriverIncidents(prev => [...prev, { ...driverInput }]);
    setDriverInput({ driver: '', note: '' });
  }

  function handleSubmit() {
    if (!incomingManager.trim()) return;
    setSubmitting(true);
    setTimeout(() => {
      const handover = {
        id:              `HO-${Date.now()}`,
        outgoing:        'Depot Manager',
        incoming:        incomingManager.trim(),
        shiftEnd:        new Date(),
        acknowledgedAt:  null,
        openIncidents:   openIncidents.filter(i => i.checked).map(i => ({
          id: i.id, label: i.label, status: i.status
        })),
        busesWithIssues: busIssues,
        driverIncidents: driverIncidents,
        pendingActions:  pendingActions.trim(),
        generalNotes:    generalNotes.trim(),
      };
      onSubmit(handover);
      setSubmitting(false);
    }, 1000);
  }

  const isReady = incomingManager.trim().length > 0;

  return (
    <div className="flex flex-col gap-5">

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
          <User size={12} className="text-blue-500" />
          Handover To
        </p>
        <input
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3
            text-slate-900 text-sm outline-none focus:border-blue-400 placeholder-slate-400"
          placeholder="Incoming manager name..."
          value={incomingManager}
          onChange={e => setIncomingManager(e.target.value)}
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
          <Activity size={12} className="text-red-500" />
          Open Incidents — Confirm for Handover
        </p>
        <p className="text-slate-400 text-xs mb-3">
          Auto-populated from Alert Center. Uncheck any that are not relevant to pass on.
        </p>
        <div className="space-y-2">
          {openIncidents.map(inc => (
            <div
              key={inc.id}
              onClick={() => toggleIncident(inc.id)}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all',
                inc.checked
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-slate-50 border-slate-200 opacity-50'
              )}
            >
              <div className={cn(
                'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all',
                inc.checked ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
              )}>
                {inc.checked && <CheckCircle size={10} className="text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-700 text-sm">{inc.label}</p>
                <p className="text-slate-400 text-xs">{inc.id}</p>
              </div>
              <span className={cn(
                'px-2 py-0.5 rounded-full border text-xs flex-shrink-0',
                STATUS_COLORS[inc.status]
              )}>
                {inc.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
          <Bus size={12} className="text-orange-500" />
          Buses with Issues
        </p>

        {busIssues.length > 0 && (
          <div className="space-y-2 mb-3">
            {busIssues.map((b, i) => (
              <div key={i} className="flex items-start justify-between bg-orange-50
                border border-orange-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-orange-700 text-sm font-medium">{b.busId}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{b.note}</p>
                </div>
                <button onClick={() => setBusIssues(prev => prev.filter((_, j) => j !== i))}
                  className="text-slate-300 hover:text-slate-500 ml-3 flex-shrink-0">×</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <select
            value={busInput.busId}
            onChange={e => setBusInput(prev => ({ ...prev, busId: e.target.value }))}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5
              text-slate-700 text-sm outline-none focus:border-blue-400 appearance-none w-40"
          >
            <option value="">Bus...</option>
            {buses.map(b => (
              <option key={b.busId} value={b.busId}>{b.busId}</option>
            ))}
          </select>
          <input
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5
              text-slate-900 text-sm outline-none focus:border-blue-400 placeholder-slate-400"
            placeholder="Describe the issue..."
            value={busInput.note}
            onChange={e => setBusInput(prev => ({ ...prev, note: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addBusIssue()}
          />
          <button onClick={addBusIssue}
            className="px-4 py-2.5 bg-orange-50 border border-orange-200
              rounded-xl text-orange-700 text-sm hover:bg-orange-100 transition-colors">
            Add
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
          <Users size={12} className="text-purple-500" />
          Driver Incidents This Shift
        </p>

        {driverIncidents.length > 0 && (
          <div className="space-y-2 mb-3">
            {driverIncidents.map((d, i) => (
              <div key={i} className="flex items-start justify-between bg-purple-50
                border border-purple-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-purple-700 text-sm font-medium">{d.driver}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{d.note}</p>
                </div>
                <button onClick={() => setDriverIncidents(prev => prev.filter((_, j) => j !== i))}
                  className="text-slate-300 hover:text-slate-500 ml-3 flex-shrink-0">×</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            className="w-36 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5
              text-slate-900 text-sm outline-none focus:border-blue-400 placeholder-slate-400"
            placeholder="Driver name..."
            value={driverInput.driver}
            onChange={e => setDriverInput(prev => ({ ...prev, driver: e.target.value }))}
          />
          <input
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5
              text-slate-900 text-sm outline-none focus:border-blue-400 placeholder-slate-400"
            placeholder="What happened..."
            value={driverInput.note}
            onChange={e => setDriverInput(prev => ({ ...prev, note: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && addDriverIncident()}
          />
          <button onClick={addDriverIncident}
            className="px-4 py-2.5 bg-purple-50 border border-purple-200
              rounded-xl text-purple-700 text-sm hover:bg-purple-100 transition-colors">
            Add
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
          <AlertTriangle size={12} className="text-amber-500" />
          Pending Actions for Next Shift
        </p>
        <textarea
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3
            text-slate-900 text-sm resize-none outline-none focus:border-amber-400
            placeholder-slate-400"
          rows={3}
          maxLength={500}
          placeholder="What does the incoming manager need to action? (max 500 chars)"
          value={pendingActions}
          onChange={e => setPendingActions(e.target.value)}
        />
        <p className="text-slate-400 text-xs text-right mt-1">{pendingActions.length}/500</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3 flex items-center gap-2">
          <FileText size={12} className="text-slate-400" />
          General Notes
        </p>
        <textarea
          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3
            text-slate-900 text-sm resize-none outline-none focus:border-blue-400
            placeholder-slate-400"
          rows={3}
          placeholder="Anything else the incoming manager should know..."
          value={generalNotes}
          onChange={e => setGeneralNotes(e.target.value)}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!isReady || submitting}
        className={cn(
          'w-full py-3.5 rounded-xl border font-bold text-sm transition-all',
          'flex items-center justify-center gap-2',
          isReady && !submitting
            ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-500'
            : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
        )}
      >
        {submitting
          ? <><Activity size={16} className="animate-spin" /> Submitting Handover...</>
          : <><Send size={16} /> Submit Shift Handover</>
        }
      </button>
    </div>
  );
}

export default function ShiftHandover({ buses, alerts }) {
  const [handovers,    setHandovers]    = useState(SEED_HANDOVERS);
  const [view,         setView]         = useState('history');
  const [expandedId,   setExpandedId]   = useState('HO-001');
  const [showIncoming, setShowIncoming] = useState(false);
  const [submitted,    setSubmitted]    = useState(false);

  function handleNewHandover(handover) {
    setHandovers(prev => [handover, ...prev]);
    setSubmitted(true);
    setView('history');
    setExpandedId(handover.id);
    setTimeout(() => setSubmitted(false), 4000);
  }

  const pending = handovers.filter(h => !h.acknowledgedAt).length;

  return (
    <>
      {showIncoming && (
        <IncomingModal
          handover={SEED_HANDOVERS[0]}
          onAcknowledge={() => {
            setHandovers(prev => prev.map(h =>
              h.id === 'HO-001' ? { ...h, acknowledgedAt: new Date() } : h
            ));
            setShowIncoming(false);
          }}
        />
      )}

      <div className="flex flex-col gap-5">

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Handovers', value: handovers.length,                    color: 'text-slate-800' },
            { label: 'Pending Ack',     value: pending,                             color: pending > 0 ? 'text-amber-600' : 'text-green-600' },
            { label: 'Last Handover',   value: timeAgo(handovers[0]?.shiftEnd),     color: 'text-blue-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
              <p className="text-slate-500 text-xs mb-1">{s.label}</p>
              <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {submitted && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200
            rounded-xl px-5 py-3">
            <CheckCircle size={16} className="text-green-500" />
            <p className="text-green-700 text-sm font-medium">
              Handover submitted. Incoming manager will see it on their next login.
            </p>
          </div>
        )}

        {!showIncoming && (
          <button
            onClick={() => setShowIncoming(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200
              rounded-xl text-blue-600 text-sm hover:bg-blue-100 transition-colors self-start"
          >
            <Eye size={14} /> Preview Incoming Handover Modal
          </button>
        )}

        <div className="flex gap-2">
          {[
            { id: 'history', label: '📋 Handover History'        },
            { id: 'new',     label: '+ End Shift / New Handover' },
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

        {view === 'history' ? (
          <div className="flex flex-col gap-3">
            {handovers.map(h => (
              <HandoverCard
                key={h.id}
                handover={h}
                isExpanded={expandedId === h.id}
                onToggle={() => setExpandedId(p => p === h.id ? null : h.id)}
              />
            ))}
          </div>
        ) : (
          <NewHandoverForm
            buses={buses}
            alerts={alerts}
            onSubmit={handleNewHandover}
          />
        )}
      </div>
    </>
  );
}
