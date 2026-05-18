import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Play, RotateCcw, Bus, Zap, TrendingDown,
  Clock, CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  FileSpreadsheet, IndianRupee, Plus, Trash2, Copy,
  Table, Upload,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { cn } from '../lib/utils';

const OPTIMIZER_URL = import.meta.env.VITE_OPTIMIZER_URL ?? 'http://localhost:8000';

const STEPS = ['upload', 'preview', 'results'];

const DEMO_ROWS = [
  { id: 1, routeName: 'Whitefield – Marathahalli',     tripType: 'pickup', outTime: '06:30', inTime: '07:45', km: '28', seats: '36' },
  { id: 2, routeName: 'Marathahalli – Whitefield',     tripType: 'drop',   outTime: '09:00', inTime: '10:15', km: '28', seats: '36' },
  { id: 3, routeName: 'Electronic City – Koramangala', tripType: 'pickup', outTime: '07:00', inTime: '08:30', km: '35', seats: '45' },
  { id: 4, routeName: 'Koramangala – Electronic City', tripType: 'drop',   outTime: '17:30', inTime: '19:00', km: '35', seats: '45' },
  { id: 5, routeName: 'Whitefield – Indiranagar',      tripType: 'pickup', outTime: '07:30', inTime: '08:45', km: '22', seats: '36' },
  { id: 6, routeName: 'Indiranagar – Whitefield',      tripType: 'drop',   outTime: '18:00', inTime: '19:15', km: '22', seats: '36' },
];

function timeToMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
}

function StepBar({ step }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {STEPS.map((s, i) => {
        const idx = STEPS.indexOf(step);
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
              done   ? 'bg-green-500 border-green-500 text-white'   :
              active ? 'bg-blue-600 border-blue-600 text-white'     :
                       'bg-white border-slate-200 text-slate-400'
            )}>
              {done ? <CheckCircle size={14} /> : i + 1}
            </div>
            <span className={cn('text-xs font-medium capitalize', active ? 'text-slate-800' : 'text-slate-400')}>
              {s === 'upload' ? 'Upload Excel' : s === 'preview' ? 'Preview Routes' : 'Optimization Results'}
            </span>
            {i < STEPS.length - 1 && <div className="w-12 h-px bg-slate-200 mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color = 'blue', highlight = false }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-600',
    green:  'bg-green-50 border-green-200 text-green-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
  };
  return (
    <div className={cn(
      'rounded-2xl border p-5',
      highlight ? colors[color] : 'bg-white border-slate-200 shadow-sm'
    )}>
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3',
        highlight ? `bg-${color}-100` : 'bg-slate-100'
      )}>
        <Icon size={18} className={highlight ? `text-${color}-600` : 'text-slate-500'} />
      </div>
      <p className={cn('text-2xl font-bold', highlight ? `text-${color}-700` : 'text-slate-800')}>{value}</p>
      <p className={cn('text-xs font-medium mt-0.5', highlight ? `text-${color}-600` : 'text-slate-500')}>{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function TripNetworkGraph({ buses }) {
  const [hovered, setHovered] = useState(null);

  // Build per-route trip counts and route→route transition counts
  const routeMap = new Map();
  const transMap = new Map();

  buses.forEach(bus => {
    bus.legs.forEach((leg, i) => {
      const key = leg.route_name.split(/[-–,]/)[0].trim().slice(0, 22);
      const cur = routeMap.get(key) ?? { pickup: 0, drop: 0 };
      leg.trip_type === 'pickup' ? cur.pickup++ : cur.drop++;
      routeMap.set(key, cur);
      if (i > 0) {
        const prev = bus.legs[i - 1].route_name.split(/[-–,]/)[0].trim().slice(0, 22);
        if (prev !== key) {
          const ck = [prev, key].sort().join('\0');
          transMap.set(ck, (transMap.get(ck) ?? 0) + 1);
        }
      }
    });
  });

  const topRoutes = [...routeMap.entries()]
    .sort((a, b) => (b[1].pickup + b[1].drop) - (a[1].pickup + a[1].drop))
    .slice(0, 18)
    .map(([name, c]) => ({ name, pickup: c.pickup, drop: c.drop, total: c.pickup + c.drop }));

  const topSet = new Set(topRoutes.map(r => r.name));
  const W = 680, H = 580, CX = W / 2, CY = H / 2, R = 210;

  const nodes = topRoutes.map((r, i) => {
    const angle = (i / topRoutes.length) * 2 * Math.PI - Math.PI / 2;
    return { ...r, x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle), angle };
  });
  const byName = Object.fromEntries(nodes.map(n => [n.name, n]));

  const edges = [...transMap.entries()]
    .filter(([k]) => { const [a, b] = k.split('\0'); return topSet.has(a) && topSet.has(b); })
    .map(([k, count]) => { const [a, b] = k.split('\0'); return { from: byName[a], to: byName[b], count }; })
    .filter(e => e.from && e.to)
    .sort((a, b) => b.count - a.count)
    .slice(0, 55);

  const maxTotal = nodes.length ? Math.max(...nodes.map(n => n.total)) : 1;
  const maxEdge  = edges.length ? Math.max(...edges.map(e => e.count)) : 1;
  const totalTrips = topRoutes.reduce((s, r) => s + r.total, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-slate-800 font-semibold">Route Network Graph</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Top 18 routes · arcs = buses chaining routes · node size = trip volume · hover to inspect
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
          {[['bg-blue-500','Pickup'],['bg-emerald-500','Drop'],['bg-violet-500','Mixed']].map(([bg, label]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${bg} inline-block`} />{label}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '460px' }}>
        <defs>
          <radialGradient id="netBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </radialGradient>
          <filter id="nodeGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur" />
            <feFlood floodColor="#6366f1" floodOpacity="0.3" result="color" />
            <feComposite in="color" in2="blur" operator="in" result="glow" />
            <feMerge><feMergeNode in="glow" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Background */}
        <rect width={W} height={H} fill="url(#netBg)" rx="12" />
        <circle cx={CX} cy={CY} r={R}        fill="none" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4 6" />
        <circle cx={CX} cy={CY} r={R * 0.55} fill="none" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2 5" />

        {/* Arcs between routes */}
        {edges.map((e, i) => {
          const isH = hovered === e.from.name || hovered === e.to.name;
          const mx  = (e.from.x + e.to.x) / 2;
          const my  = (e.from.y + e.to.y) / 2;
          const cpx = mx + (CX - mx) * 0.5;
          const cpy = my + (CY - my) * 0.5;
          const sw  = 0.5 + (e.count / maxEdge) * 2.5;
          return (
            <path key={i}
              d={`M ${e.from.x} ${e.from.y} Q ${cpx} ${cpy} ${e.to.x} ${e.to.y}`}
              fill="none"
              stroke={isH ? '#6366f1' : '#94a3b8'}
              strokeWidth={isH ? sw * 2 : sw}
              opacity={hovered ? (isH ? 0.75 : 0.04) : (0.12 + (e.count / maxEdge) * 0.3)}
            />
          );
        })}

        {/* Route nodes */}
        {nodes.map(n => {
          const isH   = hovered === n.name;
          const r     = 5 + (n.total / maxTotal) * 14;
          const typ   = n.pickup > n.drop ? 'pickup' : n.drop > n.pickup ? 'drop' : 'mixed';
          const fill  = typ === 'pickup' ? '#3b82f6' : typ === 'drop' ? '#10b981' : '#8b5cf6';
          const lx    = CX + (R + 30) * Math.cos(n.angle);
          const ly    = CY + (R + 30) * Math.sin(n.angle);
          const anchor = n.x > CX + 15 ? 'start' : n.x < CX - 15 ? 'end' : 'middle';
          const label = n.name.length > 16 ? n.name.slice(0, 15) + '…' : n.name;
          return (
            <g key={n.name} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(n.name)}
              onMouseLeave={() => setHovered(null)}
            >
              {isH && <circle cx={n.x} cy={n.y} r={r + 8} fill={fill} opacity={0.18} filter="url(#nodeGlow)" />}
              <circle cx={n.x} cy={n.y} r={r} fill={fill}
                opacity={hovered ? (isH ? 1 : 0.22) : 0.85}
                stroke="white" strokeWidth={isH ? 2.5 : 1.5} />
              {isH && (
                <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="9" fill="white" fontWeight="bold">
                  {n.total}
                </text>
              )}
              <text x={lx} y={ly + 4} textAnchor={anchor}
                fontSize={isH ? '10.5' : '9.5'}
                fill={hovered ? (isH ? '#1e293b' : '#cbd5e1') : '#64748b'}
                fontWeight={isH ? '600' : '400'}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* Center summary */}
        <text x={CX} y={CY - 12} textAnchor="middle" fontSize="26" fill="#cbd5e1" fontWeight="700">{buses.length}</text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="11" fill="#d1d5db">buses</text>
        <text x={CX} y={CY + 26} textAnchor="middle" fontSize="10" fill="#d1d5db">{totalTrips} trips</text>
      </svg>

      {hovered && byName[hovered] && (
        <div className="mt-2 px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs flex items-center gap-4">
          <span className="font-semibold text-slate-700">{byName[hovered].name}</span>
          <span className="text-blue-500 font-medium">{byName[hovered].pickup} pickup</span>
          <span className="text-emerald-500 font-medium">{byName[hovered].drop} drop</span>
          <span className="text-slate-400">{byName[hovered].total} trips total</span>
        </div>
      )}
    </div>
  );
}

function BusGantt({ buses }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? buses : buses.slice(0, 15);

  const timeToX = (min) => ((min - 480) / (1320 - 480)) * 100;
  const TRIP_COLORS = { pickup: '#3b82f6', drop: '#10b981', charge: '#f59e0b' };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-slate-800 font-semibold">Bus Schedule Gantt</h3>
          <p className="text-slate-400 text-xs mt-0.5">Each row = one bus · Blue = pickup · Green = drop · Amber = charging</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {[['pickup','#3b82f6'],['drop','#10b981'],['charging','#f59e0b']].map(([l,c]) => (
            <div key={l} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: c }} />
              <span className="text-slate-500 capitalize">{l}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Time axis — every hour, absolutely positioned to align with bars */}
      <div className="relative h-5 mb-1 ml-16 mr-14">
        {Array.from({ length: 15 }, (_, i) => {
          const hour = 8 + i;
          const x = timeToX(hour * 60);
          return (
            <span
              key={hour}
              className="absolute text-xs text-slate-400 -translate-x-1/2 select-none"
              style={{ left: `${x}%` }}
            >
              {String(hour).padStart(2, '0')}:00
            </span>
          );
        })}
      </div>

      <div className="space-y-1 overflow-y-auto" style={{ maxHeight: expanded ? '600px' : '340px' }}>
        {shown.map(bus => (
          <div key={bus.bus_id} className="flex items-center gap-2">
            <span className="text-xs text-slate-400 w-14 text-right flex-shrink-0">Bus {bus.bus_id}</span>
            <div className="relative flex-1 h-5 bg-slate-100 rounded overflow-hidden">

              {/* Hourly grid lines */}
              {Array.from({ length: 15 }, (_, i) => {
                const x = timeToX((8 + i) * 60);
                return (
                  <div key={i} className="absolute top-0 bottom-0 w-px bg-slate-200"
                    style={{ left: `${x}%` }} />
                );
              })}

              {bus.legs.map((leg, i) => {
                const x        = timeToX(leg.start_min);
                const clampedX = Math.max(0, x);
                const w        = timeToX(leg.end_min) - clampedX; // use clamped left so bar doesn't bleed right
                const cx = leg.charge_start ? timeToX(leg.charge_start) : null;
                const cw = leg.charge_start ? timeToX(leg.charge_end) - cx : 0;
                return (
                  <div key={i}>
                    <div
                      className="absolute h-full rounded-sm opacity-90"
                      style={{
                        left: `${clampedX}%`,
                        width: `${Math.max(0.5, w)}%`,
                        background: TRIP_COLORS[leg.trip_type] ?? '#94a3b8',
                      }}
                      title={`${leg.route_name} · ${leg.start_time}–${leg.end_time}`}
                    />
                    {cx !== null && (
                      <div
                        className="absolute h-full rounded-sm opacity-70"
                        style={{
                          left: `${Math.max(0, cx)}%`,
                          width: `${Math.max(0.3, cw)}%`,
                          background: TRIP_COLORS.charge,
                        }}
                        title={`Charging ${leg.charge_start_time}–${leg.charge_end_time}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <span className="text-xs text-slate-400 w-14 flex-shrink-0">{bus.run_km} km</span>
          </div>
        ))}
      </div>

      {buses.length > 15 && (
        <button
          onClick={() => setExpanded(p => !p)}
          className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-slate-400
            hover:text-slate-600 transition-colors py-1.5 border border-slate-200 rounded-lg"
        >
          {expanded ? <><ChevronUp size={13} /> Show fewer</> : <><ChevronDown size={13} /> Show all {buses.length} buses</>}
        </button>
      )}
    </div>
  );
}

function ComparisonTable({ comparison, summary, selectedAlgo }) {
  const { benchmark_buses } = comparison;
  const algo       = comparison[selectedAlgo];
  const savedBuses = benchmark_buses - algo.bus_count;
  const savedKm    = Math.round(Math.max(0, savedBuses) * 2.5 * 26);
  const savedInr   = Math.round(savedKm * 56.5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <MetricCard icon={Bus}          label="Buses needed"    value={algo.bus_count}
        sub={`vs ${benchmark_buses} manual — ${savedBuses >= 0 ? `saves ${savedBuses}` : `+${Math.abs(savedBuses)} extra`} bus${Math.abs(savedBuses) !== 1 ? 'es' : ''}`}
        color="blue" highlight={savedBuses > 0} />
      <MetricCard icon={TrendingDown} label="Run km per day"  value={`${algo.total_run_km.toLocaleString()} km`}
        sub={`${summary.total_trips} trips · ${summary.unique_routes} routes`}
        color="green" highlight />
      <MetricCard icon={IndianRupee}  label="Monthly savings" value={savedInr > 0 ? `₹${savedInr.toLocaleString()}` : '—'}
        sub={savedInr > 0 ? 'vs manual plan · dead-km reduction' : 'No savings vs benchmark'}
        color="orange" highlight={savedInr > 0} />
    </div>
  );
}

const LOAD_STEPS = [
  { id: 1, label: 'Uploading route data',      sub: 'Reading trips and seat classes from Excel' },
  { id: 2, label: 'Smart Greedy scheduler',    sub: 'First-fit chronological baseline pass'      },
  { id: 3, label: 'Pairing Heuristic',         sub: 'Matching AM pickups with PM drops'          },
  { id: 4, label: 'OR-Tools CP-SAT solver',    sub: 'Max bipartite matching · 30 s budget'       },
];

function OptimizerLoader({ tripCount, loadStep }) {
  const progress = Math.min(100, (loadStep / LOAD_STEPS.length) * 100);

  return (
    <div className="flex flex-col items-center py-16 px-4">
      {/* Pulsing bus icon */}
      <div className="relative mb-8">
        <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
          <Bus size={36} className="text-white" />
        </div>
        <div className="absolute inset-0 rounded-2xl bg-blue-400 animate-ping opacity-20" />
      </div>

      <h2 className="text-slate-800 font-bold text-xl mb-1">Optimizing fleet schedule</h2>
      <p className="text-slate-400 text-sm mb-8">
        {tripCount} trips · all three algorithms running in parallel
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-md mb-8">
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-300 mt-1">
          <span>0%</span><span>100%</span>
        </div>
      </div>

      {/* Step list */}
      <div className="w-full max-w-md space-y-2.5">
        {LOAD_STEPS.map(s => {
          const done   = loadStep > s.id;
          const active = loadStep === s.id;
          return (
            <div
              key={s.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-500',
                done   ? 'bg-green-50 border-green-200'        :
                active ? 'bg-blue-50 border-blue-200 shadow-sm' :
                         'bg-white border-slate-100 opacity-35'
              )}
            >
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {done
                  ? <CheckCircle size={18} className="text-green-500" />
                  : active
                    ? <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                    : <div className="w-4 h-4 rounded-full border-2 border-slate-200" />
                }
              </div>
              <div>
                <p className={cn(
                  'text-sm font-medium',
                  done ? 'text-green-700' : active ? 'text-blue-700' : 'text-slate-400'
                )}>
                  {s.label}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {loadStep >= LOAD_STEPS.length && (
        <p className="mt-6 text-green-600 text-sm font-medium animate-pulse">
          Building comparison report…
        </p>
      )}
    </div>
  );
}

function ChargingStrategyPanel({ strategyComparison, selectedStrategy, busCount }) {
  if (!strategyComparison) return null;
  const { full_charge: fc, opportunity: opp } = strategyComparison;

  const rows = [
    { label: 'Charge events / day',  fcVal: fc.charge_events,            oppVal: opp.charge_events,            fmt: v => v,                                     lowerIsBetter: true  },
    { label: 'Dead km / day',        fcVal: fc.dead_km_per_day,          oppVal: opp.dead_km_per_day,          fmt: v => `${v} km`,                             lowerIsBetter: true  },
    { label: 'Total charge time',    fcVal: fc.total_charge_min,         oppVal: opp.total_charge_min,         fmt: v => `${Math.round(v / 60)} hrs`,           lowerIsBetter: false },
    { label: 'Peak chargers needed', fcVal: fc.peak_chargers_needed,     oppVal: opp.peak_chargers_needed,     fmt: v => v,                                     lowerIsBetter: true  },
    { label: 'Monthly dead-km cost', fcVal: fc.monthly_dead_km_cost_inr, oppVal: opp.monthly_dead_km_cost_inr, fmt: v => `₹${v.toLocaleString('en-IN')}`,      lowerIsBetter: true  },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-slate-800 font-semibold">Charging Strategy Tradeoff</h3>
          <p className="text-slate-400 text-xs mt-0.5">Same {busCount}-bus fleet · different charging logistics</p>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className={cn(
            'px-2.5 py-1 rounded-lg font-medium transition-all',
            selectedStrategy === 'full' ? 'bg-blue-600 text-white' : 'text-slate-400 bg-slate-50 border border-slate-200'
          )}>Full Charge</span>
          <span className={cn(
            'px-2.5 py-1 rounded-lg font-medium transition-all',
            selectedStrategy === 'opportunity' ? 'bg-amber-500 text-white' : 'text-slate-400 bg-slate-50 border border-slate-200'
          )}>Opportunity</span>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-100">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide bg-slate-50">Metric</th>
              <th className={cn(
                'px-4 py-3 text-center text-xs font-medium uppercase tracking-wide',
                selectedStrategy === 'full' ? 'text-blue-600 bg-blue-50' : 'text-slate-400 bg-slate-50'
              )}>
                Full Charge{selectedStrategy === 'full' && ' ✓'}
              </th>
              <th className={cn(
                'px-4 py-3 text-center text-xs font-medium uppercase tracking-wide',
                selectedStrategy === 'opportunity' ? 'text-amber-600 bg-amber-50' : 'text-slate-400 bg-slate-50'
              )}>
                Opportunity{selectedStrategy === 'opportunity' && ' ✓'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => {
              const tie     = row.fcVal === row.oppVal;
              const fcWins  = !tie && (row.lowerIsBetter ? row.fcVal  < row.oppVal : row.fcVal  > row.oppVal);
              const oppWins = !tie && (row.lowerIsBetter ? row.oppVal < row.fcVal  : row.oppVal > row.fcVal);
              return (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-500 text-xs font-medium">{row.label}</td>
                  <td className={cn('px-4 py-3 text-center text-sm font-semibold', fcWins ? 'text-green-600' : 'text-slate-700')}>
                    {row.fmt(row.fcVal)}{fcWins && <span className="ml-1 text-green-500 text-xs">↓</span>}
                  </td>
                  <td className={cn('px-4 py-3 text-center text-sm font-semibold', oppWins ? 'text-green-600' : 'text-slate-700')}>
                    {row.fmt(row.oppVal)}{oppWins && <span className="ml-1 text-green-500 text-xs">↓</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-slate-300 text-xs mt-3">
        Dead km = 2 × 6 km depot round-trip per charge event · ₹56.5/km · 26 days/month
      </p>
    </div>
  );
}

function ManualInputTable({ rows, onChange }) {
  function updateRow(id, field, value) {
    onChange(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  }
  function addRow() {
    const newId = Math.max(0, ...rows.map(r => r.id)) + 1;
    onChange([...rows, { id: newId, routeName: '', tripType: 'pickup', outTime: '', inTime: '', km: '', seats: '36' }]);
  }
  function deleteRow(id) {
    if (rows.length === 1) return;
    onChange(rows.filter(r => r.id !== id));
  }
  function duplicateRow(id) {
    const row = rows.find(r => r.id === id);
    const newId = Math.max(0, ...rows.map(r => r.id)) + 1;
    const idx = rows.findIndex(r => r.id === id);
    const next = [...rows];
    next.splice(idx + 1, 0, { ...row, id: newId });
    onChange(next);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['#', 'Route Name', 'Trip Type', 'Out Time', 'In Time', 'KM', 'Seats', ''].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, i) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2 text-slate-400 text-xs w-8">{i + 1}</td>
                <td className="px-3 py-2 min-w-[220px]">
                  <input
                    value={row.routeName}
                    onChange={e => updateRow(row.id, 'routeName', e.target.value)}
                    placeholder="e.g. Whitefield – Koramangala"
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </td>
                <td className="px-3 py-2 w-28">
                  <select
                    value={row.tripType}
                    onChange={e => updateRow(row.id, 'tripType', e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                  >
                    <option value="pickup">Pickup</option>
                    <option value="drop">Drop</option>
                  </select>
                </td>
                <td className="px-3 py-2 w-28">
                  <input type="time" value={row.outTime}
                    onChange={e => updateRow(row.id, 'outTime', e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </td>
                <td className="px-3 py-2 w-28">
                  <input type="time" value={row.inTime}
                    onChange={e => updateRow(row.id, 'inTime', e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </td>
                <td className="px-3 py-2 w-20">
                  <input type="number" value={row.km} min="1" placeholder="25"
                    onChange={e => updateRow(row.id, 'km', e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </td>
                <td className="px-3 py-2 w-20">
                  <input type="number" value={row.seats} min="1" placeholder="36"
                    onChange={e => updateRow(row.id, 'seats', e.target.value)}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </td>
                <td className="px-3 py-2 w-16">
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => duplicateRow(row.id)} title="Duplicate row"
                      className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                      <Copy size={12} />
                    </button>
                    <button onClick={() => deleteRow(row.id)} title="Delete row"
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
        <button onClick={addRow}
          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors">
          <Plus size={13} /> Add row
        </button>
        <span className="text-xs text-slate-400">
          {rows.length} trip{rows.length !== 1 ? 's' : ''} · {new Set(rows.map(r => r.routeName).filter(Boolean)).size} routes
        </span>
      </div>
    </div>
  );
}

export default function TripPlanner() {
  const [step,       setStep]       = useState('upload');
  const [file,       setFile]       = useState(null);
  const [parseData,  setParseData]  = useState(null);
  const [results,    setResults]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [benchmark,  setBenchmark]  = useState(113);
  const [algorithm,  setAlgorithm]  = useState('greedy');
  const [busPage,    setBusPage]    = useState(0);
  const [loadStep,         setLoadStep]         = useState(0);
  const [chargingStrategy, setChargingStrategy] = useState('full');
  const [inputMode,  setInputMode]  = useState('excel');
  const [manualRows, setManualRows] = useState(DEMO_ROWS);
  const fileRef    = useRef();
  const timersRef  = useRef([]);

  const BUS_PAGE_SIZE = 20;

  async function handleUpload(f) {
    setFile(f);
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(`${OPTIMIZER_URL}/parse`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).detail ?? 'Parse failed');
      const data = await res.json();
      setParseData(data);
      setStep('preview');
    } catch (e) {
      setError(`Upload failed: ${e.message}. Is the optimizer server running on port 8000?`);
    }
    setLoading(false);
  }

  async function handleOptimize() {
    setError('');
    setLoading(true);
    setLoadStep(1);

    // Advance through steps on a timer while the real request runs
    const schedule = [
      setTimeout(() => setLoadStep(2), 1000),
      setTimeout(() => setLoadStep(3), 2800),
      setTimeout(() => setLoadStep(4), 5000),
    ];
    timersRef.current = schedule;

    try {
      const fd = new FormData();
      fd.append('file', inputMode === 'manual' ? createExcelFromRows(manualRows) : file);
      fd.append('benchmark_buses', benchmark);
      const res = await fetch(`${OPTIMIZER_URL}/optimize`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).detail ?? 'Optimization failed');
      const data = await res.json();

      // Clear pending timers, mark all steps done, brief pause to show completion
      schedule.forEach(clearTimeout);
      setLoadStep(5);
      await new Promise(r => setTimeout(r, 600));

      setResults(data);
      setStep('results');
    } catch (e) {
      schedule.forEach(clearTimeout);
      setError(`Optimization failed: ${e.message}`);
    }
    setLoadStep(0);
    setLoading(false);
  }

  function reset() {
    setStep('upload'); setFile(null); setParseData(null);
    setResults(null); setError(''); setLoading(false); setBusPage(0);
    setManualRows(DEMO_ROWS);
  }

  function createExcelFromRows(rows) {
    const valid = rows.filter(r => r.routeName && r.outTime && r.inTime && r.km);
    const ws = XLSX.utils.aoa_to_sheet([
      ['Sl No', 'Route Name', 'Trip Type', 'Out Time', 'In Time', 'KM Per Trip', 'Seats'],
      ...valid.map((r, i) => [i + 1, r.routeName, r.tripType, r.outTime, r.inTime, +r.km, +r.seats || 36]),
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Routes');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return new File([blob], 'manual_routes.xlsx', { type: blob.type });
  }

  function buildManualParseData(rows) {
    const valid = rows.filter(r => r.routeName && r.outTime && r.inTime && r.km);
    return {
      summary: {
        unique_routes:   new Set(valid.map(r => r.routeName)).size,
        total_trips:     valid.length,
        total_route_km:  valid.reduce((s, r) => s + (+r.km || 0), 0),
        pickup_trips:    valid.filter(r => r.tripType === 'pickup').length,
        drop_trips:      valid.filter(r => r.tripType === 'drop').length,
        seat_classes:    [...new Set(valid.map(r => +r.seats || 36))].sort((a, b) => a - b),
      },
      preview: valid.map((r, i) => ({
        trip_id:      i + 1,
        route_name:   r.routeName,
        trip_type:    r.tripType,
        start_time:   r.outTime,
        start_min:    timeToMin(r.outTime),
        distance_km:  +r.km,
        seats_needed: +r.seats || 36,
      })),
      errors: [],
    };
  }

  function handleManualPreview() {
    const valid = manualRows.filter(r => r.routeName && r.outTime && r.inTime && r.km);
    if (valid.length === 0) {
      setError('Fill in at least one complete row (Route Name, Out Time, In Time, KM) before previewing.');
      return;
    }
    setError('');
    setParseData(buildManualParseData(manualRows));
    setStep('preview');
  }

  function switchAlgorithm(id) {
    setAlgorithm(id);
    setBusPage(0);
  }

  // ── Leg count distribution for chart ────────────────────────────────────────
  function legDistChart(buses) {
    const dist = {};
    for (const b of buses) {
      const k = `${b.leg_count} leg${b.leg_count !== 1 ? 's' : ''}`;
      dist[k] = (dist[k] ?? 0) + 1;
    }
    return Object.entries(dist).map(([name, count]) => ({ name, count }));
  }

  return (
    <div className="flex flex-col gap-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-slate-800 font-bold text-xl">Trip Planner & Bid Optimizer</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Upload client route data → auto-schedule buses → minimize fleet size
          </p>
        </div>
        {step !== 'upload' && (
          <button onClick={reset}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200
              rounded-lg text-slate-500 hover:text-slate-700 text-sm shadow-sm transition-colors">
            <RotateCcw size={13} /> Start over
          </button>
        )}
      </div>

      <StepBar step={step} />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={15} className="flex-shrink-0" />
          {error}
        </div>
      )}

      {/* ── STEP 1: Upload / Manual entry ── */}
      {step === 'upload' && (
        <div className="flex flex-col gap-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit">
            <button
              onClick={() => setInputMode('excel')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                inputMode === 'excel' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Upload size={14} /> Upload Excel
            </button>
            <button
              onClick={() => setInputMode('manual')}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                inputMode === 'manual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Table size={14} /> Enter Manually
            </button>
          </div>

          {/* Excel drop zone */}
          {inputMode === 'excel' && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
              className={cn(
                'border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all',
                loading ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50'
              )}
            >
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]); }} />
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
                  <p className="text-blue-600 font-medium">Parsing route data…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center">
                    <FileSpreadsheet size={28} className="text-blue-500" />
                  </div>
                  <div>
                    <p className="text-slate-700 font-semibold">Drop your client Excel here</p>
                    <p className="text-slate-400 text-sm mt-1">or click to browse · .xlsx / .xls</p>
                  </div>
                  <p className="text-slate-300 text-xs">Expects Adibatala-format sheet: Route Name, KM, In/Out time, Trip Type</p>
                </div>
              )}
            </div>
          )}

          {/* Manual entry table */}
          {inputMode === 'manual' && (
            <div className="flex flex-col gap-4">
              {/* Field guide */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 flex flex-wrap gap-x-6 gap-y-1">
                <span><strong>Route Name</strong> — from–to location (e.g. "Whitefield – Koramangala")</span>
                <span><strong>Trip Type</strong> — Pickup = employees going to office · Drop = returning home</span>
                <span><strong>Out Time</strong> — when the bus leaves the depot</span>
                <span><strong>In Time</strong> — when the bus returns to the depot</span>
                <span><strong>KM</strong> — one-way route distance · <strong>Seats</strong> — bus capacity for this route</span>
              </div>

              <ManualInputTable rows={manualRows} onChange={setManualRows} />

              <button
                onClick={handleManualPreview}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700
                  text-white font-semibold py-3.5 rounded-xl transition-colors"
              >
                <CheckCircle size={16} /> Preview {manualRows.filter(r => r.routeName && r.outTime && r.inTime && r.km).length} routes → continue
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 2: Preview (or loader while optimizing) ── */}
      {step === 'preview' && parseData && loading && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <OptimizerLoader tripCount={parseData.summary.total_trips} loadStep={loadStep} />
        </div>
      )}

      {step === 'preview' && parseData && !loading && (
        <div className="flex flex-col gap-5">

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Routes', value: parseData.summary.unique_routes, icon: Bus, color: 'blue' },
              { label: 'Total trips', value: parseData.summary.total_trips, icon: Clock, color: 'purple' },
              { label: 'Total KM/day', value: `${parseData.summary.total_route_km.toLocaleString()} km`, icon: TrendingDown, color: 'green' },
              { label: 'Parse warnings', value: parseData.errors.length, icon: AlertTriangle, color: parseData.errors.length ? 'orange' : 'green' },
            ].map(m => <MetricCard key={m.label} {...m} />)}
          </div>

          {/* Trips breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-slate-700 font-semibold mb-3">Trip breakdown</p>
              <div className="space-y-2 text-sm">
                {[
                  ['Pickup trips', parseData.summary.pickup_trips, 'text-blue-600'],
                  ['Drop trips', parseData.summary.drop_trips, 'text-green-600'],
                  ['Seat classes', parseData.summary.seat_classes.join(', ') + ' seats', 'text-slate-800'],
                ].map(([l, v, c]) => (
                  <div key={l} className="flex justify-between">
                    <span className="text-slate-500">{l}</span>
                    <span className={cn('font-semibold', c)}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-slate-700 font-semibold mb-3">Configure benchmark</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Manual plan bus count (to compare against)</label>
                  <input type="number" value={benchmark} onChange={e => setBenchmark(+e.target.value)} min={1}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <p className="text-slate-400 text-xs">
                  Default: 113 (manager's TCS Adibatala plan). Change this for other clients.
                </p>
              </div>
            </div>
          </div>

          {/* Route preview table */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <p className="text-slate-700 font-semibold">Route preview <span className="text-slate-400 font-normal text-xs ml-1">(first 20)</span></p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                    {['Route', 'Type', 'Start', 'KM', 'Seats'].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parseData.preview.map(t => (
                    <tr key={t.trip_id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{t.route_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium border',
                          t.trip_type === 'pickup'
                            ? 'bg-blue-50 border-blue-200 text-blue-600'
                            : 'bg-green-50 border-green-200 text-green-600'
                        )}>
                          {t.trip_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{t.start_time ?? `${Math.floor(t.start_min/60)}:${String(t.start_min%60).padStart(2,'0')}`}</td>
                      <td className="px-4 py-2.5 text-slate-600">{t.distance_km} km</td>
                      <td className="px-4 py-2.5 text-slate-600">{t.seats_needed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Warnings */}
          {parseData.errors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-amber-700 font-medium text-sm mb-2 flex items-center gap-1.5">
                <AlertTriangle size={14} /> {parseData.errors.length} parse warning{parseData.errors.length !== 1 ? 's' : ''}
              </p>
              <ul className="space-y-1">
                {parseData.errors.slice(0, 5).map((e, i) => (
                  <li key={i} className="text-amber-600 text-xs">{e}</li>
                ))}
                {parseData.errors.length > 5 && (
                  <li className="text-amber-500 text-xs">…and {parseData.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {/* Algorithm selector */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-slate-700 font-semibold mb-1">Optimization algorithm</p>
            <p className="text-slate-400 text-xs mb-4">Choose how buses are scheduled. Both run in the backend — you can switch after results too.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  id: 'greedy',
                  label: 'Smart Greedy',
                  badge: 'Fast',
                  desc: 'Assigns each trip to the first available bus chronologically. Quick baseline that already beats manual planning.',
                  badgeColor: 'bg-blue-50 border-blue-200 text-blue-600',
                },
                {
                  id: 'pairing',
                  label: 'Pairing Heuristic',
                  badge: 'Mirrors manual',
                  desc: 'Pairs AM pickups with PM drops on the same route, then fills midday gaps. Closest to how your manager planned it.',
                  badgeColor: 'bg-purple-50 border-purple-200 text-purple-600',
                },
                {
                  id: 'ortools',
                  label: 'OR-Tools CP-SAT',
                  badge: 'Best result',
                  desc: "Google's constraint programming solver. Models time windows + battery as hard constraints. Finds near-optimal fleet size — same tech used by Google Maps and FedEx.",
                  badgeColor: 'bg-green-50 border-green-200 text-green-600',
                },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAlgorithm(opt.id)}
                  className={cn(
                    'text-left p-4 rounded-xl border-2 transition-all',
                    algorithm === opt.id
                      ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200 ring-offset-1'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', opt.badgeColor)}>
                      {opt.badge}
                    </span>
                    {algorithm === opt.id && <CheckCircle size={13} className="text-blue-500" />}
                  </div>
                  <p className={cn('font-semibold text-sm mb-1', algorithm === opt.id ? 'text-blue-700' : 'text-slate-700')}>
                    {opt.label}
                  </p>
                  <p className="text-slate-400 text-xs leading-snug">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Charging strategy */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-slate-700 font-semibold mb-1">Charging strategy</p>
            <p className="text-slate-400 text-xs mb-4">
              How buses recharge between trips. Results will show both strategies side-by-side so you can compare.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  id: 'full',
                  label: 'Full Charge',
                  badge: 'Single trip / bus',
                  desc: 'Bus returns to depot after last trip, charges to 100%. Predictable — one depot round-trip per bus per day.',
                  badgeColor: 'bg-blue-50 border-blue-200 text-blue-600',
                },
                {
                  id: 'opportunity',
                  label: 'Opportunity Charging',
                  badge: 'Multi-trip',
                  desc: 'Plug in during any idle gap ≥ 30 min. More depot trips but keeps SOC topped up between runs.',
                  badgeColor: 'bg-amber-50 border-amber-200 text-amber-600',
                },
              ].map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setChargingStrategy(s.id)}
                  className={cn(
                    'text-left p-4 rounded-xl border-2 transition-all',
                    chargingStrategy === s.id
                      ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200 ring-offset-1'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', s.badgeColor)}>
                      {s.badge}
                    </span>
                    {chargingStrategy === s.id && <CheckCircle size={13} className="text-blue-500" />}
                  </div>
                  <p className={cn('font-semibold text-sm mb-1', chargingStrategy === s.id ? 'text-blue-700' : 'text-slate-700')}>
                    {s.label}
                  </p>
                  <p className="text-slate-400 text-xs leading-snug">{s.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleOptimize}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700
              text-white font-semibold py-3.5 rounded-xl transition-colors disabled:opacity-60"
          >
            {loading
              ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Running optimizer…</>
              : <><Play size={16} /> Run {algorithm === 'greedy' ? 'Smart Greedy' : algorithm === 'pairing' ? 'Pairing Heuristic' : 'OR-Tools CP-SAT'} — {parseData.summary.total_trips} trips</>}
          </button>
        </div>
      )}

      {/* ── STEP 3: Results ── */}
      {step === 'results' && results && (
        <div className="flex flex-col gap-5">

          {/* Algorithm switcher */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm w-fit">
            {[
              { id: 'greedy',  label: 'Smart Greedy',      buses: results.comparison.greedy.bus_count },
              { id: 'pairing', label: 'Pairing Heuristic',  buses: results.comparison.pairing.bus_count },
              { id: 'ortools', label: 'OR-Tools CP-SAT',    buses: results.comparison.ortools.bus_count },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => switchAlgorithm(opt.id)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                  algorithm === opt.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                )}
              >
                {opt.label}
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full font-bold',
                  algorithm === opt.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                )}>
                  {opt.buses}
                </span>
              </button>
            ))}
          </div>

          <ComparisonTable comparison={results.comparison} summary={results.summary} selectedAlgo={algorithm} />

          <ChargingStrategyPanel
            strategyComparison={results[algorithm].strategy_comparison}
            selectedStrategy={chargingStrategy}
            busCount={results[algorithm].bus_count}
          />

          {/* Utilization chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-slate-700 font-semibold mb-4">Trips per bus distribution</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={legDistChart(results[algorithm].buses)} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                  <Bar dataKey="count" fill={algorithm === 'greedy' ? '#3b82f6' : '#8b5cf6'} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-slate-700 font-semibold mb-4">All algorithms vs benchmark</p>
              <div className="space-y-3">
                {[
                  { label: 'Manual (benchmark)', buses: results.comparison.benchmark_buses,    color: 'bg-slate-300',  active: false },
                  { label: 'Smart Greedy',       buses: results.comparison.greedy.bus_count,   color: 'bg-blue-500',   active: algorithm === 'greedy'  },
                  { label: 'Pairing Heuristic',  buses: results.comparison.pairing.bus_count,  color: 'bg-purple-400', active: algorithm === 'pairing' },
                  { label: 'OR-Tools CP-SAT',    buses: results.comparison.ortools.bus_count,  color: 'bg-green-500',  active: algorithm === 'ortools' },
                ].map(row => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className={cn('font-medium', row.active ? 'text-slate-800' : 'text-slate-500')}>
                        {row.label}{row.active && ' ✓'}
                      </span>
                      <span className={cn('font-bold', row.active ? 'text-slate-800' : 'text-slate-400')}>{row.buses} buses</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', row.color, !row.active && 'opacity-40')}
                        style={{ width: `${(row.buses / results.comparison.benchmark_buses) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-slate-400 text-xs mt-4">
                Utilization: {results.comparison[algorithm].utilization}% avg per bus
              </p>
            </div>
          </div>

          {/* Route network graph */}
          <TripNetworkGraph buses={results[algorithm].buses} />

          {/* Gantt */}
          <BusGantt buses={results[algorithm].buses} />

          {/* Bus list detail — paginated */}
          {(() => {
            const allBuses   = results[algorithm].buses;
            const totalPages = Math.ceil(allBuses.length / BUS_PAGE_SIZE);
            const pageBuses  = allBuses.slice(busPage * BUS_PAGE_SIZE, (busPage + 1) * BUS_PAGE_SIZE);
            const from       = busPage * BUS_PAGE_SIZE + 1;
            const to         = Math.min((busPage + 1) * BUS_PAGE_SIZE, allBuses.length);
            return (
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <p className="text-slate-700 font-semibold">
                    Bus schedule detail — {results[algorithm].bus_count} buses
                  </p>
                  <span className="text-slate-400 text-xs">
                    showing {from}–{to} of {allBuses.length}
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {pageBuses.map(bus => (
                    <div key={bus.bus_id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-700 font-medium text-sm">Bus #{bus.bus_id}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600">
                            {bus.seats} seats
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-600">
                            {bus.battery_type}
                          </span>
                        </div>
                        <span className="text-slate-500 text-xs">{bus.run_km} km · {bus.leg_count} trip{bus.leg_count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {bus.legs.map((leg, i) => (
                          <div key={i} className={cn(
                            'flex items-center gap-1 px-2 py-1 rounded-lg text-xs border',
                            leg.trip_type === 'pickup'
                              ? 'bg-blue-50 border-blue-200 text-blue-700'
                              : 'bg-green-50 border-green-200 text-green-700'
                          )}>
                            <span className="font-medium">{leg.start_time}</span>
                            <span className="text-blue-400/70">·</span>
                            <span className="max-w-[160px] truncate">{leg.route_name.split('-')[0]}</span>
                            <span className="opacity-60">({leg.distance_km}km)</span>
                            {leg.charge_start && <Zap size={9} className="text-amber-500 ml-0.5" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination controls */}
                {totalPages > 1 && (
                  <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
                    <button
                      onClick={() => setBusPage(p => Math.max(0, p - 1))}
                      disabled={busPage === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200
                        text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50
                        disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronDown size={12} className="rotate-90" /> Prev
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setBusPage(i)}
                          className={cn(
                            'w-7 h-7 rounded-lg text-xs font-medium transition-colors',
                            i === busPage
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                          )}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setBusPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={busPage === totalPages - 1}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200
                        text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50
                        disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Next <ChevronDown size={12} className="-rotate-90" />
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
}
