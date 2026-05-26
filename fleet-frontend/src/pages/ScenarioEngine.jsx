import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Legend, ReferenceLine, Cell,
} from 'recharts';
import {
  SlidersHorizontal, Zap, Leaf, TrendingDown, Info, RotateCcw,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ── Constants — all sourced from public Indian datasets ───────────────────────

const DIESEL_PRICE    = 92;     // ₹/L   — IOC pump price, Mumbai/Pune
const CNG_PRICE       = 76;     // ₹/kg  — MGL retail
const EV_TARIFF       = 4.5;    // ₹/kWh — weighted avg overnight tariff
const DIESEL_EFF      = 4.0;    // km/L  — 12m city bus, CIRT Pune
const CNG_EFF         = 3.5;    // km/kg — ICAT benchmark
const EV_KWH_PER_KM  = 1.5;    // kWh/km — FAME II certified
const ASSET_LIFE      = 8;      // years

const PURCHASE = { diesel: 3_500_000, cng: 4_500_000, ev: 15_000_000 }; // ₹
const BATTERY_REPLACE = 5_000_000; // ₹50L at year 6, amortized over asset life
const FAME_RATE       = 0.40;      // 40% off EV price — MHI notification

// ₹/bus/year — UITP / operator survey data
const MAINTENANCE = { diesel: 350_000, cng: 280_000, ev: 120_000 };
const INSURANCE   = { diesel: 100_000, cng: 100_000, ev: 110_000 };

// kg CO₂/km — MoRTH / CPCB
const CO2_PER_KM = { diesel: 0.850, cng: 0.650 };
// kg CO₂/kWh — CEA Annual Report (2027/2030 = projected)
const GRID_FACTOR = { 2025: 0.70, 2027: 0.58, 2030: 0.40 };

// ── Core calculations ─────────────────────────────────────────────────────────

function annualFuelCost(type, kmPA) {
  if (type === 'diesel') return (kmPA / DIESEL_EFF) * DIESEL_PRICE;
  if (type === 'cng')    return (kmPA / CNG_EFF)    * CNG_PRICE;
  return kmPA * EV_KWH_PER_KM * EV_TARIFF;
}

function annualCapex(type, subsidy) {
  let price = PURCHASE[type];
  if (type === 'ev' && subsidy === 'fame') price *= (1 - FAME_RATE);
  const depn = price / ASSET_LIFE;
  return type === 'ev' ? depn + BATTERY_REPLACE / ASSET_LIFE : depn;
}

function tcoBreakdown(type, kmPA, subsidy) {
  const capex = annualCapex(type, subsidy);
  const fuel  = annualFuelCost(type, kmPA);
  const maint = MAINTENANCE[type];
  const ins   = INSURANCE[type];
  return { capex, fuel, maint, ins, total: capex + fuel + maint + ins };
}

function busco2KgPA(type, kmPA, gridYear) {
  if (type === 'ev') return kmPA * EV_KWH_PER_KM * (GRID_FACTOR[gridYear] ?? 0.70);
  return kmPA * CO2_PER_KM[type];
}

function computeScenario({ nDiesel, nCNG, nEV, kmPA, subsidy, gridYear }) {
  const total = nDiesel + nCNG + nEV;
  if (total === 0) return null;

  const tco = {
    diesel: tcoBreakdown('diesel', kmPA, subsidy),
    cng:    tcoBreakdown('cng',    kmPA, subsidy),
    ev:     tcoBreakdown('ev',     kmPA, subsidy),
  };

  const scenarioCost = nDiesel * tco.diesel.total + nCNG * tco.cng.total + nEV * tco.ev.total;
  const baselineCost = total   * tco.diesel.total;
  const savingsPA    = baselineCost - scenarioCost;

  // CO₂ in tonnes
  const scenarioCO2 = (
    nDiesel * busco2KgPA('diesel', kmPA, gridYear) +
    nCNG    * busco2KgPA('cng',    kmPA, gridYear) +
    nEV     * busco2KgPA('ev',     kmPA, gridYear)
  ) / 1000;
  const baselineCO2 = total * busco2KgPA('diesel', kmPA, gridYear) / 1000;
  const co2Saved    = baselineCO2 - scenarioCO2;

  // 8-year cumulative in ₹Cr
  const cumulative = Array.from({ length: 9 }, (_, yr) => ({
    year:     `Y${yr}`,
    Baseline: +(yr * baselineCost / 1e7).toFixed(2),
    Scenario: +(yr * scenarioCost / 1e7).toFixed(2),
  }));

  // EV payback: extra upfront (vs diesel) ÷ annual opex saving
  const evPurchaseNet = PURCHASE.ev * (subsidy === 'fame' ? (1 - FAME_RATE) : 1);
  const evExtraCapex  = evPurchaseNet - PURCHASE.diesel;
  const evOpexSavingPA = (tco.diesel.fuel + tco.diesel.maint + tco.diesel.ins)
                       - (tco.ev.fuel    + tco.ev.maint    + tco.ev.ins   );
  const breakevenYears = evOpexSavingPA > 0
    ? +(evExtraCapex / evOpexSavingPA).toFixed(1)
    : Infinity;

  // Grid CO₂ parity year: when does 1.5 kWh/km × gridFactor < 0.850 kg/km?
  // i.e. gridFactor < 0.850 / 1.5 = 0.567
  const PARITY_GRID = CO2_PER_KM.diesel / EV_KWH_PER_KM; // 0.567
  let parityYear;
  if (GRID_FACTOR[2025] <= PARITY_GRID) {
    parityYear = 2025;
  } else if (GRID_FACTOR[2027] <= PARITY_GRID) {
    const frac = (GRID_FACTOR[2025] - PARITY_GRID) / (GRID_FACTOR[2025] - GRID_FACTOR[2027]);
    parityYear = Math.round(2025 + frac * 2);
  } else {
    const frac = (GRID_FACTOR[2027] - PARITY_GRID) / (GRID_FACTOR[2027] - GRID_FACTOR[2030]);
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

// ── Chart tooltip components ──────────────────────────────────────────────────

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

// ── Chart components ──────────────────────────────────────────────────────────

const STACK_COLORS = { capex: '#6366f1', fuel: '#f97316', maint: '#10b981', ins: '#94a3b8' };

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

const CO2_COLORS = ['#64748b', '#94a3b8', '#f97316', '#f59e0b', '#10b981'];

function CO2Chart({ kmPA }) {
  const data = [
    { name: 'Diesel',  co2: Math.round(kmPA * CO2_PER_KM.diesel) },
    { name: 'CNG',     co2: Math.round(kmPA * CO2_PER_KM.cng)    },
    { name: 'EV 2025', co2: Math.round(kmPA * EV_KWH_PER_KM * GRID_FACTOR[2025]) },
    { name: 'EV 2027', co2: Math.round(kmPA * EV_KWH_PER_KM * GRID_FACTOR[2027]) },
    { name: 'EV 2030', co2: Math.round(kmPA * EV_KWH_PER_KM * GRID_FACTOR[2030]) },
  ];
  const dieselVal = kmPA * CO2_PER_KM.diesel;
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={data} margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}t`} tick={{ fontSize: 11 }} width={40} />
        <Tooltip formatter={v => [`${fmt(v)} kg`, 'CO₂ / bus / year']} />
        <ReferenceLine
          y={dieselVal} stroke="#ef4444" strokeDasharray="4 2"
          label={{ value: 'Diesel baseline', fill: '#ef4444', fontSize: 10, position: 'right' }}
        />
        <Bar dataKey="co2" name="CO₂" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={CO2_COLORS[i]} />)}
        </Bar>
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

// ── Page ──────────────────────────────────────────────────────────────────────

const DEFAULT = { total: 100, nEV: 0, nCNG: 0, kmPA: 60_000, subsidy: 'fame', gridYear: 2027 };

export default function ScenarioEngine() {
  const [total,    setTotal]    = useState(DEFAULT.total);
  const [nEV,      setNEV]      = useState(DEFAULT.nEV);
  const [nCNG,     setNCNG]     = useState(DEFAULT.nCNG);
  const [kmPA,     setKmPA]     = useState(DEFAULT.kmPA);
  const [subsidy,  setSubsidy]  = useState(DEFAULT.subsidy);
  const [gridYear, setGridYear] = useState(DEFAULT.gridYear);

  // Clamp so EV + CNG never exceeds total
  const safeEV   = Math.min(nEV,  total);
  const safeCNG  = Math.min(nCNG, total - safeEV);
  const nDiesel  = total - safeEV - safeCNG;

  const result = useMemo(() => computeScenario({
    nDiesel, nCNG: safeCNG, nEV: safeEV, kmPA, subsidy, gridYear,
  }), [nDiesel, safeCNG, safeEV, kmPA, subsidy, gridYear]);

  function reset() {
    setTotal(DEFAULT.total); setNEV(DEFAULT.nEV); setNCNG(DEFAULT.nCNG);
    setKmPA(DEFAULT.kmPA); setSubsidy(DEFAULT.subsidy); setGridYear(DEFAULT.gridYear);
  }

  const savingsPct = result ? (result.savingsPA / result.baselineCost) * 100 : 0;
  const co2Pct     = result ? (result.co2Saved  / result.baselineCO2 ) * 100 : 0;
  const evOnGrid25Worse = safeEV > 0 && gridYear === 2025 &&
    EV_KWH_PER_KM * GRID_FACTOR[2025] > CO2_PER_KM.diesel;

  return (
    <div className="flex h-full bg-slate-50 overflow-hidden">

      {/* ── Left: Control panel ───────────────────────────────────────────── */}
      <aside className="w-80 flex-shrink-0 bg-white border-r border-slate-100 overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-indigo-500" />
            <h2 className="font-bold text-slate-800 text-sm">Scenario Controls</h2>
          </div>
          <button
            onClick={reset}
            className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
          >
            <RotateCcw size={11} /> Reset
          </button>
        </div>

        {/* Fleet size */}
        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Fleet Size</p>
          <SliderRow
            label="Total buses"
            value={total} min={20} max={300}
            onChange={v => { setTotal(v); setNEV(Math.min(nEV, v)); setNCNG(Math.min(nCNG, v - Math.min(nEV, v))); }}
          />
        </section>

        {/* Fleet mix */}
        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Fleet Mix</p>
          <SliderRow
            label="EV buses"
            value={safeEV} min={0} max={total}
            onChange={v => setNEV(Math.min(v, total - safeCNG))}
          />
          <SliderRow
            label="CNG buses"
            value={safeCNG} min={0} max={total - safeEV}
            onChange={setNCNG}
          />
          <div className="flex items-center justify-between py-2.5 px-3 bg-slate-50 rounded-xl text-sm border border-slate-100">
            <span className="text-slate-500">Diesel (remainder)</span>
            <span className="font-bold text-slate-800">{nDiesel}</span>
          </div>
        </section>

        {/* Operating assumptions */}
        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Operations</p>
          <SliderRow
            label="Annual km per bus"
            value={kmPA} min={30_000} max={100_000} step={5_000}
            onChange={setKmPA}
            format={v => `${(v / 1000).toFixed(0)}k km`}
            note="200 km/day × 300 days = 60k km"
          />
        </section>

        {/* EV subsidy */}
        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">EV Subsidy</p>
          <SegmentedControl
            value={subsidy}
            options={[['none', 'None'], ['fame', 'FAME II']]}
            onChange={setSubsidy}
          />
          {subsidy === 'fame' && (
            <p className="text-xs text-indigo-500 mt-2">40% off EV purchase price — MHI notification</p>
          )}
          {subsidy === 'none' && (
            <p className="text-xs text-slate-400 mt-2">Full ₹1.5 Cr sticker price; battery replacement at yr 6 adds ₹6.25L/yr</p>
          )}
        </section>

        {/* Grid year */}
        <section className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">India Grid Year (CO₂)</p>
          <SegmentedControl
            value={gridYear}
            options={[[2025, '2025'], [2027, '2027'], [2030, '2030']]}
            onChange={setGridYear}
          />
          <p className="text-xs text-slate-400 mt-2">
            {GRID_FACTOR[gridYear]} kg CO₂/kWh — CEA{gridYear > 2025 ? ' projected' : ''}
          </p>
        </section>

        {/* Sources */}
        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
          <p className="text-xs text-slate-500 font-semibold mb-1.5 flex items-center gap-1">
            <Info size={10} /> Data Sources
          </p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Fuel prices: IOC / MGL retail. Vehicle costs: Tata Motors CV price list.
            Emissions: MoRTH, CPCB. Efficiency: CIRT Pune / ICAT. Grid: CEA Annual Report.
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

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI
                highlight
                label="Total fleet cost / year"
                value={cr(result.scenarioCost)}
                sub={`${total} buses · ${(kmPA / 1000).toFixed(0)}k km/yr each`}
              />
              <KPI
                danger={result.savingsPA < 0}
                neutral={result.savingsPA === 0}
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

            {/* TCO breakdown chart */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-0.5">Per-bus Annual TCO Breakdown</h3>
              <p className="text-xs text-slate-400 mb-4">
                Capex amortized over {ASSET_LIFE} yrs ·{' '}
                {(kmPA / 1000).toFixed(0)}k km/yr ·{' '}
                {subsidy === 'fame' ? 'FAME II subsidy on EV' : 'no subsidy'}
              </p>
              <TCOChart tco={result.tco} />
              <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                {(['diesel', 'cng', 'ev']).map(t => (
                  <div key={t} className="bg-slate-50 rounded-xl py-2.5 px-3 border border-slate-100">
                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">
                      {t === 'ev' ? 'EV' : t.toUpperCase()}
                    </p>
                    <p className="font-bold text-slate-800">{L(result.tco[t].total)}/yr</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ₹{(result.tco[t].total / kmPA).toFixed(1)}/km
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* CO₂ chart */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-0.5">
                CO₂ Emissions — Per Bus Per Year
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Red dashed line = diesel baseline. EV emissions shift left as India's grid cleans up.
              </p>
              <CO2Chart kmPA={kmPA} />
              {evOnGrid25Worse && (
                <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                  <Info size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    On the 2025 grid (0.70 kg CO₂/kWh), an EV bus emits{' '}
                    <strong>more</strong> CO₂ per km than diesel. Switch to 2027 or 2030 to see
                    when EVs become cleaner — grid parity is around{' '}
                    <strong>{result.parityYear}</strong>.
                  </p>
                </div>
              )}
            </div>

            {/* 8-year cumulative */}
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
                  Scenario costs {cr(Math.abs(result.savingsPA * 8))} more than all-diesel over 8 years.
                  Enable FAME II subsidy to close the gap.
                </p>
              )}
            </div>

            {/* Insight cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <InsightCard
                icon={TrendingDown}
                iconBg="bg-indigo-100" iconColor="text-indigo-600"
                title="EV Payback Period"
                headline={
                  result.breakevenYears === Infinity ? 'No breakeven' :
                  result.breakevenYears <= 0         ? 'Instant'      :
                  `${result.breakevenYears} yrs`
                }
                headlineColor={
                  result.breakevenYears > ASSET_LIFE ? 'text-red-600' :
                  result.breakevenYears <= 0         ? 'text-green-600' :
                  'text-indigo-700'
                }
                body={
                  result.breakevenYears > ASSET_LIFE
                    ? `Exceeds ${ASSET_LIFE}-yr bus life without subsidy. FAME II brings it to ~4.7 yrs by cutting extra capex from ₹115L to ₹55L per bus.`
                    : `Extra EV capex vs diesel recovered through fuel + maintenance savings alone. Battery replacement at yr 6 included.`
                }
              />

              <InsightCard
                icon={Leaf}
                iconBg="bg-green-100" iconColor="text-green-600"
                title="EV Grid CO₂ Parity"
                headline={`~${result.parityYear}`}
                headlineColor="text-green-700"
                body={`Year when India's grid drops below 0.57 kg CO₂/kWh — the threshold where EV buses become cleaner than diesel per km. Grid today: 0.70 kg (CEA 2025). Target by 2030: 0.40 kg.`}
              />

              <InsightCard
                icon={Zap}
                iconBg="bg-amber-100" iconColor="text-amber-600"
                title="Charging Infrastructure"
                headline={safeEV > 0 ? `${result.chargersNeeded} bays` : 'No EVs'}
                headlineColor={safeEV > 0 ? 'text-amber-700' : 'text-slate-400'}
                body={
                  safeEV > 0
                    ? `Estimated overnight charger bays for ${safeEV} EV buses (1 bay : 3 buses via interval graph scheduling). Use the Charging Planner for exact slot assignments and tariff optimisation.`
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
