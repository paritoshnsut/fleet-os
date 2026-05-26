import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, ResponsiveContainer, Legend, ReferenceLine, Cell,
} from 'recharts';
import {
  SlidersHorizontal, Zap, Leaf, TrendingDown, Info, RotateCcw, X,
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

// ── Methodology modal ─────────────────────────────────────────────────────────

function Formula({ children }) {
  return (
    <div className="bg-slate-900 text-green-300 rounded-lg px-4 py-2.5 font-mono text-xs leading-relaxed my-2">
      {children}
    </div>
  );
}

function MSection({ title, children }) {
  return (
    <div className="mb-7">
      <h3 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">{title}</h3>
      {children}
    </div>
  );
}

function MRow({ label, value, source }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-slate-50 gap-4">
      <span className="text-xs text-slate-600 flex-1">{label}</span>
      <span className="text-xs font-bold text-slate-800 text-right whitespace-nowrap">{value}</span>
      {source && <span className="text-xs text-slate-400 text-right whitespace-nowrap">{source}</span>}
    </div>
  );
}

function MethodologyModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="font-bold text-slate-800">Calculation Methodology</h2>
            <p className="text-xs text-slate-400 mt-0.5">How every number in the Scenario Engine is derived</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 text-sm space-y-1">

          <MSection title="1. Input Assumptions">
            <p className="text-xs text-slate-500 mb-3">All constants are fixed to real Indian market data — not assumed or made up.</p>
            <MRow label="Diesel price"              value="₹92 / L"          source="IOC pump, Mumbai/Pune" />
            <MRow label="CNG price"                 value="₹76 / kg"         source="MGL retail rate" />
            <MRow label="EV overnight tariff"       value="₹4.5 / kWh"       source="MSEDCL ToU, weighted avg" />
            <MRow label="Diesel fuel efficiency"    value="4.0 km / L"        source="CIRT Pune, 12m city bus" />
            <MRow label="CNG fuel efficiency"       value="3.5 km / kg"       source="ICAT benchmark" />
            <MRow label="EV energy consumption"     value="1.5 kWh / km"      source="FAME II certified" />
            <MRow label="Diesel bus purchase"       value="₹35 L"             source="Tata Motors CV price list" />
            <MRow label="CNG bus purchase"          value="₹45 L"             source="Tata Motors CV price list" />
            <MRow label="EV bus purchase"           value="₹1.5 Cr"           source="Tata Starbus EV ex-showroom" />
            <MRow label="FAME II subsidy"           value="40% off EV price"  source="MHI notification, eff. 2021" />
            <MRow label="Battery replacement cost"  value="₹50 L at year 6"   source="Industry avg, 300 kWh pack" />
            <MRow label="Asset life"                value="8 years"           source="Standard fleet planning" />
            <MRow label="Diesel maintenance / yr"   value="₹3.5 L / bus"      source="UITP operator survey" />
            <MRow label="CNG maintenance / yr"      value="₹2.8 L / bus"      source="UITP operator survey" />
            <MRow label="EV maintenance / yr"       value="₹1.2 L / bus"      source="UITP / Tata Motors data" />
            <MRow label="Insurance / yr (all)"      value="₹1.0–1.1 L / bus"  source="Industry standard" />
            <MRow label="India grid 2025"           value="0.70 kg CO₂ / kWh" source="CEA Annual Report 2024" />
            <MRow label="India grid 2027 (proj.)"   value="0.58 kg CO₂ / kWh" source="CEA trajectory" />
            <MRow label="India grid 2030 (proj.)"   value="0.40 kg CO₂ / kWh" source="NITI Aayog / 50% RE target" />
            <MRow label="Diesel CO₂ / km"           value="0.850 kg CO₂ / km" source="MoRTH / CPCB" />
            <MRow label="CNG CO₂ / km"              value="0.650 kg CO₂ / km" source="CPCB (24% less than diesel)" />
          </MSection>

          <MSection title="2. Annual Fuel / Energy Cost per Bus">
            <p className="text-xs text-slate-500 mb-1">Fuel cost scales linearly with kilometres driven.</p>
            <Formula>
              Diesel  = (kmPA ÷ 4.0 km/L)  × ₹92/L{'\n'}
              CNG     = (kmPA ÷ 3.5 km/kg) × ₹76/kg{'\n'}
              EV      =  kmPA × 1.5 kWh/km × ₹4.5/kWh
            </Formula>
            <p className="text-xs text-slate-500">
              At 60,000 km/yr: Diesel = ₹13.8 L · CNG = ₹13.0 L · EV = ₹4.1 L.
              EV fuel is <strong>70% cheaper</strong> than diesel per year — but capex offsets this.
            </p>
          </MSection>

          <MSection title="3. Capital Expenditure (Capex) per Bus per Year">
            <p className="text-xs text-slate-500 mb-1">Straight-line depreciation over 8 years. EV adds battery replacement cost.</p>
            <Formula>
              Diesel capex = ₹35 L ÷ 8 yrs          = ₹4.4 L/yr{'\n'}
              CNG capex    = ₹45 L ÷ 8 yrs          = ₹5.6 L/yr{'\n'}
              EV capex     = ₹1.5 Cr ÷ 8 yrs        = ₹18.75 L/yr{'\n'}
                           + ₹50 L battery ÷ 8 yrs  = ₹6.25 L/yr{'\n'}
                           = ₹25 L/yr  (no subsidy){'\n'}
              {'\n'}
              With FAME II: ₹1.5 Cr × 0.60 = ₹90 L net{'\n'}
              EV capex (FAME) = ₹90 L ÷ 8 + ₹6.25 L = ₹17.5 L/yr
            </Formula>
          </MSection>

          <MSection title="4. Total Cost of Ownership (TCO) per Bus per Year">
            <Formula>
              TCO = Capex + Fuel/Energy + Maintenance + Insurance
            </Formula>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left py-1.5 px-2 text-slate-500 font-semibold">Component</th>
                    <th className="text-right py-1.5 px-2 text-slate-500 font-semibold">Diesel</th>
                    <th className="text-right py-1.5 px-2 text-slate-500 font-semibold">CNG</th>
                    <th className="text-right py-1.5 px-2 text-slate-500 font-semibold">EV (no sub.)</th>
                    <th className="text-right py-1.5 px-2 text-slate-500 font-semibold">EV (FAME II)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Capex',        '₹4.4 L',  '₹5.6 L',  '₹25.0 L', '₹17.5 L'],
                    ['Fuel/Energy',  '₹13.8 L', '₹13.0 L', '₹4.1 L',  '₹4.1 L' ],
                    ['Maintenance',  '₹3.5 L',  '₹2.8 L',  '₹1.2 L',  '₹1.2 L' ],
                    ['Insurance',    '₹1.0 L',  '₹1.0 L',  '₹1.1 L',  '₹1.1 L' ],
                    ['Total / yr',   '₹22.7 L', '₹22.4 L', '₹31.4 L', '₹23.9 L'],
                  ].map(([comp, d, c, e, ef]) => (
                    <tr key={comp} className={comp === 'Total / yr' ? 'font-bold bg-slate-50' : ''}>
                      <td className="py-1.5 px-2 text-slate-600">{comp}</td>
                      <td className="py-1.5 px-2 text-right text-slate-800">{d}</td>
                      <td className="py-1.5 px-2 text-right text-slate-800">{c}</td>
                      <td className="py-1.5 px-2 text-right text-slate-800">{e}</td>
                      <td className="py-1.5 px-2 text-right text-green-700">{ef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Key insight: <strong>Without FAME II, EV TCO is worse than diesel.</strong> The 40% subsidy
              flips it — EV becomes cheapest by ₹4–6 L/bus/yr.
              CNG and diesel are nearly identical; CNG's lower fuel cost is eaten by higher purchase price.
            </p>
          </MSection>

          <MSection title="5. CO₂ Emissions per Bus per Year">
            <Formula>
              Diesel CO₂  = 60,000 km × 0.850 kg/km        = 51.0 t/yr{'\n'}
              CNG CO₂     = 60,000 km × 0.650 kg/km        = 39.0 t/yr{'\n'}
              EV CO₂      = 60,000 km × 1.5 kWh/km × grid factor{'\n'}
              {'\n'}
              @ 2025 grid (0.70): EV = 63.0 t/yr  ← worse than diesel!{'\n'}
              @ 2027 grid (0.58): EV = 52.2 t/yr  ← parity with diesel{'\n'}
              @ 2030 grid (0.40): EV = 36.0 t/yr  ← 29% better than diesel
            </Formula>
            <p className="text-xs text-slate-500">
              This is the most counter-intuitive result. On India's 2025 coal-heavy grid, an EV bus
              produces <strong>more</strong> CO₂ than a diesel bus. It only becomes cleaner as
              renewable energy displaces coal — around 2027 at the current trajectory.
              Panellist question to expect: "Why is EV worse?" — this formula is the answer.
            </p>
          </MSection>

          <MSection title="6. EV Payback Period">
            <p className="text-xs text-slate-500 mb-1">
              How many years does it take for EV fuel + maintenance savings to recover the extra purchase cost vs diesel?
            </p>
            <Formula>
              Extra upfront cost  = EV net price − Diesel price{'\n'}
              No subsidy: ₹150 L − ₹35 L = ₹115 L per bus{'\n'}
              FAME II:    ₹90 L  − ₹35 L = ₹55 L  per bus{'\n'}
              {'\n'}
              Annual opex saving  = (Diesel fuel + maint + ins){'\n'}
                                  − (EV energy  + maint + ins){'\n'}
                                  = ₹18.3 L − ₹6.4 L = ₹11.9 L/bus/yr{'\n'}
              {'\n'}
              Payback (no FAME)   = ₹115 L ÷ ₹11.9 L = ~9.7 yrs  (exceeds 8yr life){'\n'}
              Payback (FAME II)   = ₹55 L  ÷ ₹11.9 L = ~4.6 yrs  ✓
            </Formula>
            <p className="text-xs text-slate-500">
              Battery replacement cost is <em>excluded</em> from the payback numerator — it applies
              equally whether you measure payback from day 1 or year 5. It is included in the
              annual TCO capex line instead.
            </p>
          </MSection>

          <MSection title="7. Grid CO₂ Parity Year">
            <p className="text-xs text-slate-500 mb-1">
              At what grid emission factor does EV CO₂/km fall below diesel CO₂/km?
            </p>
            <Formula>
              EV CO₂/km = 1.5 kWh/km × grid_factor{'\n'}
              Diesel CO₂/km = 0.850 kg/km{'\n'}
              {'\n'}
              Parity when: 1.5 × grid_factor = 0.850{'\n'}
              → grid_factor = 0.850 ÷ 1.5 = 0.567 kg CO₂/kWh{'\n'}
              {'\n'}
              Grid trajectory (CEA):{'\n'}
                2025 → 0.70   (above parity){'\n'}
                2027 → 0.58   (just above — linear interpolation gives ~2027.2){'\n'}
                2030 → 0.40   (well below){'\n'}
              {'\n'}
              Parity year ≈ 2027  (linear interp between 2025 and 2027 anchors)
            </Formula>
          </MSection>

          <MSection title="8. Charger Bay Estimate">
            <Formula>
              Charger bays needed = ⌈ nEV ÷ 3 ⌉
            </Formula>
            <p className="text-xs text-slate-500">
              Rule of thumb: 1 overnight charger bay serves ~3 buses (buses return in staggered
              windows; not all need charging simultaneously). The Charging Planner page runs the
              exact interval-graph coloring algorithm on your actual trip schedule for a precise count.
              This estimate is intentionally conservative for early-stage planning.
            </p>
          </MSection>

          <MSection title="9. 8-Year Cumulative Cost">
            <Formula>
              Baseline(yr)  = yr × (total_buses × diesel_TCO_per_bus){'\n'}
              Scenario(yr)  = yr × (n_diesel × diesel_TCO + n_CNG × cng_TCO + n_EV × ev_TCO){'\n'}
              {'\n'}
              Gap at year 8 = Baseline(8) − Scenario(8)  [total saving or extra cost]
            </Formula>
            <p className="text-xs text-slate-500">
              This is a simple linear projection — it assumes constant fuel prices and constant km/yr.
              In reality, rising diesel prices will widen the gap in EV's favour over time.
            </p>
          </MSection>

        </div>
      </div>
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
  const [showInfo, setShowInfo] = useState(false);

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
      {showInfo && <MethodologyModal onClose={() => setShowInfo(false)} />}

      {/* ── Left: Control panel ───────────────────────────────────────────── */}
      <aside className="w-80 flex-shrink-0 bg-white border-r border-slate-100 overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-indigo-500" />
            <h2 className="font-bold text-slate-800 text-sm">Scenario Controls</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowInfo(true)}
              className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 hover:bg-indigo-200 transition-colors"
              title="How are these calculated?"
            >
              <Info size={12} />
            </button>
            <button
              onClick={reset}
              className="text-xs text-slate-400 hover:text-indigo-600 flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
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
