import { useState, useEffect, useRef } from 'react';
import {
  FileText, AlertTriangle, CheckCircle, Clock,
  TrendingUp, TrendingDown, Download, RefreshCw,
  IndianRupee, Truck, Activity, XCircle,
  Settings2, X,
} from 'lucide-react';
import { cn, formatINR } from '../lib/utils';
import { useFleetConfig } from '../contexts/FleetConfigContext';

/* ── KM Progress Bar ─────────────────────────────────────── */
function KmProgressBar({ actual, contracted }) {
  const pct   = Math.min(100, (actual / contracted) * 100);
  const color = pct >= 90 ? '#22c55e' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{actual} km</span>
        <span className="text-slate-400">of {contracted} km</span>
      </div>
      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <p className="text-right text-xs mt-1" style={{ color }}>{Math.round(pct)}%</p>
    </div>
  );
}

/* ── PSM Badge ───────────────────────────────────────────── */
function PSMBadge({ status, days }) {
  const overdue = status === 'OVERDUE';
  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium',
      overdue ? 'bg-red-50 border-red-200 text-red-600' : 'bg-green-50 border-green-200 text-green-600'
    )}>
      {overdue ? <XCircle size={12} /> : <CheckCircle size={12} />}
      {overdue ? `Overdue ${days}d` : days === 0 ? 'Paid today' : `Paid ${days}d ago`}
    </div>
  );
}

/* ── Compliance Badge ────────────────────────────────────── */
function ComplianceBadge({ pct }) {
  const color = pct >= 90 ? 'bg-green-50 border-green-200 text-green-600'
    : pct >= 70 ? 'bg-amber-50 border-amber-200 text-amber-600'
    : 'bg-red-50 border-red-200 text-red-600';
  return (
    <span className={cn('px-2 py-0.5 rounded-full border text-xs font-medium', color)}>
      {pct}%
    </span>
  );
}

/* ── Summary Card with tooltip ───────────────────────────── */
function SummaryCard({ icon: Icon, label, value, sub, color = 'text-slate-900', bg = 'bg-white', tooltip }) {
  return (
    <div className={cn('relative group border border-slate-200 rounded-xl px-4 py-4 shadow-sm cursor-default', bg)}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-slate-500 text-xs">{label}</p>
        <Icon size={15} className={color} />
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      {sub && <p className="text-slate-400 text-xs mt-1">{sub}</p>}

      {tooltip && (
        <div className="absolute bottom-full left-0 mb-2 w-72 bg-slate-800 text-white text-xs
          p-3.5 rounded-xl shadow-2xl z-50 opacity-0 group-hover:opacity-100
          pointer-events-none transition-opacity duration-150 leading-relaxed">
          {tooltip}
          <div className="absolute top-full left-4 border-4 border-transparent border-t-slate-800" />
        </div>
      )}
    </div>
  );
}

/* ── GCC Settings Modal ──────────────────────────────────── */
function GCCSettingsModal({ onClose }) {
  const { config, updateConfig } = useFleetConfig();
  const [form, setForm] = useState({
    gccRatePerKm:       config.gccRatePerKm,
    gccDriverRatePerKm: config.gccDriverRatePerKm,
    contractedKmPerDay: config.contractedKmPerDay ?? 180,
    paymentCycleDays:   config.paymentCycleDays   ?? 30,
    overspeedThreshold: config.overspeedThreshold,
  });

  function set(k, v) { setForm(p => ({ ...p, [k]: parseFloat(v) || 0 })); }

  const fields = [
    { key: 'gccRatePerKm',       label: 'GCC Rate',               unit: '₹/km',  desc: 'Amount KSRTC/STU pays per km operated' },
    { key: 'gccDriverRatePerKm', label: 'Driver Earnings Rate',    unit: '₹/km',  desc: 'Per-km earnings credited to driver'    },
    { key: 'contractedKmPerDay', label: 'Contracted KM / day',     unit: 'km',    desc: 'Daily km obligation per bus per contract' },
    { key: 'paymentCycleDays',   label: 'Payment Cycle',           unit: 'days',  desc: 'Days after which unpaid PSM is flagged overdue' },
    { key: 'overspeedThreshold', label: 'Overspeed Threshold',     unit: 'km/h',  desc: 'Speed above which an overspeed alert fires' },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p className="font-semibold text-slate-800 text-sm">GCC Control Panel</p>
            <p className="text-slate-400 text-xs mt-0.5">Contract and compliance parameters — changes apply immediately</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {fields.map(({ key, label, unit, desc }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-700 text-sm font-medium">{label}</label>
                <span className="text-slate-400 text-xs">{unit}</span>
              </div>
              <input
                type="number"
                min="0"
                step={unit === '₹/km' ? '0.5' : '1'}
                value={form[key]}
                onChange={e => set(key, e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-slate-400 text-xs mt-1">{desc}</p>
            </div>
          ))}

          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
            Current revenue projection: <strong>{formatINR(form.gccRatePerKm * form.contractedKmPerDay)}</strong> per bus/day
            · <strong>{formatINR(form.gccRatePerKm * form.contractedKmPerDay * config.deployedBusCount * 26)}</strong> fleet/month (est.)
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-all">
              Cancel
            </button>
            <button onClick={() => { updateConfig(form); onClose(); }}
              className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 transition-all">
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── GCC Row ─────────────────────────────────────────────── */
function GCCRow({ row, isExpanded, onToggle, onPaymentToggle }) {
  const { config } = useFleetConfig();
  const { gccRatePerKm, paymentCycleDays } = config;
  const isOverdue = row.psmStatus === 'OVERDUE';

  return (
    <div className={cn(
      'bg-white border rounded-xl overflow-hidden transition-all shadow-sm',
      isExpanded ? 'border-blue-300' : 'border-slate-200 hover:border-slate-300'
    )}>
      <button onClick={onToggle}
        className="w-full grid grid-cols-12 gap-3 items-center px-5 py-4 text-left">
        <div className="col-span-3">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn('w-2 h-2 rounded-full flex-shrink-0',
              isOverdue ? 'bg-red-400' : 'bg-green-400')} />
            <p className="text-slate-800 font-semibold text-sm truncate">{row.busId}</p>
          </div>
          <p className="text-slate-400 text-xs truncate pl-4">{row.routeNo} · {row.routeName}</p>
          <p className="text-slate-400 text-xs pl-4 mt-0.5">{row.driverName}</p>
        </div>

        <div className="col-span-3">
          <KmProgressBar actual={row.kmToday} contracted={row.contractedKm} />
        </div>

        <div className="col-span-1 flex justify-center">
          <ComplianceBadge pct={row.compliancePct} />
        </div>

        <div className="col-span-2 text-right">
          <p className="text-slate-800 font-semibold text-sm">{formatINR(row.revenueToday)}</p>
          <p className="text-slate-400 text-xs">today</p>
        </div>

        <div className="col-span-2 flex justify-center">
          <PSMBadge status={row.psmStatus} days={row.lastPaymentDays} />
        </div>

        <div className="col-span-1 text-right">
          <span className={cn('text-xs px-2 py-0.5 rounded-full border',
            row.fuelType === 'Electric'
              ? 'bg-blue-50 border-blue-200 text-blue-600'
              : 'bg-orange-50 border-orange-200 text-orange-600'
          )}>
            {row.fuelType === 'Electric' ? '⚡ EV' : '🔵 CNG'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-slate-200 px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Contract Details */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium mb-3 uppercase tracking-wide">
              Contract Details
            </p>
            {[
              { label: 'GCC Rate',          value: `₹${gccRatePerKm} / km`    },
              { label: 'Contracted KM/day', value: `${row.contractedKm} km`   },
              { label: 'Actual KM today',   value: `${row.kmToday} km`        },
              { label: 'KM shortfall',      value: `${Math.max(0, row.contractedKm - row.kmToday)} km` },
              { label: 'Payment cycle',     value: `${paymentCycleDays} days` },
              { label: 'Contract type',     value: 'GCC · PM e-Bus Sewa'      },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-slate-500 text-xs">{label}</span>
                <span className="text-slate-800 text-xs font-medium">{value}</span>
              </div>
            ))}
          </div>

          {/* Revenue Breakdown */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium mb-3 uppercase tracking-wide">
              Revenue Breakdown
            </p>
            <div className="space-y-2 mb-3">
              {[
                { label: 'Today',           value: row.revenueToday,      color: 'text-blue-600'   },
                { label: 'This week (est.)', value: row.revenueToday * 6,  color: 'text-purple-600' },
                { label: 'Monthly (est.)',  value: row.revenueToday * 26, color: 'text-green-600'  },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-500 text-xs">{label}</span>
                  <span className={cn('font-bold text-sm', color)}>{formatINR(value)}</span>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
              <p className="text-blue-700 text-xs">
                Compliance at {row.compliancePct}% —{' '}
                {row.compliancePct >= 90 ? 'Full payment eligible'
                  : row.compliancePct >= 70 ? 'Partial deduction possible'
                  : 'Penalty clause may trigger'}
              </p>
            </div>
          </div>

          {/* PSM Payment Status */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium mb-3 uppercase tracking-wide">
              PSM Payment Status
            </p>
            <div className={cn('rounded-lg p-3 border mb-3',
              isOverdue ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
            )}>
              <div className="flex items-center gap-2 mb-1">
                {isOverdue
                  ? <AlertTriangle size={14} className="text-red-500" />
                  : <CheckCircle  size={14} className="text-green-500" />
                }
                <p className={cn('font-semibold text-sm',
                  isOverdue ? 'text-red-700' : 'text-green-700'
                )}>
                  {isOverdue ? 'Payment Overdue' : 'Payment Current'}
                </p>
                {row._manualPayment && (
                  <span className="ml-auto text-[10px] bg-white border rounded-full px-2 py-0.5 text-slate-500">
                    Manual
                  </span>
                )}
              </div>
              <p className="text-slate-500 text-xs">
                {isOverdue
                  ? `STU payment ${row.lastPaymentDays} days overdue. PSM trigger: ${paymentCycleDays} days.`
                  : row.lastPaymentDays === 0
                  ? `Payment recorded today. Next due in ${paymentCycleDays} days.`
                  : `Last payment ${row.lastPaymentDays} days ago. Next due in ${paymentCycleDays - row.lastPaymentDays} days.`
                }
              </p>
            </div>

            {/* Payment toggle button */}
            <button
              onClick={e => { e.stopPropagation(); onPaymentToggle(row.busId, row.psmStatus); }}
              className={cn(
                'w-full py-2.5 rounded-xl text-xs font-semibold border transition-all mb-2',
                isOverdue
                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              )}
            >
              {isOverdue ? '✓ Record Payment Received' : '↩ Mark as Overdue'}
            </button>

            {isOverdue && (
              <div className="space-y-1.5">
                <p className="text-slate-500 text-xs font-medium">Recommended actions</p>
                <div className="flex items-center gap-2 bg-red-50 border border-red-200
                  rounded-lg px-2.5 py-1.5 text-red-700 text-xs">
                  <AlertTriangle size={11} /> Escalate to STU accounts team
                </div>
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200
                  rounded-lg px-2.5 py-1.5 text-amber-700 text-xs">
                  <Clock size={11} /> Consider service suspension review
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ FleetGCC ════════════════════════════════════════════════ */
export default function FleetGCC({ fetchGCC }) {
  const { config } = useFleetConfig();
  const { gccRatePerKm, contractedKmPerDay, paymentCycleDays } = config;

  const [rows,             setRows]             = useState([]);
  const [loading,          setLoading]          = useState(true);
  const [expandedId,       setExpandedId]       = useState(null);
  const [filterPSM,        setFilterPSM]        = useState('all');
  const [sortBy,           setSortBy]           = useState('compliance');
  const [lastRefresh,      setLastRefresh]      = useState(new Date());
  const [paymentOverrides, setPaymentOverrides] = useState({});  // busId → { status, days }
  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const listRef = useRef(null);

  async function load() {
    setLoading(true);
    const data = await fetchGCC();
    setRows(data);
    setLoading(false);
    setLastRefresh(new Date());
  }

  useEffect(() => { load(); }, []);

  function togglePayment(busId, currentStatus) {
    setPaymentOverrides(prev => {
      if (currentStatus === 'OVERDUE') {
        return { ...prev, [busId]: { status: 'OK', days: 0, _manualPayment: true } };
      } else {
        const { [busId]: _, ...rest } = prev;
        return rest;
      }
    });
  }

  function viewOverdueDetails() {
    setFilterPSM('overdue');
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  // Apply payment overrides and config overrides to each row
  const enrichedRows = rows.map(r => {
    const override = paymentOverrides[r.busId];
    const contracted = contractedKmPerDay || r.contractedKm;
    const pct = Math.round(Math.min(100, (r.kmToday / contracted) * 100));
    return {
      ...r,
      contractedKm:   contracted,
      compliancePct:  pct,
      revenueToday:   r.kmToday * gccRatePerKm,
      psmStatus:      override ? override.status : r.psmStatus,
      lastPaymentDays: override ? override.days : r.lastPaymentDays,
      _manualPayment: !!override,
    };
  });

  const sorted = [...enrichedRows]
    .filter(r =>
      filterPSM === 'all'     ? true :
      filterPSM === 'overdue' ? r.psmStatus === 'OVERDUE' : r.psmStatus === 'OK'
    )
    .sort((a, b) =>
      sortBy === 'compliance' ? b.compliancePct   - a.compliancePct  :
      sortBy === 'revenue'    ? b.revenueToday    - a.revenueToday   :
      sortBy === 'km'         ? b.kmToday         - a.kmToday        :
                                b.lastPaymentDays - a.lastPaymentDays
    );

  const totalRevenue  = enrichedRows.reduce((s, r) => s + r.revenueToday,  0);
  const totalKm       = enrichedRows.reduce((s, r) => s + r.kmToday,       0);
  const overdueCount  = enrichedRows.filter(r => r.psmStatus === 'OVERDUE').length;
  const avgCompliance = enrichedRows.length
    ? Math.round(enrichedRows.reduce((s, r) => s + r.compliancePct, 0) / enrichedRows.length) : 0;
  const atRiskRevenue = enrichedRows
    .filter(r => r.psmStatus === 'OVERDUE')
    .reduce((s, r) => s + r.revenueToday, 0);
  const contractedTotal = enrichedRows.length * (contractedKmPerDay || 180);

  // Tooltip content for summary cards
  const revenueTooltip = (
    <div>
      <p className="font-semibold mb-2 text-slate-200">How it's calculated</p>
      <p className="text-slate-300 mb-2">km driven × ₹{gccRatePerKm}/km per bus</p>
      {enrichedRows.map(r => (
        <div key={r.busId} className="flex justify-between mb-0.5">
          <span className="text-slate-300">{r.busId}  {r.kmToday}km</span>
          <span className="text-white font-medium">{formatINR(r.revenueToday)}</span>
        </div>
      ))}
      <div className="border-t border-slate-600 mt-2 pt-2 flex justify-between">
        <span className="text-slate-300">Fleet total</span>
        <span className="text-white font-bold">{formatINR(totalRevenue)}</span>
      </div>
    </div>
  );

  const kmTooltip = (
    <div>
      <p className="font-semibold mb-2 text-slate-200">Per-bus breakdown</p>
      {enrichedRows.map(r => (
        <div key={r.busId} className="flex justify-between mb-0.5">
          <span className="text-slate-300">{r.busId}</span>
          <span className="text-white">{r.kmToday} / {r.contractedKm} km ({r.compliancePct}%)</span>
        </div>
      ))}
      <div className="border-t border-slate-600 mt-2 pt-2 flex justify-between">
        <span className="text-slate-300">Total</span>
        <span className="text-white font-bold">{totalKm.toFixed(0)} km vs {contractedTotal} contracted</span>
      </div>
    </div>
  );

  const complianceTooltip = (
    <div>
      <p className="font-semibold mb-2 text-slate-200">Compliance = actual ÷ contracted</p>
      {enrichedRows.map(r => (
        <div key={r.busId} className="flex justify-between mb-0.5">
          <span className="text-slate-300">{r.busId}</span>
          <span className="text-white">{r.kmToday}÷{r.contractedKm} = {r.compliancePct}%</span>
        </div>
      ))}
      <div className="border-t border-slate-600 mt-2 pt-2 flex justify-between">
        <span className="text-slate-300">Fleet average</span>
        <span className="text-white font-bold">{avgCompliance}%</span>
      </div>
    </div>
  );

  const overdueTooltip = (
    <div>
      <p className="font-semibold mb-2 text-slate-200">PSM overdue after {paymentCycleDays} days</p>
      {overdueCount === 0
        ? <p className="text-green-400">All payments current</p>
        : enrichedRows.filter(r => r.psmStatus === 'OVERDUE').map(r => (
          <div key={r.busId} className="flex justify-between mb-0.5">
            <span className="text-slate-300">{r.busId}</span>
            <span className="text-red-400">{r.lastPaymentDays} days overdue</span>
          </div>
        ))
      }
    </div>
  );

  const riskTooltip = (
    <div>
      <p className="font-semibold mb-2 text-slate-200">Revenue from overdue buses</p>
      {atRiskRevenue === 0
        ? <p className="text-green-400">No revenue at risk</p>
        : enrichedRows.filter(r => r.psmStatus === 'OVERDUE').map(r => (
          <div key={r.busId} className="flex justify-between mb-0.5">
            <span className="text-slate-300">{r.busId}</span>
            <span className="text-red-400">{formatINR(r.revenueToday)}/day</span>
          </div>
        ))
      }
      {atRiskRevenue > 0 && (
        <div className="border-t border-slate-600 mt-2 pt-2 flex justify-between">
          <span className="text-slate-300">Total at risk</span>
          <span className="text-red-300 font-bold">{formatINR(atRiskRevenue)}/day</span>
        </div>
      )}
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Activity size={24} className="animate-pulse mr-3" /> Loading GCC data...
    </div>
  );

  return (
    <div className="flex flex-col gap-5">

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={IndianRupee} label="Total Revenue Today"
          value={formatINR(totalRevenue)} sub={`${enrichedRows.length} buses`}
          color="text-blue-600" tooltip={revenueTooltip} />
        <SummaryCard icon={Truck} label="Total KM Today"
          value={`${totalKm.toFixed(0)} km`} sub={`vs ${contractedTotal} contracted`}
          color="text-purple-600" tooltip={kmTooltip} />
        <SummaryCard icon={TrendingUp} label="Avg Compliance"
          value={`${avgCompliance}%`} sub="km operated vs contracted"
          color={avgCompliance >= 90 ? 'text-green-600' : avgCompliance >= 70 ? 'text-amber-600' : 'text-red-600'}
          tooltip={complianceTooltip} />
        <SummaryCard icon={AlertTriangle} label="PSM Overdue"
          value={overdueCount} sub="buses with overdue payment"
          color={overdueCount > 0 ? 'text-red-600' : 'text-green-600'}
          bg={overdueCount > 0 ? 'bg-red-50' : 'bg-white'}
          tooltip={overdueTooltip} />
        <SummaryCard icon={TrendingDown} label="Revenue at Risk"
          value={formatINR(atRiskRevenue)} sub="from overdue STUs"
          color={atRiskRevenue > 0 ? 'text-red-600' : 'text-green-600'}
          tooltip={riskTooltip} />
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-700 font-semibold text-sm">
              PSM Trigger Alert — {overdueCount} bus{overdueCount > 1 ? 'es' : ''} with overdue payment
            </p>
            <p className="text-red-500 text-xs mt-0.5">
              PSM threshold exceeded ({paymentCycleDays} days). Recommend escalation.{' '}
              {formatINR(atRiskRevenue)} in revenue at risk.
            </p>
          </div>
          <button onClick={viewOverdueDetails}
            className="text-red-500 hover:text-red-700 text-xs border border-red-200
              px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 hover:bg-red-100">
            View Details
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {[
            { id: 'all',     label: 'All Buses'       },
            { id: 'overdue', label: '🔴 PSM Overdue'  },
            { id: 'ok',      label: '🟢 PSM OK'        },
          ].map(opt => (
            <button key={opt.id} onClick={() => setFilterPSM(opt.id)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filterPSM === opt.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'
              )}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {[
            { id: 'compliance', label: 'Compliance' },
            { id: 'revenue',    label: 'Revenue'    },
            { id: 'km',         label: 'KM'         },
            { id: 'psm',        label: 'PSM Age'    },
          ].map(opt => (
            <button key={opt.id} onClick={() => setSortBy(opt.id)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                sortBy === opt.id ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-700'
              )}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <p className="text-slate-400 text-xs">Last refresh: {lastRefresh.toLocaleTimeString()}</p>
          <button onClick={() => setSettingsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200
              rounded-lg text-slate-600 hover:text-slate-800 hover:bg-slate-100 text-xs transition-colors">
            <Settings2 size={12} /> GCC Settings
          </button>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200
              rounded-lg text-slate-500 hover:text-slate-700 text-xs transition-colors">
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={() => {
              const csv = [
                ['Bus ID','Route','Driver','KM Today','Contracted KM','Compliance %','Revenue','PSM Status','Days'],
                ...enrichedRows.map(r => [r.busId, r.routeNo, r.driverName, r.kmToday,
                  r.contractedKm, r.compliancePct, r.revenueToday, r.psmStatus, r.lastPaymentDays])
              ].map(row => row.join(',')).join('\n');
              const a = Object.assign(document.createElement('a'), {
                href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
                download: `GCC_Compliance_${new Date().toISOString().slice(0,10)}.csv`,
              });
              a.click();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200
              rounded-lg text-blue-600 hover:bg-blue-100 text-xs transition-colors">
            <Download size={12} /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-3 px-5 py-2 text-slate-400 text-xs font-medium uppercase tracking-wide">
        <div className="col-span-3">Bus / Route / Driver</div>
        <div className="col-span-3">KM Progress</div>
        <div className="col-span-1 text-center">Compliance</div>
        <div className="col-span-2 text-right">Revenue</div>
        <div className="col-span-2 text-center">PSM Status</div>
        <div className="col-span-1 text-right">Fuel</div>
      </div>

      <div ref={listRef} className="flex flex-col gap-2">
        {sorted.map(row => (
          <GCCRow
            key={row.busId}
            row={row}
            isExpanded={expandedId === row.busId}
            onToggle={() => setExpandedId(p => p === row.busId ? null : row.busId)}
            onPaymentToggle={togglePayment}
          />
        ))}
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-slate-800 font-semibold text-sm flex items-center gap-2">
              <FileText size={15} className="text-blue-600" />
              Monthly Compliance Report — {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
            </p>
            <p className="text-slate-400 text-xs mt-0.5">Auto-generated · Ready for STU submission</p>
          </div>
          <span className="px-3 py-1 bg-green-50 border border-green-200 rounded-full text-green-600 text-xs font-medium">
            Ready to Submit
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Fleet Compliance', value: `${avgCompliance}%`,                color: 'text-blue-600'   },
            { label: 'Monthly Revenue',  value: formatINR(totalRevenue * 26),       color: 'text-green-600'  },
            { label: 'Total Fleet KM',   value: `${(totalKm * 26).toFixed(0)} km`, color: 'text-purple-600' },
            { label: 'PSM Issues',       value: `${overdueCount} flagged`,           color: overdueCount > 0 ? 'text-red-600' : 'text-green-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-sm">
              <p className="text-slate-500 text-xs mb-1">{label}</p>
              <p className={cn('font-bold text-sm', color)}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {settingsOpen && <GCCSettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
