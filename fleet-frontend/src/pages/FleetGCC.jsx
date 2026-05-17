import { useState, useEffect } from 'react';
import {
  FileText, AlertTriangle, CheckCircle, Clock,
  TrendingUp, TrendingDown, Download, RefreshCw,
  IndianRupee, Truck, Activity, XCircle
} from 'lucide-react';
import { cn, getPSMColor, formatINR } from '../lib/utils';

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
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-right text-xs mt-1" style={{ color }}>{Math.round(pct)}%</p>
    </div>
  );
}

function PSMBadge({ status, days }) {
  const overdue = status === 'OVERDUE';
  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium',
      overdue
        ? 'bg-red-50 border-red-200 text-red-600'
        : 'bg-green-50 border-green-200 text-green-600'
    )}>
      {overdue ? <XCircle size={12} /> : <CheckCircle size={12} />}
      {overdue ? `Overdue ${days}d` : `Paid ${days}d ago`}
    </div>
  );
}

function ComplianceBadge({ pct }) {
  const color = pct >= 90
    ? 'bg-green-50 border-green-200 text-green-600'
    : pct >= 70
    ? 'bg-amber-50 border-amber-200 text-amber-600'
    : 'bg-red-50 border-red-200 text-red-600';
  return (
    <span className={cn('px-2 py-0.5 rounded-full border text-xs font-medium', color)}>
      {pct}%
    </span>
  );
}

function SummaryCard({ icon: Icon, label, value, sub, color = 'text-slate-900', bg = 'bg-white' }) {
  return (
    <div className={cn('border border-slate-200 rounded-xl px-4 py-4 shadow-sm', bg)}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-slate-500 text-xs">{label}</p>
        <Icon size={15} className={color} />
      </div>
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      {sub && <p className="text-slate-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function GCCRow({ row, isExpanded, onToggle }) {
  return (
    <div className={cn(
      'bg-white border rounded-xl overflow-hidden transition-all shadow-sm',
      isExpanded ? 'border-blue-300' : 'border-slate-200 hover:border-slate-300'
    )}>
      <button
        onClick={onToggle}
        className="w-full grid grid-cols-12 gap-3 items-center px-5 py-4 text-left"
      >
        <div className="col-span-3">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn(
              'w-2 h-2 rounded-full flex-shrink-0',
              row.psmStatus === 'OVERDUE' ? 'bg-red-400' : 'bg-green-400'
            )} />
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
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full border',
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
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium mb-3 uppercase tracking-wide">
              Contract Details
            </p>
            {[
              { label: 'GCC Rate',          value: '₹80 / km'                 },
              { label: 'Contracted KM/day', value: `${row.contractedKm} km`   },
              { label: 'Actual KM today',   value: `${row.kmToday} km`        },
              { label: 'KM shortfall',      value: `${Math.max(0, row.contractedKm - row.kmToday)} km` },
              { label: 'Contract type',     value: 'GCC · PM e-Bus Sewa'      },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-slate-500 text-xs">{label}</span>
                <span className="text-slate-800 text-xs font-medium">{value}</span>
              </div>
            ))}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium mb-3 uppercase tracking-wide">
              Revenue Breakdown
            </p>
            <div className="space-y-2 mb-3">
              {[
                { label: 'Today',              value: row.revenueToday,          color: 'text-blue-600'   },
                { label: 'This week (est.)',    value: row.revenueToday * 6,      color: 'text-purple-600' },
                { label: 'Monthly (est.)',      value: row.revenueToday * 26,     color: 'text-green-600'  },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-slate-500 text-xs">{label}</span>
                  <span className={cn('font-bold text-sm', color)}>{formatINR(value)}</span>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
              <p className="text-blue-700 text-xs">
                Compliance at {row.compliancePct}% — {row.compliancePct >= 90
                  ? 'Full payment eligible'
                  : row.compliancePct >= 70
                  ? 'Partial deduction possible'
                  : 'Penalty clause may trigger'}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium mb-3 uppercase tracking-wide">
              PSM Payment Status
            </p>
            <div className={cn(
              'rounded-lg p-3 border mb-3',
              row.psmStatus === 'OVERDUE'
                ? 'bg-red-50 border-red-200'
                : 'bg-green-50 border-green-200'
            )}>
              <div className="flex items-center gap-2 mb-1">
                {row.psmStatus === 'OVERDUE'
                  ? <AlertTriangle size={14} className="text-red-500" />
                  : <CheckCircle  size={14} className="text-green-500" />
                }
                <p className={cn('font-semibold text-sm',
                  row.psmStatus === 'OVERDUE' ? 'text-red-700' : 'text-green-700'
                )}>
                  {row.psmStatus === 'OVERDUE' ? 'Payment Overdue' : 'Payment Current'}
                </p>
              </div>
              <p className="text-slate-500 text-xs">
                {row.psmStatus === 'OVERDUE'
                  ? `STU payment ${row.lastPaymentDays} days overdue. PSM trigger threshold: 30 days.`
                  : `Last payment received ${row.lastPaymentDays} days ago. Next due in ${30 - row.lastPaymentDays} days.`
                }
              </p>
            </div>
            {row.psmStatus === 'OVERDUE' && (
              <div className="space-y-1.5">
                <p className="text-slate-500 text-xs font-medium">Recommended actions</p>
                <div className="flex items-center gap-2 bg-red-50 border border-red-200
                  rounded-lg px-2.5 py-1.5 text-red-700 text-xs">
                  <AlertTriangle size={11} />
                  Escalate to STU accounts team
                </div>
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200
                  rounded-lg px-2.5 py-1.5 text-amber-700 text-xs">
                  <Clock size={11} />
                  Consider service suspension review
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FleetGCC({ fetchGCC }) {
  const [rows,        setRows]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [expandedId,  setExpandedId]  = useState(null);
  const [filterPSM,   setFilterPSM]   = useState('all');
  const [sortBy,      setSortBy]      = useState('compliance');
  const [lastRefresh, setLastRefresh] = useState(new Date());

  async function load() {
    setLoading(true);
    const data = await fetchGCC();
    setRows(data);
    setLoading(false);
    setLastRefresh(new Date());
  }

  useEffect(() => { load(); }, []);

  const sorted = [...rows]
    .filter(r =>
      filterPSM === 'all'     ? true :
      filterPSM === 'overdue' ? r.psmStatus === 'OVERDUE' :
                                r.psmStatus === 'OK'
    )
    .sort((a, b) =>
      sortBy === 'compliance' ? b.compliancePct   - a.compliancePct  :
      sortBy === 'revenue'    ? b.revenueToday    - a.revenueToday   :
      sortBy === 'km'         ? b.kmToday         - a.kmToday        :
                                b.lastPaymentDays - a.lastPaymentDays
    );

  const totalRevenue  = rows.reduce((s, r) => s + r.revenueToday,  0);
  const totalKm       = rows.reduce((s, r) => s + r.kmToday,       0);
  const overdueCount  = rows.filter(r => r.psmStatus === 'OVERDUE').length;
  const avgCompliance = rows.length
    ? Math.round(rows.reduce((s, r) => s + r.compliancePct, 0) / rows.length)
    : 0;
  const atRiskRevenue = rows
    .filter(r => r.psmStatus === 'OVERDUE')
    .reduce((s, r) => s + r.revenueToday, 0);

  const reportRows = rows.map(r => ({
    ...r,
    weeklyRevenue:  r.revenueToday * 6,
    monthlyRevenue: r.revenueToday * 26,
  }));

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400">
      <Activity size={24} className="animate-pulse mr-3" />
      Loading GCC data...
    </div>
  );

  return (
    <div className="flex flex-col gap-5">

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard
          icon={IndianRupee}
          label="Total Revenue Today"
          value={formatINR(totalRevenue)}
          sub="all 8 buses"
          color="text-blue-600"
        />
        <SummaryCard
          icon={Truck}
          label="Total KM Today"
          value={`${totalKm.toFixed(0)} km`}
          sub={`vs ${rows.length * 180} contracted`}
          color="text-purple-600"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Avg Compliance"
          value={`${avgCompliance}%`}
          sub="km operated vs contracted"
          color={avgCompliance >= 90 ? 'text-green-600' : avgCompliance >= 70 ? 'text-amber-600' : 'text-red-600'}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="PSM Overdue"
          value={overdueCount}
          sub="buses with overdue payment"
          color={overdueCount > 0 ? 'text-red-600' : 'text-green-600'}
          bg={overdueCount > 0 ? 'bg-red-50' : 'bg-white'}
        />
        <SummaryCard
          icon={TrendingDown}
          label="Revenue at Risk"
          value={formatINR(atRiskRevenue)}
          sub="from overdue STUs"
          color={atRiskRevenue > 0 ? 'text-red-600' : 'text-green-600'}
        />
      </div>

      {overdueCount > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200
          rounded-xl px-5 py-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-700 font-semibold text-sm">
              PSM Trigger Alert — {overdueCount} bus{overdueCount > 1 ? 'es' : ''} with overdue payment
            </p>
            <p className="text-red-500 text-xs mt-0.5">
              Payment Security Mechanism threshold exceeded. Recommend escalation to STU accounts team.
              {formatINR(atRiskRevenue)} in revenue at risk.
            </p>
          </div>
          <button className="text-red-500 hover:text-red-700 text-xs border border-red-200
            px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
            View Details
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {[
            { id: 'all',     label: 'All Buses'      },
            { id: 'overdue', label: '🔴 PSM Overdue' },
            { id: 'ok',      label: '🟢 PSM OK'       },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setFilterPSM(opt.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filterPSM === opt.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
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
            <button
              key={opt.id}
              onClick={() => setSortBy(opt.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                sortBy === opt.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <p className="text-slate-400 text-xs">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </p>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200
              rounded-lg text-slate-500 hover:text-slate-700 text-xs transition-colors"
          >
            <RefreshCw size={12} /> Refresh
          </button>
          <button
            onClick={() => {
              const csv = [
                ['Bus ID','Route','Driver','KM Today','Contracted KM','Compliance %','Revenue','PSM Status','Days'],
                ...reportRows.map(r => [
                  r.busId, r.routeNo, r.driverName, r.kmToday,
                  r.contractedKm, r.compliancePct, r.revenueToday,
                  r.psmStatus, r.lastPaymentDays
                ])
              ].map(row => row.join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url  = URL.createObjectURL(blob);
              const a    = document.createElement('a');
              a.href     = url;
              a.download = `GCC_Compliance_${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200
              rounded-lg text-blue-600 hover:bg-blue-100 text-xs transition-colors"
          >
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

      <div className="flex flex-col gap-2">
        {sorted.map(row => (
          <GCCRow
            key={row.busId}
            row={row}
            isExpanded={expandedId === row.busId}
            onToggle={() => setExpandedId(p => p === row.busId ? null : row.busId)}
          />
        ))}
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200
        rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-slate-800 font-semibold text-sm flex items-center gap-2">
              <FileText size={15} className="text-blue-600" />
              Monthly Compliance Report — April 2026
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              Auto-generated · Ready for STU submission
            </p>
          </div>
          <span className="px-3 py-1 bg-green-50 border border-green-200
            rounded-full text-green-600 text-xs font-medium">
            Ready to Submit
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Fleet Compliance',  value: `${avgCompliance}%`,               color: 'text-blue-600'   },
            { label: 'Monthly Revenue',   value: formatINR(totalRevenue * 26),      color: 'text-green-600'  },
            { label: 'Total Fleet KM',    value: `${(totalKm * 26).toFixed(0)} km`, color: 'text-purple-600' },
            { label: 'PSM Issues',        value: `${overdueCount} flagged`,          color: overdueCount > 0 ? 'text-red-600' : 'text-green-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 shadow-sm">
              <p className="text-slate-500 text-xs mb-1">{label}</p>
              <p className={cn('font-bold text-sm', color)}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
