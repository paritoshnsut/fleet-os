import { useState, useEffect } from 'react';
import {
  Activity, AlertTriangle, Award,
  ChevronUp, ChevronDown,
  Gauge, Navigation, Users, Clock,
  MessageSquare, Send, CheckCheck, Bell
} from 'lucide-react';
import { cn, getScoreBg, formatINR } from '../lib/utils';

function ScoreRing({ score }) {
  const radius        = 28;
  const circumference = 2 * Math.PI * radius;
  const filled        = (score / 100) * circumference;
  const color         = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={radius}
          fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle cx="32" cy="32" r={radius}
          fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold text-slate-800">{score}</span>
      </div>
    </div>
  );
}

function MiniBar({ value, max, color }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

function RankBadge({ rank }) {
  if (rank === 1) return (
    <div className="w-7 h-7 rounded-full bg-yellow-100 border border-yellow-300
      flex items-center justify-center text-yellow-600 text-xs font-bold">1</div>
  );
  if (rank === 2) return (
    <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300
      flex items-center justify-center text-slate-500 text-xs font-bold">2</div>
  );
  if (rank === 3) return (
    <div className="w-7 h-7 rounded-full bg-orange-100 border border-orange-300
      flex items-center justify-center text-orange-600 text-xs font-bold">3</div>
  );
  return (
    <div className="w-7 h-7 rounded-full bg-slate-50 border border-slate-200
      flex items-center justify-center text-slate-400 text-xs">{rank}</div>
  );
}

function CoachingNotes({ driver }) {
  const [notes,   setNotes]   = useState(() => {
    if (driver.score < 80) {
      return [{
        id:         1,
        manager:    'Rajesh Kumar',
        text:       driver.score < 60
          ? 'Multiple overspeed violations this week. Please review route speed limits and reduce aggressive acceleration. This is your second warning.'
          : 'Good improvement from last week. Focus on reducing harsh braking — try to anticipate stops earlier.',
        ts:         new Date(Date.now() - 2 * 60 * 60 * 1000),
        readAt:     driver.score < 60 ? null : new Date(Date.now() - 1 * 60 * 60 * 1000),
        superseded: false,
      }];
    }
    return [];
  });
  const [newNote, setNewNote] = useState('');
  const [sending, setSending] = useState(false);
  const [toast,   setToast]   = useState(null);
  const maxChars = 300;

  function timeAgo(date) {
    if (!date) return '—';
    const mins = Math.floor((Date.now() - new Date(date)) / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  }

  function sendNote() {
    if (!newNote.trim() || newNote.length > maxChars) return;
    setSending(true);
    setTimeout(() => {
      const note = {
        id:         Date.now(),
        manager:    'Depot Manager',
        text:       newNote.trim(),
        ts:         new Date(),
        readAt:     null,
        superseded: false,
      };
      setNotes(prev => [note, ...prev]);
      setNewNote('');
      setSending(false);
      setToast(`Note sent to ${driver.name}. They'll be notified in the driver app.`);
      setTimeout(() => setToast(null), 4000);
      setTimeout(() => {
        setNotes(prev => prev.map(n =>
          n.id === note.id ? { ...n, readAt: new Date() } : n
        ));
      }, 5000);
    }, 800);
  }

  function markSuperseded(id) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, superseded: true } : n));
  }

  const unread = notes.filter(n => !n.readAt && !n.superseded).length;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <p className="text-slate-500 text-xs font-medium mb-4 uppercase tracking-wide flex items-center gap-2">
        <MessageSquare size={12} className="text-purple-500" />
        Coaching Notes
        {unread > 0 && (
          <span className="px-1.5 py-0.5 bg-purple-50 border border-purple-200
            rounded-full text-purple-600 text-xs">
            {unread} unread
          </span>
        )}
      </p>

      {toast && (
        <div className="mb-3 flex items-center gap-2 bg-green-50 border border-green-200
          rounded-lg px-3 py-2 text-green-700 text-xs">
          <Bell size={12} /> {toast}
        </div>
      )}

      {notes.length > 0 && (
        <div className="space-y-3 mb-4 max-h-48 overflow-y-auto scrollbar-hide">
          {notes.map(note => (
            <div key={note.id} className={cn(
              'rounded-xl border p-3 transition-all',
              note.superseded
                ? 'bg-slate-50 border-slate-200 opacity-50'
                : 'bg-white border-slate-200'
            )}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 border border-blue-200
                    flex items-center justify-center text-blue-600 text-xs font-bold flex-shrink-0">
                    {note.manager.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-slate-700 text-xs font-medium">{note.manager}</p>
                    <p className="text-slate-400 text-xs">{timeAgo(note.ts)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <div className={cn(
                    'flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border',
                    note.readAt
                      ? 'bg-green-50 border-green-200 text-green-600'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  )}>
                    <CheckCheck size={10} />
                    {note.readAt ? `Read ${timeAgo(note.readAt)}` : 'Unread'}
                  </div>
                  {!note.superseded && (
                    <button onClick={() => markSuperseded(note.id)}
                      className="text-slate-300 hover:text-slate-500 transition-colors text-sm leading-none"
                      title="Mark as superseded">
                      ×
                    </button>
                  )}
                </div>
              </div>
              <p className={cn(
                'text-sm leading-relaxed',
                note.superseded ? 'text-slate-400 line-through' : 'text-slate-700'
              )}>
                {note.text}
              </p>
              {note.superseded && (
                <p className="text-slate-400 text-xs mt-1 italic">
                  Marked as superseded — original retained for record
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {notes.length === 0 && (
        <div className="text-center py-4 text-slate-400 text-xs mb-4">
          No coaching notes yet
        </div>
      )}

      <div className="relative">
        <textarea
          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3
            text-slate-900 text-sm resize-none outline-none focus:border-purple-400
            placeholder-slate-400 transition-colors"
          rows={3}
          maxLength={maxChars}
          placeholder={`What should ${driver.name.split(' ')[0]} focus on? (${maxChars} chars max)`}
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
        />
        <span className={cn(
          'absolute bottom-2 right-3 text-xs pointer-events-none',
          newNote.length > maxChars * 0.9 ? 'text-red-500' : 'text-slate-400'
        )}>
          {newNote.length}/{maxChars}
        </span>
      </div>
      <button
        onClick={sendNote}
        disabled={!newNote.trim() || sending || newNote.length > maxChars}
        className={cn(
          'w-full mt-2 py-2.5 rounded-xl border text-sm font-medium transition-all',
          'flex items-center justify-center gap-2',
          newNote.trim() && !sending && newNote.length <= maxChars
            ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
            : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
        )}
      >
        {sending
          ? <><Activity size={14} className="animate-spin" /> Sending...</>
          : <><Send size={14} /> Send Note to Driver</>
        }
      </button>
    </div>
  );
}

function DriverRow({ driver, rank, isExpanded, onToggle }) {
  const scoreColor = driver.score >= 80
    ? 'text-green-600' : driver.score >= 60
    ? 'text-amber-600' : 'text-red-600';

  return (
    <div className={cn(
      'bg-white border rounded-xl overflow-hidden transition-all duration-200 shadow-sm',
      isExpanded ? 'border-blue-300' : 'border-slate-200 hover:border-slate-300'
    )}>
      <button onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left">
        <RankBadge rank={rank} />
        <ScoreRing score={driver.score} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-slate-900 font-semibold text-sm">{driver.name}</p>
            <span className={cn('text-xs px-2 py-0.5 rounded-full border', getScoreBg(driver.score))}>
              {driver.score >= 80 ? 'Excellent' : driver.score >= 60 ? 'Good' : 'Needs Attention'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-slate-400 text-xs flex-wrap">
            <span>{driver.busId}</span>
            <span>·</span>
            <span>{driver.experience} yrs exp</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Navigation size={10} /> {driver.kmToday} km today
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6">
          {[
            { val: driver.harshBraking, label: 'Harsh Brake', warn: 5   },
            { val: driver.harshAccel,   label: 'Hard Accel',  warn: 5   },
            { val: driver.overspeed,    label: 'Overspeed',   warn: 3   },
            { val: driver.speed,        label: 'km/h now',    warn: 999 },
          ].map(({ val, label, warn }) => (
            <div key={label} className="text-center">
              <p className={cn('text-lg font-bold',
                val > warn ? 'text-red-600' : label === 'km/h now' ? 'text-blue-600' : 'text-slate-800'
              )}>
                {val}
              </p>
              <p className="text-slate-400 text-xs">{label}</p>
            </div>
          ))}
        </div>

        <div className="text-slate-400 ml-2">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-200 px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Score breakdown */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium mb-3 uppercase tracking-wide">
              Score Breakdown
            </p>
            <div className="space-y-3">
              {[
                { label: 'Base score',        value: 100,                     color: '#3b82f6', subtract: false },
                { label: 'Harsh braking',     value: driver.harshBraking * 3, color: '#ef4444', subtract: true  },
                { label: 'Hard acceleration', value: driver.harshAccel * 2,   color: '#f97316', subtract: true  },
                { label: 'Overspeed events',  value: driver.overspeed * 4,    color: '#f59e0b', subtract: true  },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-500">{item.label}</span>
                    <span className={item.subtract ? 'text-red-600' : 'text-slate-800'}>
                      {item.subtract ? `−${item.value}` : `+${item.value}`}
                    </span>
                  </div>
                  <MiniBar value={item.value} max={100} color={item.color} />
                </div>
              ))}
              <div className="border-t border-slate-200 pt-2 flex justify-between">
                <span className="text-slate-700 text-xs font-medium">Final Score</span>
                <span className={cn('text-sm font-bold', scoreColor)}>{driver.score}/100</span>
              </div>
            </div>
          </div>

          {/* Today's activity */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium mb-3 uppercase tracking-wide">
              Today's Activity
            </p>
            <div className="space-y-3">
              {[
                { icon: Navigation, label: 'Distance',       value: `${driver.kmToday} km`,                  color: 'text-blue-500'   },
                { icon: Clock,      label: 'Est. hours',     value: `${(driver.kmToday/28).toFixed(1)} hrs`, color: 'text-purple-500' },
                { icon: Users,      label: 'Avg passengers', value: '32 pax',                                color: 'text-cyan-500'   },
                { icon: Gauge,      label: 'Avg speed',      value: `${driver.speed} km/h`,                  color: 'text-green-500'  },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <Icon size={13} className={color} /> {label}
                  </div>
                  <span className="text-slate-800 text-xs font-medium">{value}</span>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
              <p className="text-slate-500 text-xs mb-1">Revenue contributed today</p>
              <p className="text-blue-700 text-lg font-bold">{formatINR(driver.kmToday * 56.5)}</p>
              <p className="text-slate-400 text-xs">@ ₹56.5/km GCC rate</p>
            </div>

            {driver.score < 80 && (
              <div className="space-y-1.5 mt-3">
                <p className="text-slate-500 text-xs font-medium">Coaching flags</p>
                {driver.harshBraking > 3 && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200
                    rounded-lg px-2.5 py-1.5 text-red-700 text-xs">
                    <AlertTriangle size={11} /> Reduce harsh braking events
                  </div>
                )}
                {driver.overspeed > 2 && (
                  <div className="flex items-center gap-2 bg-orange-50 border border-orange-200
                    rounded-lg px-2.5 py-1.5 text-orange-700 text-xs">
                    <AlertTriangle size={11} /> Multiple overspeed violations
                  </div>
                )}
                {driver.harshAccel > 3 && (
                  <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200
                    rounded-lg px-2.5 py-1.5 text-yellow-700 text-xs">
                    <AlertTriangle size={11} /> Smoother acceleration needed
                  </div>
                )}
              </div>
            )}
            {driver.score >= 80 && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200
                rounded-lg px-2.5 py-1.5 text-green-700 text-xs mt-3">
                <Award size={11} /> Excellent driving — no flags
              </div>
            )}
          </div>

          {/* Coaching notes */}
          <CoachingNotes driver={driver} />
        </div>
      )}
    </div>
  );
}

export default function FleetDrivers({ fetchDrivers }) {
  const [drivers,     setDrivers]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [expandedId,  setExpandedId]  = useState(null);
  const [sortBy,      setSortBy]      = useState('score');
  const [filterScore, setFilterScore] = useState('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchDrivers();
      setDrivers(data);
      setLoading(false);
    }
    load();
    const interval = setInterval(async () => {
      const data = await fetchDrivers();
      setDrivers(data);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchDrivers]);

  const sorted = [...drivers]
    .filter(d =>
      filterScore === 'all'     ? true :
      filterScore === 'good'    ? d.score >= 80 :
      filterScore === 'average' ? (d.score >= 60 && d.score < 80) :
                                  d.score < 60
    )
    .sort((a, b) =>
      sortBy === 'score' ? b.score        - a.score        :
      sortBy === 'km'    ? b.kmToday      - a.kmToday      :
      sortBy === 'speed' ? b.speed        - a.speed        :
                           b.harshBraking - a.harshBraking
    );

  const avg       = drivers.length ? Math.round(drivers.reduce((s, d) => s + d.score, 0) / drivers.length) : 0;
  const excellent = drivers.filter(d => d.score >= 80).length;
  const needsWork = drivers.filter(d => d.score < 60).length;
  const totalKm   = drivers.reduce((s, d) => s + d.kmToday, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Activity size={24} className="animate-pulse mr-3" /> Loading driver data...
    </div>
  );

  return (
    <div className="flex flex-col gap-5">

      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Fleet Avg Score',   value: avg,                        sub: 'out of 100',  color: avg >= 80 ? 'text-green-600' : avg >= 60 ? 'text-amber-600' : 'text-red-600' },
          { label: 'Excellent Drivers', value: excellent,                   sub: 'score ≥ 80',  color: 'text-green-600'  },
          { label: 'Needs Coaching',    value: needsWork,                   sub: 'score < 60',  color: needsWork > 0 ? 'text-red-600' : 'text-slate-800' },
          { label: 'Total KM Today',    value: `${totalKm.toFixed(0)} km`, sub: 'all drivers', color: 'text-blue-600'   },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-slate-500 text-xs mb-1">{s.label}</p>
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-slate-400 text-xs mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {[
            { id: 'score', label: 'By Score'     },
            { id: 'km',    label: 'By KM'        },
            { id: 'speed', label: 'By Speed'     },
            { id: 'harsh', label: 'By Incidents' },
          ].map(opt => (
            <button key={opt.id} onClick={() => setSortBy(opt.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                sortBy === opt.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'
              )}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {[
            { id: 'all',     label: 'All'     },
            { id: 'good',    label: '🟢 Good' },
            { id: 'average', label: '🟡 Avg'  },
            { id: 'poor',    label: '🔴 Poor' },
          ].map(opt => (
            <button key={opt.id} onClick={() => setFilterScore(opt.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filterScore === opt.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'
              )}>
              {opt.label}
            </button>
          ))}
        </div>

        <p className="text-slate-400 text-xs ml-auto">
          Showing {sorted.length} of {drivers.length} drivers · refreshes every 10s
        </p>
      </div>

      {/* Driver list */}
      <div className="flex flex-col gap-3">
        {sorted.map((driver, idx) => (
          <DriverRow
            key={driver.id}
            driver={driver}
            rank={idx + 1}
            isExpanded={expandedId === driver.id}
            onToggle={() => setExpandedId(p => p === driver.id ? null : driver.id)}
          />
        ))}
        {sorted.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Activity size={32} className="mx-auto mb-3 opacity-40" />
            <p>No drivers match this filter</p>
          </div>
        )}
      </div>

      {/* Leaderboard footer */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200
        rounded-xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-amber-700 font-semibold text-sm flex items-center gap-2">
            <Award size={16} /> Driver of the Week
          </p>
          <p className="text-slate-500 text-xs mt-0.5">
            {drivers[0]?.name} · Score {drivers[0]?.score}/100 · {drivers[0]?.kmToday} km this week
          </p>
        </div>
        <div className="text-right">
          <p className="text-amber-600 text-2xl font-bold">#1</p>
          <p className="text-slate-400 text-xs">Depot Rank</p>
        </div>
      </div>
    </div>
  );
}
