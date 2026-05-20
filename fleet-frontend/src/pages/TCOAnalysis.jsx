import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, ResponsiveContainer,
} from 'recharts';
import {
  Upload, Info, X, FileSpreadsheet, ChevronDown, ChevronRight,
  Calculator, TrendingUp, BarChart2, Zap, Download,
} from 'lucide-react';
import { cn } from '../lib/utils';

// ─── Calculation Engine ───────────────────────────────────────────────────────

function calcEMI(principal, rate, years) {
  if (rate === 0) return principal / years;
  const r = rate;
  const n = years;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function calcNPV(cashflows, discountRate) {
  return cashflows.reduce((sum, cf, i) => sum + cf / Math.pow(1 + discountRate, i + 1), 0);
}

function buildLifecycle(p) {
  const {
    busType,        // 'DSL' | 'EV'
    ecp,            // ₹ vehicle retail price + taxes
    loanShare,      // fraction e.g. 0.9
    interestRate,   // fraction e.g. 0.07
    loanTenure,     // years e.g. 5
    busLife,        // years e.g. 12 (DSL) / 6 (EV analysis period)
    busSalvage,     // fraction e.g. 0.1
    insuranceRate,  // fraction e.g. 0.011
    kmPerDay,       // km
    operationalDays,// days/year
    fuelEfficiency, // km/unit for DSL; kWh/km for EV (vehicle side)
    fuelTariff,     // ₹/unit
    fuelYoY,        // fraction e.g. 0.025
    chargerEfficiency, // fraction e.g. 0.96
    transformerLoss,   // fraction e.g. 0.05
    manpowerPerKm,  // ₹/km
    manpowerYoY,    // fraction
    amcPerKm,       // ₹/km
    amcYoY,         // fraction
    miscPerKm,      // ₹/km
    miscYoY,        // fraction
    // EV only
    chargerCostPerBus,   // ₹
    chargerFinRate,      // fraction e.g. 0.12
    chargerLife,         // years e.g. 12
    chargerSalvage,      // fraction
    chargerAMCRate,      // fraction after yr2
    fastChargerCostPerBus, // ₹ (for AMC base)
  } = p;

  const annualKm = kmPerDay * operationalDays;
  const discountRate = 0.10;
  const years = busLife;

  const rows = {};

  // Bus Capitalization Cost
  const loan = ecp * loanShare;
  const downPay = ecp * (1 - loanShare);
  const emi = calcEMI(loan, interestRate, loanTenure);
  const busCap = Array.from({ length: years }, (_, i) => {
    const yr = i + 1;
    if (yr === 1) return emi + downPay;
    if (yr <= loanTenure) return emi;
    if (yr === years) return -ecp * busSalvage;
    return 0;
  });
  rows['Bus Capitalization Cost'] = busCap;

  // Vehicle Insurance
  const insY1 = ecp * insuranceRate;
  const insFloor = insY1 * 0.5;
  const insurance = Array.from({ length: years }, (_, i) => {
    const yr = i + 1;
    if (yr <= loanTenure) return insY1 * Math.pow(0.85, i);
    return insFloor;
  });
  rows['Vehicle Insurance'] = insurance;

  // Charging Infra Capitalization (EV only)
  if (busType === 'EV') {
    const chargerEMI = calcEMI(chargerCostPerBus, chargerFinRate, chargerLife);
    rows['Charging Infra Capitalization Cost'] = Array.from({ length: years }, (_, i) => {
      const yr = i + 1;
      return yr <= chargerLife ? chargerEMI : 0;
    });

    // Charger AMC (from year 3)
    rows['Charger AMC Cost'] = Array.from({ length: years }, (_, i) => {
      const yr = i + 1;
      return yr >= 3 ? fastChargerCostPerBus * chargerAMCRate : 0;
    });
  }

  // Fuel Cost
  let annualFuelBase;
  if (busType === 'EV') {
    const gridKwhPerKm = fuelEfficiency / (chargerEfficiency * (1 - transformerLoss));
    annualFuelBase = annualKm * gridKwhPerKm * fuelTariff;
  } else {
    annualFuelBase = (annualKm / fuelEfficiency) * fuelTariff;
  }
  rows['Fuel Cost'] = Array.from({ length: years }, (_, i) =>
    annualFuelBase * Math.pow(1 + fuelYoY, i)
  );

  // Manpower
  rows['Manpower cost (Driver + Conductor)'] = Array.from({ length: years }, (_, i) =>
    annualKm * manpowerPerKm * Math.pow(1 + manpowerYoY, i)
  );

  // Bus AMC
  rows['Bus AMC Cost (Manpower + Materials)'] = Array.from({ length: years }, (_, i) =>
    annualKm * amcPerKm * Math.pow(1 + amcYoY, i)
  );

  // Other Misc
  rows['Other Misc.'] = Array.from({ length: years }, (_, i) =>
    annualKm * miscPerKm * Math.pow(1 + miscYoY, i)
  );

  // Battery replacement (default 0; user can override)
  rows['Battery replacement cost'] = Array.from({ length: years }, () => 0);

  // EAP per row and total
  const annualKmArr = Array.from({ length: years }, () => annualKm);
  const npvKm = calcNPV(annualKmArr, discountRate);

  const eapPerRow = {};
  Object.entries(rows).forEach(([label, costs]) => {
    eapPerRow[label] = calcNPV(costs, discountRate) / npvKm;
  });

  const totalEAPNum = Object.values(rows).reduce((sum, costs) => {
    return sum + calcNPV(costs, discountRate);
  }, 0);
  const totalEAP = totalEAPNum / npvKm;

  return { rows, eapPerRow, totalEAP, annualKm, years };
}

function calcSensitivity(params) {
  const base = buildLifecycle(params);
  const baseEAP = base.totalEAP;

  const factors = [
    {
      key: 'km per day',
      label: 'km per day',
      apply: (p, delta) => ({ ...p, kmPerDay: p.kmPerDay * (1 + delta) }),
    },
    {
      key: 'ECP',
      label: 'ECP (Vehicle Cost)',
      apply: (p, delta) => ({ ...p, ecp: p.ecp * (1 + delta) }),
    },
    {
      key: 'Efficiency',
      label: 'Fuel Efficiency',
      apply: (p, delta) => ({ ...p, fuelEfficiency: p.fuelEfficiency * (1 + delta) }),
    },
    {
      key: 'Fuel Tariff',
      label: 'Fuel / Power Tariff',
      apply: (p, delta) => ({ ...p, fuelTariff: p.fuelTariff * (1 + delta) }),
    },
    {
      key: 'Interest Rate',
      label: 'Interest Rate',
      apply: (p, delta) => ({ ...p, interestRate: p.interestRate * (1 + delta) }),
    },
    ...(params.busType === 'EV' ? [{
      key: 'Charger+Infra',
      label: 'Charger + Infra Cost',
      apply: (p, delta) => ({ ...p, chargerCostPerBus: p.chargerCostPerBus * (1 + delta) }),
    }] : []),
  ];

  return factors.map(f => {
    const eapUp   = buildLifecycle(f.apply(params, +0.10)).totalEAP;
    const eapDown = buildLifecycle(f.apply(params, -0.10)).totalEAP;
    const deltaUp   = (eapUp   - baseEAP) / baseEAP;
    const deltaDown = (eapDown - baseEAP) / baseEAP;
    return {
      label: f.label,
      up:   deltaUp,
      down: deltaDown,
      absImpact: Math.abs(deltaUp - deltaDown),
    };
  }).sort((a, b) => b.absImpact - a.absImpact);
}

// ─── Default Params ───────────────────────────────────────────────────────────

const DSL_DEFAULTS = {
  busType: 'DSL',
  ecp: 7500000,
  loanShare: 0.90,
  interestRate: 0.09,
  loanTenure: 5,
  busLife: 6,
  busSalvage: 0.10,
  insuranceRate: 0.005,
  kmPerDay: 400,
  operationalDays: 346.75,
  fuelEfficiency: 3.7,     // km/L
  fuelTariff: 90,           // ₹/L
  fuelYoY: 0.025,
  chargerEfficiency: 0.96,
  transformerLoss: 0.05,
  manpowerPerKm: 6.661,
  manpowerYoY: 0.055,
  amcPerKm: 4.7575,
  amcYoY: 0.055,
  miscPerKm: 1.915,
  miscYoY: 0.055,
  chargerCostPerBus: 0,
  chargerFinRate: 0.12,
  chargerLife: 12,
  chargerSalvage: 0.05,
  chargerAMCRate: 0.05,
  fastChargerCostPerBus: 0,
};

const EV_DEFAULTS = {
  busType: 'EV',
  ecp: 14805000,
  loanShare: 0.90,
  interestRate: 0.07,
  loanTenure: 5,
  busLife: 6,
  busSalvage: 0.10,
  insuranceRate: 0.011,
  kmPerDay: 400,
  operationalDays: 346.75,
  fuelEfficiency: 1.0,     // kWh/km (vehicle side)
  fuelTariff: 11.5,         // ₹/kWh
  fuelYoY: 0.015,
  chargerEfficiency: 0.96,
  transformerLoss: 0.05,
  manpowerPerKm: 6.661,
  manpowerYoY: 0.055,
  amcPerKm: 4.325,
  amcYoY: 0.055,
  miscPerKm: 0.9177,
  miscYoY: 0.055,
  chargerCostPerBus: 2209746,
  chargerFinRate: 0.12,
  chargerLife: 12,
  chargerSalvage: 0.05,
  chargerAMCRate: 0.05,
  fastChargerCostPerBus: 1484440,  // fast charger cost / buses per charger
};

// ─── Parity Analysis ─────────────────────────────────────────────────────────

const ECP_FACTORS = [
  Math.pow(0.9, 5), Math.pow(0.9, 4), Math.pow(0.9, 3), Math.pow(0.9, 2), 0.9,
  1,
  1.1, Math.pow(1.1, 2), Math.pow(1.1, 3), Math.pow(1.1, 4), Math.pow(1.1, 5),
];
const EFF_COLS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
const KM_COLS  = [200, 240, 280, 320, 360, 400, 440, 480, 520, 560, 600];

function calcParityTables(evParams, dslParams) {
  const baseECP = evParams.ecp;
  const ecpRows = ECP_FACTORS.map(f => baseECP * f);

  const dslBaseEAP = buildLifecycle(dslParams).totalEAP;
  const dslEAPByKm = KM_COLS.map(km =>
    buildLifecycle({ ...dslParams, kmPerDay: km }).totalEAP
  );

  const table1 = ecpRows.map(ecp => ({
    ecp,
    cells: EFF_COLS.map(eff => {
      const evEAP = buildLifecycle({ ...evParams, ecp, fuelEfficiency: eff }).totalEAP;
      return { diff: evEAP - dslBaseEAP, evEAP, dslEAP: dslBaseEAP };
    }),
  }));

  const table2 = ecpRows.map(ecp => ({
    ecp,
    cells: KM_COLS.map((km, j) => {
      const evEAP = buildLifecycle({ ...evParams, ecp, kmPerDay: km }).totalEAP;
      return { diff: evEAP - dslEAPByKm[j], evEAP, dslEAP: dslEAPByKm[j] };
    }),
  }));

  return { table1, table2, ecpRows };
}

// ─── Helper Components ────────────────────────────────────────────────────────

function InfoModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-slate-800 font-semibold text-base">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 ml-4 flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="text-slate-600 text-sm space-y-3 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

function InfoButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-5 h-5 rounded-full border border-blue-300 bg-blue-50 text-blue-500
        flex items-center justify-center hover:bg-blue-100 transition-colors flex-shrink-0"
      title="Learn more"
    >
      <Info size={11} />
    </button>
  );
}

function fmt(n, decimals = 0) {
  if (n === 0 || n == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n);
}

function fmtL(n) {
  // Format in lakhs with 2dp
  if (n === 0) return '—';
  const lakh = n / 100000;
  if (Math.abs(lakh) < 0.01) return '—';
  return (lakh >= 0 ? '' : '−') + fmt(Math.abs(lakh), 2);
}

function InputField({ label, value, onChange, unit, type = 'number', step, min, placeholder, note, isDemo }) {
  return (
    <div>
      <label className={cn('block text-xs font-medium mb-1', isDemo ? 'text-slate-400' : 'text-slate-600')}>
        {label}
        {unit && <span className="font-normal ml-1">({unit})</span>}
      </label>
      <input
        type={type}
        step={step}
        min={min}
        value={value}
        onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 transition-colors',
          isDemo
            ? 'border-slate-200 bg-slate-50 text-slate-400 focus:ring-blue-200 focus:border-blue-300 italic'
            : 'border-slate-200 bg-white text-slate-800 focus:ring-blue-300 focus:border-blue-400'
        )}
      />
      {note && <p className="text-slate-400 text-[11px] mt-0.5">{note}</p>}
    </div>
  );
}

// ─── Info content ─────────────────────────────────────────────────────────────

const LIFECYCLE_INFO = (
  <>
    <p><strong>What is this table?</strong> The Lifecycle Cost Mapping breaks down every cost category year by year over the analysis period (typically 6–12 years).</p>
    <p><strong>Bus Capitalization Cost</strong> — EMI on the bus loan (ECP × loan share, amortized at the interest rate). Year 1 also includes the down payment. The last year shows the negative salvage value (residual value recovered).</p>
    <p><strong>Vehicle Insurance</strong> — ECP × insurance rate, declining 15% each year during the loan period, then fixed at 50% of Year 1 cost thereafter.</p>
    <p><strong>Charging Infra</strong> (EV only) — Annualized cost of charger + grid infra per bus, using EMI over charger life at the WACC financing rate.</p>
    <p><strong>Charger AMC</strong> (EV only) — Annual maintenance cost of the fast charger, applied from Year 3.</p>
    <p><strong>Fuel / Energy Cost</strong> — Annual km ÷ fuel economy × tariff, escalated at the year-on-year rate. For EV, grid draw accounts for charger and transformer losses.</p>
    <p><strong>Manpower, AMC, Misc</strong> — Per-km cost × annual km, escalated at the respective YoY rate.</p>
    <p><strong>EAP (Equivalent Annualized ₹/km)</strong> — NPV of each cost row divided by NPV of all km, discounted at 10%. This normalizes costs across different year timings.</p>
  </>
);

const PERKM_INFO = (
  <>
    <p><strong>What is this table?</strong> Each row shows the Equivalent Annualized Cost per km (EAP) for a cost category, letting you compare DSL and EV on a like-for-like basis.</p>
    <p><strong>Formula:</strong> EAP = NPV of category costs ÷ NPV of annual km, where NPV uses a 10% discount rate.</p>
    <p><strong>Why NPV?</strong> Cash flows in later years are worth less today. The 10% discount rate reflects opportunity cost of capital and ensures early-year heavy costs (like down payment) are weighted appropriately.</p>
    <p><strong>Total EAP</strong> is the all-in ₹/km cost of owning and operating the bus over its life — the key metric for comparing DSL vs EV economics.</p>
  </>
);

const SENSITIVITY_INFO = (
  <>
    <p><strong>What is this chart?</strong> The sensitivity (tornado) chart shows which input parameters have the most impact on the Total EAP (₹/km).</p>
    <p><strong>How it works:</strong> Each parameter is varied by ±10% while keeping all others constant. The resulting % change in Total EAP is plotted as a bar.</p>
    <p><strong>Interpretation:</strong></p>
    <ul className="list-disc pl-4 space-y-1">
      <li>Wider bars = higher sensitivity = riskier assumption</li>
      <li>Parameters are sorted from highest to lowest impact (tornado shape)</li>
      <li>Blue = +10% change, Gray = −10% change</li>
    </ul>
    <p><strong>Example:</strong> If "km per day" has the widest bar, running more km significantly reduces per-km cost (fixed costs are spread over more km) — this is usually the dominant factor.</p>
  </>
);

const PARITY_INFO = (
  <>
    <p><strong>What are these tables?</strong> The Parity Analysis tables help the sales team find the competitive price range and minimum usage needed for EV buses to beat equivalent diesel buses on a per-km lifecycle cost basis.</p>
    <p><strong>Table 1 — Efficiency vs ECP:</strong> Rows = EV price levels (±10% steps around your input ECP). Columns = energy efficiency (kWh/km). Each cell = EV EAP minus DSL EAP. Negative (green) = EV is cheaper; positive (red) = DSL is cheaper.</p>
    <p><strong>Table 2 — km/day vs ECP:</strong> Same ECP rows. Columns = daily km usage. Both EV and DSL costs vary with km, so this shows how utilisation shifts the breakeven.</p>
    <p><strong>How the sales team uses this:</strong></p>
    <ul className="list-disc pl-4 space-y-1">
      <li><strong>Max ECP to quote:</strong> Pick the customer's expected efficiency column. The highest green row is the maximum price you can charge while EV still wins.</li>
      <li><strong>Min km to break even:</strong> Find the bus price row. Scan right until the first green cell — that's the minimum km/day the customer must run.</li>
    </ul>
    <p><strong>Highlighted cells</strong> (dark border) show your exact current input values. The DSL reference uses default parameters (₹75L ECP, 3.7 km/L, ₹90/L).</p>
  </>
);

// ─── Excel Parser ─────────────────────────────────────────────────────────────

function parseExcel(file, busType, callback) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets['Input'];
      if (!ws) { callback(null, 'No "Input" sheet found in the Excel file.'); return; }
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Col index: C=2, D=3, E=4, F=5
      const col = busType === 'EV' ? 4 : 5;

      const getRow = label => {
        const row = data.find(r => typeof r[0] === 'string' && r[0].toLowerCase().includes(label.toLowerCase()));
        return row ? row[col] : null;
      };
      const getRowC = label => {
        const row = data.find(r => typeof r[0] === 'string' && r[0].toLowerCase().includes(label.toLowerCase()));
        return row;
      };

      const kmRow   = data.find(r => r[0] === 'Avg. kms run per day');
      const daysRow = data.find(r => r[0] === 'Operational days per year');
      const ndpRow  = data.find(r => r[0] === 'NDP');
      const ecpRow  = data.find(r => r[0].includes('Retail price + Taxes'));
      const insRow  = data.find(r => r[0].includes('Bus Insurance'));
      const intRow  = data.find(r => r[0].includes('Interest rate'));
      const loanRow = data.find(r => r[0].includes('Share of Loan'));
      const tenRow  = data.find(r => r[0].includes('Loan'));
      const salvRow = data.find(r => r[0].includes('Bus salvage'));
      const effRow  = data.find(r => r[0].includes('Avg. Vehicle efficiency') && r[1] === 'unit/km');
      const tarRow  = data.find(r => r[0].includes('tariff'));
      const manRow  = data.find(r => r[0].includes('Manpower cost'));
      const amcRow  = data.find(r => r[0].includes('Bus AMC cost'));
      const miscRow = data.find(r => r[0].includes('Other Misc'));
      const charCostRow = data.find(r => r[0].includes('Charger cost per bus'));
      const fastCostRow = data.find(r => r[0].includes('Fast Charger Cost'));
      const busesRow    = data.find(r => r[0].includes('No. of buses shared'));
      const charAMCRow  = data.find(r => r[0].includes('Charger AMC after'));
      const charLifeRow = data.find(r => r[0].includes('Charger Life'));
      const chargerEffRow = data.find(r => r[0].includes('Charger Efficiency'));
      const txLossRow  = data.find(r => r[0].includes('Switchyard'));

      const parsed = {
        kmPerDay:        kmRow?.[2]   || 400,
        operationalDays: daysRow?.[2] || 346.75,
        ecp:             ecpRow?.[col] || ndpRow?.[col] || (busType === 'EV' ? 14805000 : 7500000),
        insuranceRate:   insRow?.[col] || (busType === 'EV' ? 0.011 : 0.005),
        interestRate:    intRow?.[col] || (busType === 'EV' ? 0.07 : 0.09),
        loanShare:       loanRow?.[col] || 0.9,
        loanTenure:      tenRow?.[col] || 5,
        // busLife is NOT read from Excel — Excel's "Bus Life" is physical bus life (15 yr EV / 12 yr DSL)
        // but the TCO analysis period is always 6 years in this model. User controls it separately.
        busSalvage:      salvRow?.[col] || 0.1,
        fuelEfficiency:  effRow ? (busType === 'EV' ? effRow[4] : 1 / (effRow[5] / 1)) : (busType === 'EV' ? 1 : 3.7),
        fuelTariff:      tarRow?.[col] || (busType === 'EV' ? 11.5 : 90),
        fuelYoY:         busType === 'EV' ? 0.015 : 0.025,
        chargerEfficiency: chargerEffRow?.[4] || 0.96,
        transformerLoss: txLossRow?.[4] || 0.05,
        manpowerPerKm:   manRow?.[col] || (busType === 'EV' ? 6.661 : 6.661),
        manpowerYoY:     0.055,
        amcPerKm:        amcRow?.[col] || (busType === 'EV' ? 4.325 : 4.7575),
        amcYoY:          0.055,
        miscPerKm:       miscRow?.[col] || (busType === 'EV' ? 0.9177 : 1.915),
        miscYoY:         0.055,
        chargerCostPerBus:     charCostRow?.[4] || 2209746,
        chargerFinRate:        0.12,
        chargerLife:           charLifeRow?.[4] || 12,
        chargerSalvage:        0.05,
        chargerAMCRate:        charAMCRow?.[4] || 0.05,
        fastChargerCostPerBus: fastCostRow ? (fastCostRow[4] / (busesRow?.[4] || 2)) : 1484440,
      };

      // Fix fuel efficiency for DSL: input sheet gives unit/km, we need km/unit
      if (busType === 'DSL') {
        const unitPerKm = effRow?.[5]; // col F for DSL
        parsed.fuelEfficiency = unitPerKm ? (1 / unitPerKm) : 3.7;
        // Actually use km/unit directly from row 47
        const kmPerUnitRow = data.find(r => typeof r[0] === 'string' && r[0] === '' && r[1] === 'km/unit');
        if (kmPerUnitRow) parsed.fuelEfficiency = kmPerUnitRow[5] || 3.7;
      }

      callback(parsed, null);
    } catch (err) {
      callback(null, 'Failed to parse Excel: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ROW_ORDER = [
  'Bus Capitalization Cost',
  'Vehicle Insurance',
  'Charging Infra Capitalization Cost',
  'Charger AMC Cost',
  'Fuel Cost',
  'Manpower cost (Driver + Conductor)',
  'Bus AMC Cost (Manpower + Materials)',
  'Other Misc.',
  'Battery replacement cost',
];

const ROW_COLOR = {
  'Bus Capitalization Cost': 'text-indigo-700',
  'Vehicle Insurance': 'text-slate-600',
  'Charging Infra Capitalization Cost': 'text-purple-700',
  'Charger AMC Cost': 'text-purple-500',
  'Fuel Cost': 'text-orange-600',
  'Manpower cost (Driver + Conductor)': 'text-slate-600',
  'Bus AMC Cost (Manpower + Materials)': 'text-slate-600',
  'Other Misc.': 'text-slate-500',
  'Battery replacement cost': 'text-red-500',
};

function SectionHeader({ icon: Icon, title, children }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-blue-600" />
      </div>
      <h2 className="text-slate-800 font-semibold text-sm flex-1">{title}</h2>
      {children}
    </div>
  );
}

// Spinner SVG used in the calculate button
function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function Accordion({ title, icon: Icon, defaultOpen = true, badge, children, forceOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = forceOpen || open;
  return (
    <div className="space-y-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left no-print"
      >
        {Icon && (
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Icon size={14} className="text-blue-600" />
          </div>
        )}
        <span className="text-slate-800 font-semibold text-sm flex-1">{title}</span>
        {badge && <span className="mr-1">{badge}</span>}
        {isOpen
          ? <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
          : <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />}
      </button>
      {isOpen && <div className="space-y-4 accordion-content">{children}</div>}
    </div>
  );
}

function parityStyle(v) {
  if (v < -10) return { backgroundColor: '#14532d', color: '#bbf7d0' };
  if (v < -5)  return { backgroundColor: '#15803d', color: '#dcfce7' };
  if (v < -2)  return { backgroundColor: '#86efac', color: '#14532d' };
  if (v < 0)   return { backgroundColor: '#dcfce7', color: '#166534' };
  if (v > 10)  return { backgroundColor: '#7f1d1d', color: '#fca5a5' };
  if (v > 5)   return { backgroundColor: '#ef4444', color: '#ffffff' };
  if (v > 2)   return { backgroundColor: '#fca5a5', color: '#7f1d1d' };
  if (v > 0)   return { backgroundColor: '#fee2e2', color: '#7f1d1d' };
  return { backgroundColor: '#fef9c3', color: '#713f12' };
}

function ParityHeatmap({ title, data, colHeaders, colUnit, currentECPRow, currentColIdx }) {
  const [tooltip, setTooltip] = useState(null);

  return (
    <div className="relative">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{title}</p>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="fixed z-[9999] bg-slate-900 text-white text-xs rounded-xl p-3 pointer-events-none shadow-2xl border border-slate-700"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          <p className="font-semibold text-slate-300 mb-2 text-[11px]">{tooltip.label}</p>
          <div className="space-y-1">
            <p className="flex justify-between gap-6">
              <span className="text-slate-400">EV EAP</span>
              <span className="text-blue-300 font-mono">₹{tooltip.evEAP.toFixed(2)}/km</span>
            </p>
            <p className="flex justify-between gap-6">
              <span className="text-slate-400">DSL EAP</span>
              <span className="text-orange-300 font-mono">₹{tooltip.dslEAP.toFixed(2)}/km</span>
            </p>
            <div className="border-t border-slate-700 pt-1 mt-1 flex justify-between gap-6">
              <span className="text-slate-400">Difference</span>
              <span className={cn('font-mono font-bold', tooltip.diff < 0 ? 'text-green-400' : 'text-red-400')}>
                {tooltip.diff > 0 ? '+' : ''}{tooltip.diff.toFixed(2)}/km
              </span>
            </div>
          </div>
          <p className={cn('text-[10px] mt-2 font-medium', tooltip.diff < 0 ? 'text-green-400' : 'text-red-400')}>
            {tooltip.diff < 0 ? '✓ EV is cheaper than Diesel' : '✗ Diesel is cheaper than EV'}
          </p>
        </div>
      )}

      <div className="overflow-x-auto" onMouseLeave={() => setTooltip(null)}>
        <table className="text-[11px] border-collapse min-w-max">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 text-left px-3 py-2 text-slate-500 font-medium border-b border-r border-slate-200 whitespace-nowrap min-w-[84px]"
                style={{ background: '#f8fafc' }}
              >
                ECP (₹ Lakh)
              </th>
              {colHeaders.map((h, j) => (
                <th
                  key={j}
                  className="px-2 py-2 font-medium border-b border-slate-200 text-center min-w-[58px]"
                  style={j === currentColIdx
                    ? { background: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }
                    : { background: '#f8fafc', color: '#64748b' }}
                >
                  {h}
                  {colUnit && <span className="font-normal block text-[10px] text-slate-400">{colUnit}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i}>
                <td
                  className="sticky left-0 z-10 px-3 py-1 border-r border-b border-slate-200 font-mono whitespace-nowrap"
                  style={i === currentECPRow
                    ? { background: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }
                    : { background: '#f8fafc', color: '#475569' }}
                >
                  {(row.ecp / 100000).toFixed(1)}L
                </td>
                {row.cells.map((cell, j) => {
                  const v = cell.diff;
                  const s = parityStyle(v);
                  const isCurrent = i === currentECPRow && j === currentColIdx;
                  return (
                    <td
                      key={j}
                      className="px-1.5 py-1 text-center font-mono border border-slate-100 cursor-default"
                      style={{
                        ...s,
                        ...(isCurrent ? { outline: '2px solid #1e293b', outlineOffset: '-2px' } : {}),
                      }}
                      onMouseMove={e => setTooltip({
                        x: e.clientX, y: e.clientY,
                        evEAP: cell.evEAP, dslEAP: cell.dslEAP, diff: v,
                        label: `ECP ₹${(row.ecp / 100000).toFixed(1)}L · ${colHeaders[j]}${colUnit ? ' ' + colUnit : ''}`,
                      })}
                    >
                      {v > 0 ? '+' : ''}{v.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {[
          { bg: '#15803d', label: 'EV cheaper' },
          { bg: '#ef4444', label: 'DSL cheaper' },
        ].map(({ bg, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{ background: bg }} />
            {label}
          </span>
        ))}
        <span className="text-[10px] text-slate-400">
          Hover any cell to see EV vs DSL EAP breakdown · Bold border = your current inputs · Values in ₹/km
        </span>
      </div>
    </div>
  );
}

export default function TCOAnalysis() {
  const [busType, setBusType] = useState('EV');
  const [dataSource, setDataSource] = useState('manual'); // 'manual' | 'excel'
  const [valueMode, setValueMode] = useState('demo');     // 'demo' | 'custom' (EV tab)
  const [dslValueMode, setDslValueMode] = useState('demo'); // DSL tab
  const [params, setParams] = useState(EV_DEFAULTS);       // EV params
  const [dslParams, setDslParams] = useState(DSL_DEFAULTS); // DSL params (separate!)
  const [inputTab, setInputTab] = useState('EV');           // 'EV' | 'DSL'
  const [results, setResults] = useState(null);
  const [dslResults, setDslResults] = useState(null);
  const [sensitivity, setSensitivity] = useState(null);
  const [activeModal, setActiveModal] = useState(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadedFile, setUploadedFile] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [parityData, setParityData] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileRef = useRef();
  const resultsRef = useRef(null);

  // Auto-scroll to results after calculation
  useEffect(() => {
    if (results && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [results]);

  // PDF export — expand accordions, print, then restore
  const handleDownloadPDF = () => {
    setIsPrinting(true);
    // Two rAF frames to ensure React re-renders with expanded accordions
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };
  useEffect(() => {
    const reset = () => setIsPrinting(false);
    window.addEventListener('afterprint', reset);
    return () => window.removeEventListener('afterprint', reset);
  }, []);

  const handleBusTypeChange = (type) => {
    setBusType(type);
    setResults(null);
    setDslResults(null);
    setSensitivity(null);
    setParityData(null);
  };

  const setParam = (key, value) => {
    setValueMode('custom');
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const setDslParam = (key, value) => {
    setDslValueMode('custom');
    setDslParams(prev => ({ ...prev, [key]: value }));
  };

  const handleCalculate = () => {
    setIsCalculating(true);
    setTimeout(() => {
      const evP  = { ...params,    busType: 'EV'  };
      const dslP = { ...dslParams, busType: 'DSL' };
      setResults(buildLifecycle(evP));
      setDslResults(buildLifecycle(dslP));
      setSensitivity(calcSensitivity(evP));
      // Parity now uses the ACTUAL DSL params the user entered, not hardcoded defaults
      setParityData(calcParityTables(evP, dslP));
      setIsCalculating(false);
    }, 400);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const targetType = inputTab; // upload goes into whichever tab is active
    setUploadError('');
    setUploadedFile(file.name);
    setIsUploading(true);
    setUploadSuccess(false);
    parseExcel(file, targetType, (parsed, err) => {
      setTimeout(() => {
        setIsUploading(false);
        if (err) { setUploadError(err); return; }
        if (targetType === 'EV') {
          setParams(prev => ({ ...prev, ...parsed, busType: 'EV' }));
          setValueMode('custom');
        } else {
          setDslParams(prev => ({ ...prev, ...parsed, busType: 'DSL' }));
          setDslValueMode('custom');
        }
        setUploadSuccess(true);
        setTimeout(() => setUploadSuccess(false), 2500);
      }, 700);
    });
    e.target.value = '';
  };

  const isDemo    = valueMode    === 'demo';
  const isDslDemo = dslValueMode === 'demo';
  const p   = field => params[field]    ?? '';
  const dp  = field => dslParams[field] ?? '';

  const years = params.busLife || 6;
  const yearLabels = Array.from({ length: years }, (_, i) => `Yr ${i + 1}`);

  // Parity insight derivations (only meaningful when parityData is present)
  let effColIdx = 0, kmColIdx = 0, maxParityECP = null, minParityKm = null;
  if (parityData) {
    effColIdx = EFF_COLS.reduce((best, e, i) =>
      Math.abs(e - params.fuelEfficiency) < Math.abs(EFF_COLS[best] - params.fuelEfficiency) ? i : best, 0);
    kmColIdx = KM_COLS.reduce((best, k, i) =>
      Math.abs(k - params.kmPerDay) < Math.abs(KM_COLS[best] - params.kmPerDay) ? i : best, 0);
    for (let i = parityData.table1.length - 1; i >= 0; i--) {
      if (parityData.table1[i].cells[effColIdx].diff < 0) { maxParityECP = parityData.table1[i].ecp; break; }
    }
    for (let j = 0; j < KM_COLS.length; j++) {
      if (parityData.table2[5].cells[j].diff < 0) { minParityKm = KM_COLS[j]; break; }
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4 no-print">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-slate-800 font-bold text-lg">TCO Cost Analysis</h1>
            <p className="text-slate-400 text-xs mt-0.5">Total Cost of Ownership — lifecycle & sensitivity modelling</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Bus type toggle */}
            <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs">
              {['DSL', 'EV'].map(t => (
                <button
                  key={t}
                  onClick={() => handleBusTypeChange(t)}
                  className={cn(
                    'px-4 py-2 font-medium transition-colors',
                    busType === t ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                  )}
                >
                  {t === 'EV' ? '⚡ EV Bus' : '⛽ Diesel Bus'}
                </button>
              ))}
            </div>
            {/* Data source toggle */}
            <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs">
              {[['manual', 'Manual'], ['excel', 'Upload Excel']].map(([m, l]) => (
                <button
                  key={m}
                  onClick={() => setDataSource(m)}
                  className={cn(
                    'px-3 py-2 font-medium transition-colors flex items-center gap-1.5',
                    dataSource === m ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
                  )}
                >
                  {m === 'excel' && <FileSpreadsheet size={12} />}
                  {l}
                </button>
              ))}
            </div>
            {/* Download PDF — only shown when there are results */}
            {results && (
              <button
                onClick={handleDownloadPDF}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm"
              >
                <Download size={13} />
                Download PDF
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 p-6 print-layout">
        {/* ── Left: Input Panel ─────────────────────────────────────────── */}
        <div className="w-full lg:w-80 flex-shrink-0 space-y-4 no-print">

          {/* ── EV / DSL Tab Selector ── */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-2">
              {[
                { id: 'EV',  label: '⚡ EV Parameters',  accent: 'bg-blue-600' },
                { id: 'DSL', label: '⛽ Diesel Parameters', accent: 'bg-orange-500' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setInputTab(tab.id)}
                  className={cn(
                    'py-3 text-sm font-semibold transition-all',
                    inputTab === tab.id
                      ? tab.id === 'EV' ? 'bg-blue-600 text-white' : 'bg-orange-500 text-white'
                      : 'text-slate-500 hover:bg-slate-50'
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
              <p className="text-[11px] text-slate-500">
                Fill both tabs, then hit <strong>Calculate TCO</strong> to compare.
                {inputTab === 'EV'
                  ? ' You are editing EV parameters.'
                  : ' You are editing Diesel parameters.'}
              </p>
            </div>
          </div>

          {/* ── Value mode radio (tab-aware) ── */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-3">
              {inputTab === 'EV' ? 'EV input values' : 'Diesel input values'}
            </p>
            <div className="space-y-2">
              {[
                { id: 'demo',   label: 'Use demo values',   desc: 'Pre-filled example values from the TCO model' },
                { id: 'custom', label: 'Enter my own data', desc: 'Edit fields below or upload your Excel' },
              ].map(opt => {
                const activeMode = inputTab === 'EV' ? valueMode : dslValueMode;
                const setMode    = inputTab === 'EV' ? setValueMode : setDslValueMode;
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                      activeMode === opt.id
                        ? opt.id === 'demo' ? 'border-amber-300 bg-amber-50' : 'border-green-300 bg-green-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    <input
                      type="radio"
                      name={`valueMode-${inputTab}`}
                      value={opt.id}
                      checked={activeMode === opt.id}
                      onChange={() => setMode(opt.id)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div>
                      <p className={cn(
                        'text-sm font-medium',
                        activeMode === opt.id
                          ? opt.id === 'demo' ? 'text-amber-700' : 'text-green-700'
                          : 'text-slate-600'
                      )}>{opt.label}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            {(inputTab === 'EV' ? isDemo : isDslDemo) && (
              <p className="text-amber-600 text-[11px] mt-3 leading-relaxed">
                Values in grey are example defaults. Switch to &ldquo;Enter my own data&rdquo; to use real numbers.
              </p>
            )}
          </div>

          {/* Excel upload */}
          {dataSource === 'excel' && (
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-700 mb-1">
                Upload TCO Excel — {inputTab === 'EV' ? 'EV sheet' : 'Diesel sheet'}
              </p>
              <p className="text-xs text-slate-400 mb-3">
                Values will be loaded into the <strong>{inputTab === 'EV' ? 'EV' : 'Diesel'}</strong> parameters tab.
              </p>
              <button
                onClick={() => fileRef.current.click()}
                disabled={isUploading}
                className={cn(
                  'w-full flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-5 text-sm transition-colors',
                  isUploading
                    ? 'border-blue-300 text-blue-500 cursor-wait'
                    : 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600'
                )}
              >
                {isUploading ? <Spinner /> : <Upload size={18} />}
                {isUploading ? 'Parsing Excel…' : (uploadedFile || 'Choose .xlsx file')}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
              {uploadError && <p className="text-red-500 text-xs mt-2">{uploadError}</p>}
              {uploadSuccess && (
                <p className="text-green-600 text-xs mt-2 font-medium animate-pulse">
                  ✓ {inputTab} values updated from Excel — review below then click Calculate
                </p>
              )}
            </div>
          )}

          {/* ── Input cards — shimmer wrapper ── */}
          <div className={cn('space-y-4 relative transition-opacity duration-300', isUploading && 'opacity-50 pointer-events-none')}>
            {isUploading && (
              <div className="absolute inset-0 z-10 overflow-hidden rounded-xl pointer-events-none">
                <div
                  className="absolute inset-y-0 w-1/2 animate-shimmer"
                  style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.75) 50%, transparent 100%)' }}
                />
              </div>
            )}

            <div className={cn('space-y-4 transition-all duration-500', uploadSuccess && 'ring-2 ring-green-400 ring-offset-2 rounded-xl')}>

              {/* ── EV Inputs ── */}
              {inputTab === 'EV' && (<>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className={cn('text-sm font-semibold mb-3', isDemo ? 'text-slate-400' : 'text-slate-700')}>Operation Parameters</p>
                  <div className="space-y-3">
                    <InputField isDemo={isDemo} label="Avg km per day" unit="km/day" value={p('kmPerDay')} onChange={v => setParam('kmPerDay', v)} step="10" min="1" note="Required" />
                    <InputField isDemo={isDemo} label="Operational days per year" unit="days/yr" value={p('operationalDays')} onChange={v => setParam('operationalDays', v)} step="1" min="1" />
                    <InputField isDemo={isDemo} label="TCO analysis period" unit="years" value={p('busLife')} onChange={v => setParam('busLife', v)} step="1" min="1" note="Years of TCO to model" />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className={cn('text-sm font-semibold mb-3', isDemo ? 'text-slate-400' : 'text-slate-700')}>Vehicle Cost & Finance</p>
                  <div className="space-y-3">
                    <InputField isDemo={isDemo} label="ECP (Retail price + taxes)" unit="₹" value={p('ecp')} onChange={v => setParam('ecp', v)} note="Required" />
                    <InputField isDemo={isDemo} label="Loan share" unit="fraction" value={p('loanShare')} onChange={v => setParam('loanShare', v)} step="0.01" min="0" max="1" />
                    <InputField isDemo={isDemo} label="Interest rate" unit="fraction" value={p('interestRate')} onChange={v => setParam('interestRate', v)} step="0.01" min="0" />
                    <InputField isDemo={isDemo} label="Loan tenure" unit="years" value={p('loanTenure')} onChange={v => setParam('loanTenure', v)} step="1" min="1" />
                    <InputField isDemo={isDemo} label="Bus salvage value" unit="fraction" value={p('busSalvage')} onChange={v => setParam('busSalvage', v)} step="0.01" min="0" />
                    <InputField isDemo={isDemo} label="Insurance rate (annual)" unit="fraction" value={p('insuranceRate')} onChange={v => setParam('insuranceRate', v)} step="0.001" min="0" />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className={cn('text-sm font-semibold mb-1', isDemo ? 'text-slate-400' : 'text-slate-700')}>Energy Cost</p>
                  <p className="text-xs text-slate-400 mb-3">kWh/km is vehicle-side efficiency. Grid draw accounts for charger &amp; transformer losses.</p>
                  <div className="space-y-3">
                    <InputField isDemo={isDemo} label="Vehicle efficiency" unit="kWh/km" value={p('fuelEfficiency')} onChange={v => setParam('fuelEfficiency', v)} step="0.01" note="Required" />
                    <InputField isDemo={isDemo} label="Electricity tariff" unit="₹/kWh" value={p('fuelTariff')} onChange={v => setParam('fuelTariff', v)} step="0.5" note="Required" />
                    <InputField isDemo={isDemo} label="YoY escalation" unit="fraction" value={p('fuelYoY')} onChange={v => setParam('fuelYoY', v)} step="0.005" />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <p className={cn('text-sm font-semibold mb-3', isDemo ? 'text-slate-400' : 'text-slate-700')}>Variable Costs</p>
                  <div className="space-y-3">
                    <InputField isDemo={isDemo} label="Manpower cost" unit="₹/km" value={p('manpowerPerKm')} onChange={v => setParam('manpowerPerKm', v)} step="0.1" />
                    <InputField isDemo={isDemo} label="Manpower YoY" unit="fraction" value={p('manpowerYoY')} onChange={v => setParam('manpowerYoY', v)} step="0.005" />
                    <InputField isDemo={isDemo} label="Bus AMC cost" unit="₹/km" value={p('amcPerKm')} onChange={v => setParam('amcPerKm', v)} step="0.1" />
                    <InputField isDemo={isDemo} label="AMC YoY" unit="fraction" value={p('amcYoY')} onChange={v => setParam('amcYoY', v)} step="0.005" />
                    <InputField isDemo={isDemo} label="Other Misc cost" unit="₹/km" value={p('miscPerKm')} onChange={v => setParam('miscPerKm', v)} step="0.1" />
                    <InputField isDemo={isDemo} label="Misc YoY" unit="fraction" value={p('miscYoY')} onChange={v => setParam('miscYoY', v)} step="0.005" />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <button onClick={() => setShowAdvanced(s => !s)} className="flex items-center gap-2 w-full text-left">
                    <p className={cn('text-sm font-semibold flex-1', isDemo ? 'text-slate-400' : 'text-slate-700')}>Charging Infrastructure</p>
                    {showAdvanced ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                  </button>
                  {showAdvanced && (
                    <div className="mt-3 space-y-3">
                      <InputField isDemo={isDemo} label="Charger cost per bus" unit="₹" value={p('chargerCostPerBus')} onChange={v => setParam('chargerCostPerBus', v)} note="Total charger+grid infra per bus" />
                      <InputField isDemo={isDemo} label="Fast charger cost per bus" unit="₹" value={p('fastChargerCostPerBus')} onChange={v => setParam('fastChargerCostPerBus', v)} note="Used for AMC calculation" />
                      <InputField isDemo={isDemo} label="Charger financing rate (WACC)" unit="fraction" value={p('chargerFinRate')} onChange={v => setParam('chargerFinRate', v)} step="0.01" />
                      <InputField isDemo={isDemo} label="Charger life" unit="years" value={p('chargerLife')} onChange={v => setParam('chargerLife', v)} step="1" />
                      <InputField isDemo={isDemo} label="Charger AMC rate (from yr 3)" unit="fraction" value={p('chargerAMCRate')} onChange={v => setParam('chargerAMCRate', v)} step="0.01" />
                      <InputField isDemo={isDemo} label="Charger efficiency" unit="fraction" value={p('chargerEfficiency')} onChange={v => setParam('chargerEfficiency', v)} step="0.01" />
                      <InputField isDemo={isDemo} label="Transformer/switchyard loss" unit="fraction" value={p('transformerLoss')} onChange={v => setParam('transformerLoss', v)} step="0.01" />
                    </div>
                  )}
                </div>
              </>)}

              {/* ── DSL Inputs ── */}
              {inputTab === 'DSL' && (<>
                <div className="bg-white rounded-xl border border-orange-200 p-4">
                  <p className={cn('text-sm font-semibold mb-3', isDslDemo ? 'text-slate-400' : 'text-slate-700')}>Operation Parameters</p>
                  <div className="space-y-3">
                    <InputField isDemo={isDslDemo} label="Avg km per day" unit="km/day" value={dp('kmPerDay')} onChange={v => setDslParam('kmPerDay', v)} step="10" min="1" note="Required" />
                    <InputField isDemo={isDslDemo} label="Operational days per year" unit="days/yr" value={dp('operationalDays')} onChange={v => setDslParam('operationalDays', v)} step="1" min="1" />
                    <InputField isDemo={isDslDemo} label="TCO analysis period" unit="years" value={dp('busLife')} onChange={v => setDslParam('busLife', v)} step="1" min="1" note="Should match EV period for fair comparison" />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-orange-200 p-4">
                  <p className={cn('text-sm font-semibold mb-3', isDslDemo ? 'text-slate-400' : 'text-slate-700')}>Vehicle Cost & Finance</p>
                  <div className="space-y-3">
                    <InputField isDemo={isDslDemo} label="ECP (Retail price + taxes)" unit="₹" value={dp('ecp')} onChange={v => setDslParam('ecp', v)} note="Required" />
                    <InputField isDemo={isDslDemo} label="Loan share" unit="fraction" value={dp('loanShare')} onChange={v => setDslParam('loanShare', v)} step="0.01" min="0" max="1" />
                    <InputField isDemo={isDslDemo} label="Interest rate" unit="fraction" value={dp('interestRate')} onChange={v => setDslParam('interestRate', v)} step="0.01" min="0" />
                    <InputField isDemo={isDslDemo} label="Loan tenure" unit="years" value={dp('loanTenure')} onChange={v => setDslParam('loanTenure', v)} step="1" min="1" />
                    <InputField isDemo={isDslDemo} label="Bus salvage value" unit="fraction" value={dp('busSalvage')} onChange={v => setDslParam('busSalvage', v)} step="0.01" min="0" />
                    <InputField isDemo={isDslDemo} label="Insurance rate (annual)" unit="fraction" value={dp('insuranceRate')} onChange={v => setDslParam('insuranceRate', v)} step="0.001" min="0" />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-orange-200 p-4">
                  <p className={cn('text-sm font-semibold mb-1', isDslDemo ? 'text-slate-400' : 'text-slate-700')}>Fuel Cost</p>
                  <p className="text-xs text-slate-400 mb-3">Fuel economy in km/L. Tariff in ₹ per litre.</p>
                  <div className="space-y-3">
                    <InputField isDemo={isDslDemo} label="Fuel economy" unit="km/L" value={dp('fuelEfficiency')} onChange={v => setDslParam('fuelEfficiency', v)} step="0.1" note="Required" />
                    <InputField isDemo={isDslDemo} label="Diesel price" unit="₹/L" value={dp('fuelTariff')} onChange={v => setDslParam('fuelTariff', v)} step="0.5" note="Required" />
                    <InputField isDemo={isDslDemo} label="YoY escalation" unit="fraction" value={dp('fuelYoY')} onChange={v => setDslParam('fuelYoY', v)} step="0.005" />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-orange-200 p-4">
                  <p className={cn('text-sm font-semibold mb-3', isDslDemo ? 'text-slate-400' : 'text-slate-700')}>Variable Costs</p>
                  <div className="space-y-3">
                    <InputField isDemo={isDslDemo} label="Manpower cost" unit="₹/km" value={dp('manpowerPerKm')} onChange={v => setDslParam('manpowerPerKm', v)} step="0.1" />
                    <InputField isDemo={isDslDemo} label="Manpower YoY" unit="fraction" value={dp('manpowerYoY')} onChange={v => setDslParam('manpowerYoY', v)} step="0.005" />
                    <InputField isDemo={isDslDemo} label="Bus AMC cost" unit="₹/km" value={dp('amcPerKm')} onChange={v => setDslParam('amcPerKm', v)} step="0.1" />
                    <InputField isDemo={isDslDemo} label="AMC YoY" unit="fraction" value={dp('amcYoY')} onChange={v => setDslParam('amcYoY', v)} step="0.005" />
                    <InputField isDemo={isDslDemo} label="Other Misc cost" unit="₹/km" value={dp('miscPerKm')} onChange={v => setDslParam('miscPerKm', v)} step="0.1" />
                    <InputField isDemo={isDslDemo} label="Misc YoY" unit="fraction" value={dp('miscYoY')} onChange={v => setDslParam('miscYoY', v)} step="0.005" />
                  </div>
                </div>
              </>)}

            </div>{/* end success-flash wrapper */}
          </div>{/* end shimmer wrapper */}

          {/* Calculate button */}
          <button
            onClick={handleCalculate}
            disabled={isCalculating}
            className={cn(
              'w-full text-white font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition-all shadow-sm',
              isCalculating ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700 active:scale-[0.98]'
            )}
          >
            {isCalculating ? <><Spinner /> Calculating…</> : <><Calculator size={16} /> Calculate EV vs DSL</>}
          </button>
        </div>

        {/* ── Right: Output Panel ───────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-6 print-full">
          {/* Calculating overlay */}
          {isCalculating && (
            <div className="bg-white rounded-xl border border-blue-200 p-10 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <Spinner />
              </div>
              <p className="text-slate-700 font-semibold mb-1">Calculating TCO…</p>
              <p className="text-slate-400 text-sm">Running lifecycle model and sensitivity analysis</p>
            </div>
          )}

          {!results && !isCalculating && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center justify-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                <BarChart2 size={24} className="text-blue-400" />
              </div>
              <p className="text-slate-600 font-medium mb-1">Configure inputs and click Calculate</p>
              <p className="text-slate-400 text-sm max-w-xs">
                Fill in the parameters on the left (or upload an Excel file) and hit Calculate to see the full TCO analysis.
              </p>
            </div>
          )}

          {results && !isCalculating && (
            <div ref={resultsRef} className="space-y-4 scroll-mt-6">

              {/* ── Print-only report header ── */}
              <div className="hidden print:block mb-2 pb-4 border-b border-slate-200">
                <h1 className="text-xl font-bold text-slate-800">TCO Analysis Report — {busType} Bus</h1>
                <p className="text-slate-500 text-sm mt-1">
                  Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                  &ensp;·&ensp;ECP ₹{(params.ecp / 100000).toFixed(1)}L
                  &ensp;·&ensp;{params.kmPerDay} km/day
                  &ensp;·&ensp;{params.operationalDays} days/yr
                  &ensp;·&ensp;{params.busLife}-yr analysis period
                  &ensp;·&ensp;{busType === 'EV' ? `${params.fuelEfficiency} kWh/km · ₹${params.fuelTariff}/kWh` : `${params.fuelEfficiency} km/L · ₹${params.fuelTariff}/L`}
                </p>
              </div>

              {/* ── EV vs DSL Comparison Summary ─── */}
              {dslResults && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                    <TrendingUp size={14} className="text-blue-600" />
                    <p className="text-slate-800 font-semibold text-sm">EV vs Diesel — Cost Comparison</p>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-slate-100">
                    <div className="p-4 text-center">
                      <p className="text-[11px] text-blue-500 font-semibold uppercase tracking-wide mb-1">⚡ EV Total EAP</p>
                      <p className="text-2xl font-bold text-blue-700">₹{results.totalEAP.toFixed(2)}</p>
                      <p className="text-slate-400 text-xs">/km annualized</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-[11px] text-orange-500 font-semibold uppercase tracking-wide mb-1">⛽ Diesel Total EAP</p>
                      <p className="text-2xl font-bold text-orange-700">₹{dslResults.totalEAP.toFixed(2)}</p>
                      <p className="text-slate-400 text-xs">/km annualized</p>
                    </div>
                    <div className={cn('p-4 text-center', results.totalEAP < dslResults.totalEAP ? 'bg-green-50' : 'bg-red-50')}>
                      <p className={cn('text-[11px] font-semibold uppercase tracking-wide mb-1', results.totalEAP < dslResults.totalEAP ? 'text-green-600' : 'text-red-600')}>
                        {results.totalEAP < dslResults.totalEAP ? '✓ EV Saves' : '✗ EV Costs More'}
                      </p>
                      <p className={cn('text-2xl font-bold', results.totalEAP < dslResults.totalEAP ? 'text-green-700' : 'text-red-700')}>
                        ₹{Math.abs(results.totalEAP - dslResults.totalEAP).toFixed(2)}
                      </p>
                      <p className={cn('text-xs', results.totalEAP < dslResults.totalEAP ? 'text-green-500' : 'text-red-500')}>
                        /km vs diesel
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Summary Cards ─── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: '⚡ EV EAP', value: `₹${results.totalEAP.toFixed(2)}/km`, sub: 'Equiv. annualized cost', color: 'text-blue-700' },
                  { label: '⛽ DSL EAP', value: dslResults ? `₹${dslResults.totalEAP.toFixed(2)}/km` : 'Run calc.', sub: 'Equiv. annualized cost', color: 'text-orange-700' },
                  { label: 'Annual km', value: fmt(results.annualKm), sub: 'km/year per bus', color: 'text-slate-800' },
                  { label: 'EV Fuel share', value: `${((results.eapPerRow?.['Fuel Cost'] || 0) / results.totalEAP * 100).toFixed(1)}%`, sub: 'of EV total EAP', color: 'text-slate-800' },
                ].map(c => (
                  <div key={c.label} className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-slate-400 text-xs mb-1">{c.label}</p>
                    <p className={cn('font-bold text-lg leading-tight', c.color)}>{c.value}</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* ── Accordion 1: Parity Analysis ── */}
              {parityData && (
                <Accordion
                  title="Parity Analysis — EV vs DSL Breakeven"
                  icon={TrendingUp}
                  defaultOpen={true}
                  forceOpen={isPrinting}
                  badge={<InfoButton onClick={() => setActiveModal('parity')} />}
                >
                  {/* Insight callout cards */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <p className="text-[11px] font-semibold text-green-600 uppercase tracking-wide mb-1">
                        Max EV price to quote
                      </p>
                      <p className="text-2xl font-bold text-green-800">
                        {maxParityECP != null ? `₹${(maxParityECP / 100000).toFixed(1)}L` : 'N/A'}
                      </p>
                      <p className="text-green-600 text-[11px] mt-1">
                        At {EFF_COLS[effColIdx]} kWh/km — EV still cheaper than DSL
                      </p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide mb-1">
                        Min km/day to break even
                      </p>
                      <p className="text-2xl font-bold text-blue-800">
                        {minParityKm != null ? `${minParityKm} km/day` : 'Always profitable'}
                      </p>
                      <p className="text-blue-600 text-[11px] mt-1">
                        At ₹{(params.ecp / 100000).toFixed(1)}L ECP — minimum daily usage needed
                      </p>
                    </div>
                  </div>

                  {/* Table 1: Efficiency vs ECP */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <ParityHeatmap
                      title="Table 1 — kWh/km (efficiency) vs EV ECP"
                      data={parityData.table1}
                      colHeaders={EFF_COLS.map(e => e.toFixed(1))}
                      colUnit="kWh/km"
                      currentECPRow={5}
                      currentColIdx={effColIdx}
                    />
                  </div>

                  {/* Table 2: km/day vs ECP */}
                  <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <ParityHeatmap
                      title="Table 2 — km/day vs EV ECP"
                      data={parityData.table2}
                      colHeaders={KM_COLS.map(k => String(k))}
                      colUnit="km/day"
                      currentECPRow={5}
                      currentColIdx={kmColIdx}
                    />
                  </div>
                </Accordion>
              )}

              {/* ── Accordion 2: Lifecycle & Sensitivity ── */}
              <div className="print-page-break">
              <Accordion
                title="Detailed Lifecycle & Sensitivity Analysis (EV)"
                icon={BarChart2}
                defaultOpen={false}
                forceOpen={isPrinting}
              >
                {/* Lifecycle Cost Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <SectionHeader icon={TrendingUp} title="⚡ EV Lifecycle Cost Mapping (₹ Lakh)">
                      <InfoButton onClick={() => setActiveModal('lifecycle')} />
                    </SectionHeader>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-4 py-2.5 text-slate-500 font-medium w-52">Cost Category</th>
                          <th className="text-right px-2 py-2.5 text-slate-500 font-medium">YoY</th>
                          {yearLabels.map(y => (
                            <th key={y} className="text-right px-2 py-2.5 text-slate-500 font-medium">{y}</th>
                          ))}
                          <th className="text-right px-4 py-2.5 text-slate-600 font-semibold bg-blue-50">EAP ₹/km</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ROW_ORDER.map(label => {
                          const costs = results.rows[label];
                          if (!costs) return null;
                          const allZero = costs.every(v => v === 0);
                          if (allZero && label === 'Battery replacement cost') return null;
                          if (allZero && (label === 'Charging Infra Capitalization Cost' || label === 'Charger AMC Cost') && busType === 'DSL') return null;

                          const yoy = label === 'Fuel Cost' ? params.fuelYoY
                            : label.includes('Manpower') ? params.manpowerYoY
                            : label.includes('AMC Cost (') ? params.amcYoY
                            : label.includes('Misc') ? params.miscYoY
                            : null;

                          const eap = results.eapPerRow[label];
                          return (
                            <tr key={label} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className={cn('px-4 py-2 font-medium', ROW_COLOR[label] || 'text-slate-600')}>{label}</td>
                              <td className="px-2 py-2 text-right text-slate-400">
                                {yoy ? `${(yoy * 100).toFixed(1)}%` : '—'}
                              </td>
                              {costs.map((v, i) => (
                                <td key={i} className={cn('px-2 py-2 text-right font-mono', v < 0 ? 'text-green-600' : 'text-slate-700')}>
                                  {fmtL(v)}
                                </td>
                              ))}
                              <td className="px-4 py-2 text-right font-semibold text-blue-700 bg-blue-50/50 font-mono">
                                {eap < 0.01 ? '—' : eap.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-800 text-white">
                          <td className="px-4 py-3 font-semibold" colSpan={2}>Total per Year (₹ Lakh)</td>
                          {Array.from({ length: years }, (_, i) => {
                            const total = ROW_ORDER.reduce((s, label) => s + (results.rows[label]?.[i] || 0), 0);
                            return (
                              <td key={i} className="px-2 py-3 text-right font-mono font-semibold">
                                {fmtL(total)}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-right font-bold font-mono bg-blue-700">
                            {results.totalEAP.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100">
                    <p className="text-slate-400 text-[11px]">
                      Values in ₹ Lakh · EAP = Equivalent Annualized ₹/km (NPV basis, 10% discount rate) · Green = revenue / salvage inflows
                    </p>
                  </div>
                </div>

                {/* Per-km Analysis Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <SectionHeader icon={BarChart2} title="Per-km Cost Breakdown (EAP ₹/km)">
                      <InfoButton onClick={() => setActiveModal('perkm')} />
                    </SectionHeader>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="text-left px-5 py-2.5 text-slate-500 font-medium">Cost Parameter</th>
                          <th className="text-right px-5 py-2.5 text-slate-500 font-medium">EAP (₹/km)</th>
                          <th className="text-right px-5 py-2.5 text-slate-500 font-medium">Share</th>
                          <th className="px-5 py-2.5 text-slate-500 font-medium">Contribution</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ROW_ORDER.map(label => {
                          const eap = results.eapPerRow[label];
                          if (!eap || Math.abs(eap) < 0.001) return null;
                          if (label === 'Battery replacement cost') return null;
                          if ((label === 'Charging Infra Capitalization Cost' || label === 'Charger AMC Cost') && busType === 'DSL') return null;
                          const share = eap / results.totalEAP;
                          return (
                            <tr key={label} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className={cn('px-5 py-2.5 font-medium', ROW_COLOR[label] || 'text-slate-600')}>
                                {label}
                              </td>
                              <td className="px-5 py-2.5 text-right font-mono text-slate-800">
                                {eap.toFixed(2)}
                              </td>
                              <td className="px-5 py-2.5 text-right text-slate-500">
                                {(share * 100).toFixed(1)}%
                              </td>
                              <td className="px-5 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-blue-500 transition-all"
                                      style={{ width: `${Math.min(share * 100 * 3, 100)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-blue-600 text-white">
                          <td className="px-5 py-3 font-bold">Total EAP</td>
                          <td className="px-5 py-3 text-right font-bold font-mono">{results.totalEAP.toFixed(2)}</td>
                          <td className="px-5 py-3 text-right">100%</td>
                          <td className="px-5 py-3" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Sensitivity Chart */}
                {sensitivity && (
                  <div className="bg-white rounded-xl border border-slate-200 p-5">
                    <SectionHeader icon={Zap} title="Sensitivity Analysis (±10% parameter change → % EAP impact)">
                      <InfoButton onClick={() => setActiveModal('sensitivity')} />
                    </SectionHeader>

                    <div className="mb-4">
                      <ResponsiveContainer width="100%" height={sensitivity.length * 52 + 40}>
                        <BarChart
                          layout="vertical"
                          data={sensitivity.map(s => ({
                            label: s.label,
                            up: parseFloat((s.up * 100).toFixed(2)),
                            down: parseFloat((s.down * 100).toFixed(2)),
                          }))}
                          margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis
                            type="number"
                            tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={140}
                            tick={{ fontSize: 11, fill: '#475569' }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            formatter={(v, name) => [`${v > 0 ? '+' : ''}${v.toFixed(2)}%`, name === 'up' ? '+10% change' : '−10% change']}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          />
                          <ReferenceLine x={0} stroke="#cbd5e1" />
                          <Bar dataKey="up" name="up" radius={[0, 3, 3, 0]}>
                            {sensitivity.map((s, i) => (
                              <Cell key={i} fill={s.up > 0 ? '#3b82f6' : '#22c55e'} />
                            ))}
                          </Bar>
                          <Bar dataKey="down" name="down" radius={[3, 0, 0, 3]}>
                            {sensitivity.map((s, i) => (
                              <Cell key={i} fill={s.down < 0 ? '#94a3b8' : '#f59e0b'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border border-slate-100 rounded-lg">
                            <th className="text-left px-4 py-2 text-slate-500 font-medium">Parameter</th>
                            <th className="text-right px-4 py-2 text-blue-600 font-medium">+10% impact</th>
                            <th className="text-right px-4 py-2 text-slate-500 font-medium">−10% impact</th>
                            <th className="text-right px-4 py-2 text-slate-500 font-medium">Range (pp)</th>
                            <th className="text-left px-4 py-2 text-slate-500 font-medium">Risk level</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sensitivity.map((s, i) => {
                            const range = Math.abs(s.up - s.down) * 100;
                            const risk = range > 10 ? 'High' : range > 3 ? 'Medium' : 'Low';
                            const riskColor = risk === 'High' ? 'text-red-600 bg-red-50' : risk === 'Medium' ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50';
                            return (
                              <tr key={s.label} className={cn('border-b border-slate-50', i === 0 && 'bg-blue-50/30')}>
                                <td className="px-4 py-2 text-slate-700 font-medium">
                                  {i === 0 && <span className="text-[10px] text-blue-500 font-semibold mr-1">↑ Most</span>}
                                  {s.label}
                                </td>
                                <td className={cn('px-4 py-2 text-right font-mono', s.up > 0 ? 'text-red-600' : 'text-green-600')}>
                                  {s.up > 0 ? '+' : ''}{(s.up * 100).toFixed(2)}%
                                </td>
                                <td className={cn('px-4 py-2 text-right font-mono', s.down < 0 ? 'text-green-600' : 'text-red-600')}>
                                  {s.down > 0 ? '+' : ''}{(s.down * 100).toFixed(2)}%
                                </td>
                                <td className="px-4 py-2 text-right font-mono text-slate-600">
                                  {range.toFixed(2)}pp
                                </td>
                                <td className="px-4 py-2">
                                  <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', riskColor)}>
                                    {risk}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-3">
                      Each parameter varied ±10% independently. Impact shown as % change in Total EAP from base case of ₹{results.totalEAP.toFixed(2)}/km.
                    </p>
                  </div>
                )}
              </Accordion>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── Info Modals ─────────────────────────────────────────────────────── */}
      {activeModal === 'parity' && (
        <InfoModal title="Parity Analysis — How to use" onClose={() => setActiveModal(null)}>
          {PARITY_INFO}
        </InfoModal>
      )}
      {activeModal === 'lifecycle' && (
        <InfoModal title="Lifecycle Cost Table — How it works" onClose={() => setActiveModal(null)}>
          {LIFECYCLE_INFO}
        </InfoModal>
      )}
      {activeModal === 'perkm' && (
        <InfoModal title="Per-km Cost Breakdown — How it works" onClose={() => setActiveModal(null)}>
          {PERKM_INFO}
        </InfoModal>
      )}
      {activeModal === 'sensitivity' && (
        <InfoModal title="Sensitivity Analysis — How it works" onClose={() => setActiveModal(null)}>
          {SENSITIVITY_INFO}
        </InfoModal>
      )}
    </div>
  );
}
