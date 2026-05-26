import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import {
  SlidersHorizontal, Zap, Leaf, TrendingDown, Info, RotateCcw, X,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ── Default assumptions — all editable at runtime via the ⓘ modal ─────────────

const DEFAULT_A = {
  // Fuel prices
  dieselPrice:    92,       // ₹/L   — IOC pump, Mumbai/Pune
  cngPrice:       76,       // ₹/kg  — MGL retail
  evTariff:       4.5,      // ₹/kWh — MSEDCL ToU weighted avg overnight

  // Fuel efficiency
  dieselEff:      4.0,      // km/L  — CIRT Pune, 12m city bus
  cngEff:         3.5,      // km/kg — ICAT benchmark
  evKwh:          1.5,      // kWh/km — FAME II certified

  // Vehicle purchase (₹)
  purchaseDiesel: 3_500_000,  // ₹35 L
  purchaseCNG:    4_500_000,  // ₹45 L
  purchaseEV:    15_000_000,  // ₹1.5 Cr — Tata Starbus EV

  // EV economics
  fameRate:       40,         // % off EV price — MHI notification
  batteryReplace: 5_000_000,  // ₹50 L at year 6 — 300 kWh pack
  assetLife:      8,          // years

  // Maintenance ₹/bus/yr
  maintDiesel:    350_000,
  maintCNG:       280_000,
  maintEV:        120_000,

  // Insurance ₹/bus/yr
  insDiesel:      100_000,
  insCNG:         100_000,
  insEV:          110_000,

  // CO₂ emission factors
  co2Diesel:      0.850,  // kg CO₂/km — MoRTH / CPCB
  co2CNG:         0.650,  // kg CO₂/km — CPCB (24% below diesel)
  grid2025:       0.70,   // kg CO₂/kWh — CEA 2024
  grid2027:       0.58,   // kg CO₂/kWh — CEA projected
  grid2030:       0.40,   // kg CO₂/kWh — NITI Aayog 50% RE target
};

// ── Calculation engine ────────────────────────────────────────────────────────

function gridFactor(year, a) {
  return year === 2025 ? a.grid2025 : year === 2027 ? a.grid2027 : a.grid2030;
}

function annualFuelCost(type, kmPA, a) {
  if (type === 'diesel') return (kmPA / a.dieselEff) * a.dieselPrice;
  if (type === 'cng')    return (kmPA / a.cngEff)    * a.cngPrice;
  return kmPA * a.evKwh * a.evTariff;
}

function annualCapex(type, subsidy, a) {
  let price = type === 'diesel' ? a.purchaseDiesel
            : type === 'cng'    ? a.purchaseCNG
            :                    a.purchaseEV;
  if (type === 'ev' && subsidy === 'fame') price *= (1 - a.fameRate / 100);
  const depn = price / a.assetLife;
  return type === 'ev' ? depn + a.batteryReplace / a.assetLife : depn;
}

function tcoBreakdown(type, kmPA, subsidy, a) {
  const capex = annualCapex(type, subsidy, a);
  const fuel  = annualFuelCost(type, kmPA, a);
  const maint = type === 'diesel' ? a.maintDiesel : type === 'cng' ? a.maintCNG : a.maintEV;
  const ins   = type === 'diesel' ? a.insDiesel   : type === 'cng' ? a.insCNG   : a.insEV;
  return { capex, fuel, maint, ins, total: capex + fuel + maint + ins };
}

function busco2KgPA(type, kmPA, gridYear, a) {
  if (type === 'ev') return kmPA * a.evKwh * gridFactor(gridYear, a);
  return kmPA * (type === 'diesel' ? a.co2Diesel : a.co2CNG);
}

function computeScenario({ nDiesel, nCNG, nEV, kmPA, subsidy, gridYear, a }) {
  const total = nDiesel + nCNG + nEV;
  if (total === 0) return null;

  const tco = {
    diesel: tcoBreakdown('diesel', kmPA, subsidy, a),
    cng:    tcoBreakdown('cng',    kmPA, subsidy, a),
    ev:     tcoBreakdown('ev',     kmPA, subsidy, a),
  };

  const scenarioCost = nDiesel * tco.diesel.total + nCNG * tco.cng.total + nEV * tco.ev.total;
  const baselineCost = total   * tco.diesel.total;
  const savingsPA    = baselineCost - scenarioCost;

  const scenarioCO2 = (
    nDiesel * busco2KgPA('diesel', kmPA, gridYear, a) +
    nCNG    * busco2KgPA('cng',    kmPA, gridYear, a) +
    nEV     * busco2KgPA('ev',     kmPA, gridYear, a)
  ) / 1000; // kg → tonnes
  const baselineCO2 = total * busco2KgPA('diesel', kmPA, gridYear, a) / 1000;
  const co2Saved    = baselineCO2 - scenarioCO2;

  const cumulative = Array.from({ length: 9 }, (_, yr) => ({
    year:     `Y${yr}`,
    Baseline: +(yr * baselineCost / 1e7).toFixed(2),
    Scenario: +(yr * scenarioCost / 1e7).toFixed(2),
  }));

  // EV payback: extra upfront vs diesel ÷ annual opex saving
  const evNetPrice    = a.purchaseEV * (subsidy === 'fame' ? (1 - a.fameRate / 100) : 1);
  const evExtraCapex  = evNetPrice - a.purchaseDiesel;
  const evOpexSaving  = (tco.diesel.fuel + tco.diesel.maint + tco.diesel.ins)
                      - (tco.ev.fuel    + tco.ev.maint    + tco.ev.ins   );
  const breakevenYears = evOpexSaving > 0
    ? +(evExtraCapex / evOpexSaving).toFixed(1)
    : Infinity;

  // Grid CO₂ parity: when does EV CO₂/km < diesel CO₂/km?
  const parityGrid = a.co2Diesel / a.evKwh;
  let parityYear;
  if (gridFactor(2025, a) <= parityGrid)      parityYear = 2025;
  else if (gridFactor(2027, a) <= parityGrid) {
    const frac = (gridFactor(2025, a) - parityGrid) / (gridFactor(2025, a) - gridFactor(2027, a));
    parityYear = Math.round(2025 + frac * 2);
  } else {
    const frac = (gridFactor(2027, a) - parityGrid) / (gridFactor(2027, a) - gridFactor(2030, a));
    parityYear = Math.round(2027 + frac * 3);
  }

  return {
    tco, total, scenarioCost, baselineCost, savingsPA,
    scenarioCO2, baselineCO2, co2Saved,
    cumulative, breakevenYears, parityYear,
    chargersNeeded: Math.ceil(nEV / 3),
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────

const cr  = v => `₹${(v / 1e7).toFixed(2)} Cr`;
const L   = v => `₹${(v / 1e5).toFixed(1)}L`;
const fmt = v => Number(v).toLocaleString('en-IN');

// ── Chart tooltips ────────────────────────────────────────────────────────────

function TCOTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-bold text-slate-800 mb-2">{label} — {L(total * 1e5)}/yr</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-slate-500 flex-1">{p.name}</span>
          <span className="font-semibold text-slate-800">{L(p.value * 1e5)}</span>
        </div>
      ))}
    </div>
  );
}

function LineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs min-w-[150px]">
      <p className="font-bold text-slate-800 mb-2">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500 flex-1">{p.name}</span>
          <span className="font-semibold">₹{p.value} Cr</span>
        </div>
      ))}
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────

const STACK_COLORS = { capex: '#6366f1', fuel: '#f97316', maint: '#10b981', ins: '#94a3b8' };

const CO2_BARS = [
  { key: 'Diesel',  fill: '#64748b' },
  { key: 'CNG',     fill: '#94a3b8' },
  { key: 'EV 2025', fill: '#f97316' },
  { key: 'EV 2027', fill: '#f59e0b' },
  { key: 'EV 2030', fill: '#10b981' },
];

function TCOChart({ tco }) {
  const toL = v => +(v / 1e5).toFixed(1);
  const data = [
    { name: 'Diesel', capex: toL(tco.diesel.capex), fuel: toL(tco.diesel.fuel), maint: toL(tco.diesel.maint), ins: toL(tco.diesel.ins) },
    { name: 'CNG',    capex: toL(tco.cng.capex),    fuel: toL(tco.cng.fuel),    maint: toL(tco.cng.maint),    ins: toL(tco.cng.ins)    },
    { name: 'EV',     capex: toL(tco.ev.capex),      fuel: toL(tco.ev.fuel),     maint: toL(tco.ev.maint),     ins: toL(tco.ev.ins)     },
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={v => `₹${v}L`} tick={{ fontSize: 11 }} width={48} />
        <Tooltip content={<TCOTooltip />} />
        <Legend formatter={n => <span style={{ fontSize: 11 }}>{n}</span>} />
        <Bar dataKey="capex" stackId="a" fill={STACK_COLORS.capex} name="Capex" />
        <Bar dataKey="fuel"  stackId="a" fill={STACK_COLORS.fuel}  name="Fuel / Energy" />
        <Bar dataKey="maint" stackId="a" fill={STACK_COLORS.maint} name="Maintenance" />
        <Bar dataKey="ins"   stackId="a" fill={STACK_COLORS.ins}   name="Insurance" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CO2Chart({ kmPA, a }) {
  const chartData = [{
    'Diesel':  Math.round(kmPA * a.co2Diesel),
    'CNG':     Math.round(kmPA * a.co2CNG),
    'EV 2025': Math.round(kmPA * a.evKwh * a.grid2025),
    'EV 2027': Math.round(kmPA * a.evKwh * a.grid2027),
    'EV 2030': Math.round(kmPA * a.evKwh * a.grid2030),
  }];
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={chartData} margin={{ top: 4, right: 60, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis tick={false} height={4} />
        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}t`} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={(v, name) => [`${fmt(v)} kg CO₂`, name]} />
        <Legend formatter={n => <span style={{ fontSize: 11 }}>{n}</span>} />
        <ReferenceLine
          y={kmPA * a.co2Diesel} stroke="#ef4444" strokeDasharray="4 2"
          label={{ value: 'Diesel baseline', fill: '#ef4444', fontSize: 10, position: 'right' }}
        />
        {CO2_BARS.map(b => (
          <Bar key={b.key} dataKey={b.key} fill={b.fill} radius={[4, 4, 0, 0]} maxBarSize={48} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function CumulativeChart({ cumulative }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={cumulative} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={v => `₹${v}Cr`} tick={{ fontSize: 11 }} width={54} />
        <Tooltip content={<LineTooltip />} />
        <Legend formatter={n => <span style={{ fontSize: 11 }}>{n}</span>} />
        <Line type="monotone" dataKey="Baseline" stroke="#ef4444" strokeWidth={2} dot={false} strokeDasharray="5 3" />
        <Line type="monotone" dataKey="Scenario" stroke="#6366f1" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── UI primitives ─────────────────────────────────────────────────────────────

function KPI({ label, value, sub, highlight, danger, neutral }) {
  return (
    <div className={cn(
      'rounded-2xl border p-4',
      highlight ? 'bg-indigo-50 border-indigo-200' :
      danger    ? 'bg-red-50 border-red-200' :
      neutral   ? 'bg-slate-50 border-slate-200' :
                  'bg-green-50 border-green-200'
    )}>
      <p className={cn(
        'text-2xl font-bold leading-tight',
        highlight ? 'text-indigo-700' :
        danger    ? 'text-red-600' :
        neutral   ? 'text-slate-700' :
                    'text-green-700'
      )}>{value}</p>
      <p className="text-xs text-slate-500 mt-1 font-medium">{label}</p>
      {sub && <p className={cn(
        'text-xs mt-1',
        highlight ? 'text-indigo-400' :
        danger    ? 'text-red-400' :
        neutral   ? 'text-slate-400' :
                    'text-green-600'
      )}>{sub}</p>}
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, onChange, format, note }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-slate-600 font-medium">{label}</span>
        <span className="text-sm font-bold text-slate-900">{format ? format(value) : value}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-600"
        style={{ background: `linear-gradient(to right, #6366f1 ${((value - min) / (max - min)) * 100}%, #e2e8f0 0%)` }}
      />
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
      {note && <p className="text-xs text-slate-400 mt-1 italic">{note}</p>}
    </div>
  );
}

function SegmentedControl({ value, options, onChange }) {
  return (
    <div className="flex rounded-xl overflow-hidden border border-slate-200">
      {options.map(([val, label]) => (
        <button
          key={val}
          onClick={() => onChange(val)}
          className={cn(
            'flex-1 text-xs py-2 font-medium transition-colors',
            value === val ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function InsightCard({ icon: Icon, iconBg, iconColor, title, headline, headlineColor, body }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className={cn('w-7 h-7 rounded-xl flex items-center justify-center', iconBg)}>
          <Icon size={13} className={iconColor} />
        </div>
        <span className="text-xs font-semibold text-slate-700">{title}</span>
      </div>
      <p className={cn('text-2xl font-bold', headlineColor)}>{headline}</p>
      <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{body}</p>
    </div>
  );
}

// ── Methodology / Assumptions modal ──────────────────────────────────────────

function EditRow({ label, value, unit, source, step, min, onChange, changed }) {
  return (
    <div className={cn(
      'flex items-center py-2 border-b border-slate-50 gap-3',
      changed && 'bg-amber-50/60 -mx-2 px-2 rounded'
    )}>
      <span className="text-xs text-slate-600 flex-1">{label}</span>
      <input
        type="number"
        value={value}
        step={step ?? 1}
        min={min ?? 0}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
        className={cn(
          'w-20 text-xs text-right font-bold border rounded-lg px-2 py-1.5 focus:outline-none transition-colors',
          changed
            ? 'border-amber-400 text-amber-700 bg-amber-50 focus:border-amber-500'
            : 'border-slate-200 text-slate-800 bg-white focus:border-indigo-400'
        )}
      />
      <span className="text-xs text-slate-500 w-14 text-left whitespace-nowrap">{unit}</span>
      <span className="text-xs text-slate-400 w-36 text-right leading-tight">{source}</span>
    </div>
  );
}

function MSection({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3 pt-1">{title}</h3>
      {children}
    </div>
  );
}

function Formula({ children }) {
  return (
    <div className="bg-slate-900 text-green-300 rounded-lg px-4 py-3 font-mono text-xs leading-relaxed my-2 whitespace-pre">
      {children}
    </div>
  );
}

function MethodologyModal({ a, onChange, onReset, onClose }) {
  const set = key => val => onChange(key, val);
  const changed = key => a[key] !== DEFAULT_A[key];

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-800">Calculation Methodology</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Edit any assumption — all charts update live.
              <span className="ml-1 text-amber-500 font-medium">Amber = changed from default.</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors px-2 py-1.5 rounded-lg hover:bg-slate-50"
            >
              <RotateCcw size={11} /> Reset all
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-4">

          {/* ── Editable assumptions ── */}
          <MSection title="Fuel Prices">
            <EditRow label="Diesel price"        value={a.dieselPrice}  unit="₹ / L"    source="IOC pump, Mumbai/Pune" step={0.5} onChange={set('dieselPrice')}  changed={changed('dieselPrice')} />
            <EditRow label="CNG price"            value={a.cngPrice}     unit="₹ / kg"   source="MGL retail rate"       step={0.5} onChange={set('cngPrice')}     changed={changed('cngPrice')} />
            <EditRow label="EV overnight tariff"  value={a.evTariff}     unit="₹ / kWh"  source="MSEDCL ToU weighted"   step={0.1} onChange={set('evTariff')}     changed={changed('evTariff')} />
          </MSection>

          <MSection title="Fuel Efficiency">
            <EditRow label="Diesel efficiency"  value={a.dieselEff} unit="km / L"    source="CIRT Pune, 12m bus" step={0.1} onChange={set('dieselEff')} changed={changed('dieselEff')} />
            <EditRow label="CNG efficiency"     value={a.cngEff}    unit="km / kg"   source="ICAT benchmark"     step={0.1} onChange={set('cngEff')}    changed={changed('cngEff')} />
            <EditRow label="EV consumption"     value={a.evKwh}     unit="kWh / km"  source="FAME II certified"  step={0.05} onChange={set('evKwh')}   changed={changed('evKwh')} />
          </MSection>

          <MSection title="Vehicle Purchase Cost">
            <EditRow label="Diesel bus"  value={a.purchaseDiesel / 1e5}  unit="₹ Lakh"  source="Tata Motors CV list"       step={0.5} onChange={v => onChange('purchaseDiesel', v * 1e5)} changed={changed('purchaseDiesel')} />
            <EditRow label="CNG bus"     value={a.purchaseCNG    / 1e5}  unit="₹ Lakh"  source="Tata Motors CV list"       step={0.5} onChange={v => onChange('purchaseCNG',    v * 1e5)} changed={changed('purchaseCNG')} />
            <EditRow label="EV bus"      value={a.purchaseEV     / 1e5}  unit="₹ Lakh"  source="Tata Starbus EV ex-show"   step={5}   onChange={v => onChange('purchaseEV',     v * 1e5)} changed={changed('purchaseEV')} />
          </MSection>

          <MSection title="EV Economics">
            <EditRow label="FAME II subsidy"         value={a.fameRate}               unit="%"        source="MHI notification"         step={1}   min={0} onChange={set('fameRate')}       changed={changed('fameRate')} />
            <EditRow label="Battery replacement"     value={a.batteryReplace / 1e5}  unit="₹ Lakh"   source="300 kWh pack, at yr 6"    step={5}   onChange={v => onChange('batteryReplace', v * 1e5)} changed={changed('batteryReplace')} />
            <EditRow label="Asset life"              value={a.assetLife}              unit="years"     source="Standard fleet planning"  step={1}   min={1} onChange={set('assetLife')}       changed={changed('assetLife')} />
          </MSection>

          <MSection title="Maintenance (₹ Lakh / bus / year)">
            <EditRow label="Diesel maintenance" value={a.maintDiesel / 1e5} unit="₹ Lakh" source="UITP operator survey" step={0.1} onChange={v => onChange('maintDiesel', v * 1e5)} changed={changed('maintDiesel')} />
            <EditRow label="CNG maintenance"    value={a.maintCNG    / 1e5} unit="₹ Lakh" source="UITP operator survey" step={0.1} onChange={v => onChange('maintCNG',    v * 1e5)} changed={changed('maintCNG')} />
            <EditRow label="EV maintenance"     value={a.maintEV     / 1e5} unit="₹ Lakh" source="UITP / Tata Motors"   step={0.1} onChange={v => onChange('maintEV',     v * 1e5)} changed={changed('maintEV')} />
          </MSection>

          <MSection title="CO₂ Emission Factors (measured — change to test sensitivity)">
            <EditRow label="Diesel CO₂"          value={a.co2Diesel} unit="kg / km"    source="MoRTH / CPCB"          step={0.01} onChange={set('co2Diesel')} changed={changed('co2Diesel')} />
            <EditRow label="CNG CO₂"             value={a.co2CNG}    unit="kg / km"    source="CPCB (24% below diesel)" step={0.01} onChange={set('co2CNG')}    changed={changed('co2CNG')} />
            <EditRow label="Grid 2025"           value={a.grid2025}  unit="kg CO₂/kWh" source="CEA Annual Report 2024"  step={0.01} onChange={set('grid2025')}  changed={changed('grid2025')} />
            <EditRow label="Grid 2027 (proj.)"   value={a.grid2027}  unit="kg CO₂/kWh" source="CEA trajectory"          step={0.01} onChange={set('grid2027')}  changed={changed('grid2027')} />
            <EditRow label="Grid 2030 (proj.)"   value={a.grid2030}  unit="kg CO₂/kWh" source="NITI Aayog 50% RE target" step={0.01} onChange={set('grid2030')} changed={changed('grid2030')} />
          </MSection>

          {/* ── Formula reference ── */}
          <div className="border-t border-slate-100 pt-5 mt-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-4">How Each Output Is Calculated</h3>

            <p className="text-xs font-semibold text-slate-700 mb-1">Annual Fuel / Energy Cost</p>
            <Formula>
              {'Diesel  = (kmPA ÷ dieselEff) × dieselPrice\n'}
              {'CNG     = (kmPA ÷ cngEff)    × cngPrice\n'}
              {'EV      =  kmPA × evKwh      × evTariff'}
            </Formula>

            <p className="text-xs font-semibold text-slate-700 mt-4 mb-1">Annual Capex (straight-line depreciation)</p>
            <Formula>
              {'Diesel/CNG capex = purchasePrice ÷ assetLife\n'}
              {'EV capex         = (purchaseEV × (1 − fameRate%)) ÷ assetLife\n'}
              {'               + batteryReplace ÷ assetLife'}
            </Formula>

            <p className="text-xs font-semibold text-slate-700 mt-4 mb-1">Total TCO per Bus per Year</p>
            <Formula>
              {'TCO = Capex + Fuel/Energy + Maintenance + Insurance'}
            </Formula>

            <p className="text-xs font-semibold text-slate-700 mt-4 mb-1">CO₂ per Bus per Year</p>
            <Formula>
              {'Diesel CO₂ = kmPA × co2Diesel\n'}
              {'CNG CO₂    = kmPA × co2CNG\n'}
              {'EV CO₂     = kmPA × evKwh × gridFactor(year)\n\n'}
              {'Key: on 2025 grid (0.70), EV = kmPA × 1.5 × 0.70\n'}
              {'     which exceeds diesel at 2025 — EVs become cleaner ~2027'}
            </Formula>

            <p className="text-xs font-semibold text-slate-700 mt-4 mb-1">EV Payback Period</p>
            <Formula>
              {'extraCapex   = (purchaseEV × (1−fameRate%)) − purchaseDiesel\n'}
              {'opexSaving   = (diesel fuel+maint+ins) − (EV energy+maint+ins)\n'}
              {'paybackYears = extraCapex ÷ opexSaving'}
            </Formula>

            <p className="text-xs font-semibold text-slate-700 mt-4 mb-1">Grid CO₂ Parity Year</p>
            <Formula>
              {'Parity when: evKwh × gridFactor = co2Diesel\n'}
              {'  → gridFactor* = co2Diesel ÷ evKwh\n'}
              {'  → linear interpolate between CEA grid anchors'}
            </Formula>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const DEFAULT_SCENARIO = { total: 100, nEV: 0, nCNG: 0, kmPA: 60_000, subsidy: 'fame', gridYear: 2027 };

export default function ScenarioEngine() {
  const [total,    setTotal]    = useState(DEFAULT_SCENARIO.total);
  const [nEV,      setNEV]      = useState(DEFAULT_SCENARIO.nEV);
  const [nCNG,     setNCNG]     = useState(DEFAULT_SCENARIO.nCNG);
  const [kmPA,     setKmPA]     = useState(DEFAULT_SCENARIO.kmPA);
  const [subsidy,  setSubsidy]  = useState(DEFAULT_SCENARIO.subsidy);
  const [gridYear, setGridYear] = useState(DEFAULT_SCENARIO.gridYear);
  const [showInfo, setShowInfo] = useState(false);
  const [a, setA]               = useState(DEFAULT_A);

  function updateA(key, val) { setA(prev => ({ ...prev, [key]: val })); }
  function resetA() { setA(DEFAULT_A); }

  const safeEV  = Math.min(nEV,  total);
  const safeCNG = Math.min(nCNG, total - safeEV);
  const nDiesel = total - safeEV - safeCNG;

  const result = useMemo(() => computeScenario({
    nDiesel, nCNG: safeCNG, nEV: safeEV, kmPA, subsidy, gridYear, a,
  }), [nDiesel, safeCNG, safeEV, kmPA, subsidy, gridYear, a]);

  function resetScenario() {
    setTotal(DEFAULT_SCENARIO.total); setNEV(DEFAULT_SCENARIO.nEV); setNCNG(DEFAULT_SCENARIO.nCNG);
    setKmPA(DEFAULT_SCENARIO.kmPA); setSubsidy(DEFAULT_SCENARIO.subsidy); setGridYear(DEFAULT_SCENARIO.gridYear);
  }

  const savingsPct = result ? (result.savingsPA / result.baselineCost) * 100 : 0;
  const co2Pct     = result ? (result.co2Saved  / result.baselineCO2 ) * 100 : 0;
  const evOnGrid25Worse = safeEV > 0 && gridYear === 2025 &&
    a.evKwh * a.grid2025 > a.co2Diesel;

  // Show amber dot on ⓘ if any assumption has been edited
  const anyChanged = Object.keys(DEFAULT_A).some(k => a[k] !== DEFAULT_A[k]);

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">
      {showInfo && (
        <MethodologyModal
          a={a}
          onChange={updateA}
          onReset={resetA}
          onClose={() => setShowInfo(false)}
        />
      )}

      {/* ── Left: Controls ───────────────────────────────────────────────── */}
      <aside className="w-80 flex-shrink-0 bg-white border-r border-slate-100 overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-indigo-500" />
            <h2 className="font-bold text-slate-800 text-sm">Scenario Controls</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInfo(true)}
              className="relative w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 hover:bg-indigo-200 transition-colors"
              title="View methodology & edit assumptions"
            >
              <Info size={13} />
              {anyChanged && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-white" />
              )}
            </button>
            <button
              onClick={resetScenario}
              className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
        </div>

        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Fleet Size</p>
          <SliderRow
            label="Total buses" value={total} min={20} max={300}
            onChange={v => { setTotal(v); setNEV(Math.min(nEV, v)); setNCNG(Math.min(nCNG, v - Math.min(nEV, v))); }}
          />
        </section>

        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Fleet Mix</p>
          <SliderRow label="EV buses"  value={safeEV}  min={0} max={total}          onChange={v => setNEV(Math.min(v, total - safeCNG))} />
          <SliderRow label="CNG buses" value={safeCNG} min={0} max={total - safeEV} onChange={setNCNG} />
          <div className="flex items-center justify-between py-2.5 px-3 bg-slate-50 rounded-xl text-sm border border-slate-100">
            <span className="text-slate-500">Diesel (remainder)</span>
            <span className="font-bold text-slate-800">{nDiesel}</span>
          </div>
        </section>

        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Operations</p>
          <SliderRow
            label="Annual km per bus" value={kmPA} min={30_000} max={100_000} step={5_000}
            onChange={setKmPA} format={v => `${(v / 1000).toFixed(0)}k km`}
            note="200 km/day × 300 days = 60k km"
          />
        </section>

        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">EV Subsidy</p>
          <SegmentedControl value={subsidy} options={[['none', 'None'], ['fame', 'FAME II']]} onChange={setSubsidy} />
          {subsidy === 'fame'
            ? <p className="text-xs text-indigo-500 mt-2">{a.fameRate}% off EV price — MHI notification</p>
            : <p className="text-xs text-slate-400 mt-2">Full ₹{(a.purchaseEV / 1e5).toFixed(0)}L sticker price</p>
          }
        </section>

        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">India Grid Year (CO₂)</p>
          <SegmentedControl value={gridYear} options={[[2025, '2025'], [2027, '2027'], [2030, '2030']]} onChange={setGridYear} />
          <p className="text-xs text-slate-400 mt-2">
            {gridFactor(gridYear, a)} kg CO₂/kWh — CEA{gridYear > 2025 ? ' projected' : ''}
          </p>
        </section>

        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
          <p className="text-xs text-indigo-600 font-semibold mb-1 flex items-center gap-1">
            <Info size={10} /> Tip
          </p>
          <p className="text-xs text-indigo-500 leading-relaxed">
            Click <strong>ⓘ</strong> above to edit any assumption live — diesel price, vehicle cost, grid factor, and more.
          </p>
        </div>
      </aside>

      {/* ── Right: Results ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-6">
        {!result ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
            Configure your fleet on the left to see projections.
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-5">

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI
                highlight
                label="Total fleet cost / year"
                value={cr(result.scenarioCost)}
                sub={`${total} buses · ${(kmPA / 1000).toFixed(0)}k km/yr each`}
              />
              <KPI
                danger={result.savingsPA < 0} neutral={result.savingsPA === 0}
                label={result.savingsPA >= 0 ? 'Saved vs all-diesel' : 'Extra cost vs diesel'}
                value={cr(Math.abs(result.savingsPA))}
                sub={`${Math.abs(savingsPct).toFixed(1)}% ${result.savingsPA >= 0 ? 'cheaper' : 'more expensive'} / yr`}
              />
              <KPI
                neutral
                label="Fleet CO₂ / year"
                value={`${fmt(Math.round(result.scenarioCO2))}t`}
                sub={`${(result.scenarioCO2 / total).toFixed(1)} t per bus · grid ${gridYear}`}
              />
              <KPI
                danger={result.co2Saved < 0}
                label={result.co2Saved >= 0 ? 'CO₂ avoided vs diesel' : 'Extra CO₂ vs diesel'}
                value={`${fmt(Math.round(Math.abs(result.co2Saved)))}t`}
                sub={`${Math.abs(co2Pct).toFixed(1)}% ${result.co2Saved >= 0 ? 'less' : 'more'} than all-diesel`}
              />
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-0.5">Per-bus Annual TCO Breakdown</h3>
              <p className="text-xs text-slate-400 mb-4">
                Capex amortized over {a.assetLife} yrs ·{' '}
                {(kmPA / 1000).toFixed(0)}k km/yr ·{' '}
                {subsidy === 'fame' ? `FAME II ${a.fameRate}% subsidy on EV` : 'no subsidy'}
              </p>
              <TCOChart tco={result.tco} />
              <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                {(['diesel', 'cng', 'ev']).map(t => (
                  <div key={t} className="bg-slate-50 rounded-xl py-2.5 px-3 border border-slate-100">
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">{t === 'ev' ? 'EV' : t.toUpperCase()}</p>
                    <p className="font-bold text-slate-800">{L(result.tco[t].total)}/yr</p>
                    <p className="text-xs text-slate-500 mt-0.5">₹{(result.tco[t].total / kmPA).toFixed(1)}/km</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-0.5">CO₂ Emissions — Per Bus Per Year</h3>
              <p className="text-xs text-slate-400 mb-4">
                Red dashed line = diesel baseline. EV emissions shift left as India's grid cleans up.
              </p>
              <CO2Chart kmPA={kmPA} a={a} />
              {evOnGrid25Worse && (
                <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <Info size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    On the 2025 grid ({a.grid2025} kg CO₂/kWh), EV buses emit <strong>more</strong> CO₂ per km than diesel.
                    Grid parity is around <strong>{result.parityYear}</strong> — use the ⓘ modal to test sensitivity.
                  </p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-0.5">8-Year Cumulative Fleet Cost</h3>
              <p className="text-xs text-slate-400 mb-4">
                Red = all-diesel baseline · Indigo = your scenario · Gap = cumulative saving or extra cost
              </p>
              <CumulativeChart cumulative={result.cumulative} />
              {result.savingsPA > 0 && (
                <p className="text-xs text-green-600 mt-3 font-medium text-center">
                  Total 8-year saving vs all-diesel: {cr(result.savingsPA * 8)}
                </p>
              )}
              {result.savingsPA < 0 && (
                <p className="text-xs text-red-500 mt-3 font-medium text-center">
                  Scenario costs {cr(Math.abs(result.savingsPA * 8))} more over 8 years. Enable FAME II or raise diesel price to close the gap.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <InsightCard
                icon={TrendingDown} iconBg="bg-indigo-100" iconColor="text-indigo-600"
                title="EV Payback Period"
                headline={
                  result.breakevenYears === Infinity    ? 'No breakeven' :
                  result.breakevenYears <= 0            ? 'Instant'      :
                  `${result.breakevenYears} yrs`
                }
                headlineColor={
                  result.breakevenYears > a.assetLife ? 'text-red-600' :
                  result.breakevenYears <= 0          ? 'text-green-600' :
                  'text-indigo-700'
                }
                body={
                  result.breakevenYears > a.assetLife
                    ? `Exceeds ${a.assetLife}-yr bus life. Enable FAME II or edit EV purchase price in ⓘ to close the gap.`
                    : `Extra EV capex vs diesel recovered through fuel + maintenance savings. Battery replacement included.`
                }
              />
              <InsightCard
                icon={Leaf} iconBg="bg-green-100" iconColor="text-green-600"
                title="EV Grid CO₂ Parity"
                headline={`~${result.parityYear}`}
                headlineColor="text-green-700"
                body={`When India's grid reaches ${(a.co2Diesel / a.evKwh).toFixed(3)} kg CO₂/kWh, EV buses emit less CO₂/km than diesel. Today: ${a.grid2025} kg/kWh (CEA 2025).`}
              />
              <InsightCard
                icon={Zap} iconBg="bg-amber-100" iconColor="text-amber-600"
                title="Charging Infrastructure"
                headline={safeEV > 0 ? `${result.chargersNeeded} bays` : 'No EVs'}
                headlineColor={safeEV > 0 ? 'text-amber-700' : 'text-slate-400'}
                body={
                  safeEV > 0
                    ? `Estimated overnight charger bays for ${safeEV} EV buses (1 bay : 3 buses rule of thumb). Use Charging Planner for exact interval-graph scheduling.`
                    : 'Add EV buses using the slider to see charging infrastructure requirements.'
                }
              />
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
