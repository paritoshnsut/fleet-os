import { useState } from 'react';
import {
  Zap, Thermometer, AlertTriangle, X,
  Battery, Sun, Moon, Sunset, Plus, Trash2, Play, Settings2,
} from 'lucide-react';
import { cn, formatINR } from '../lib/utils';

function SOCBar({ soc, charging = false }) {
  const color =
    soc > 60 ? '#22c55e' :
    soc > 30 ? '#f59e0b' : '#ef4444';

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-slate-500">State of Charge</span>
        <span className="font-bold" style={{ color }}>{Math.round(soc)}%</span>
      </div>
      <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${soc}%`, backgroundColor: color }}
        />
        {charging && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent
            animate-shimmer rounded-full" />
        )}
      </div>
      {soc < 25 && (
        <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
          <AlertTriangle size={10} /> Low battery — charge immediately
        </p>
      )}
    </div>
  );
}

function ThermalBadge({ temp }) {
  const hot = temp > 35;
  return (
    <span className={cn(
      'flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs',
      hot
        ? 'bg-red-50 border-red-200 text-red-600'
        : 'bg-green-50 border-green-200 text-green-600'
    )}>
      <Thermometer size={10} />
      {temp}°C {hot ? '— Too Hot' : '— OK'}
    </span>
  );
}

function ChargingSlot({ slot }) {
  const statusConfig = {
    charging: { color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200',   label: 'Charging',   dot: 'bg-blue-500'   },
    queued:   { color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200', label: 'Queued',     dot: 'bg-amber-500'  },
    complete: { color: 'text-green-600',  bg: 'bg-green-50 border-green-200', label: 'Complete',   dot: 'bg-green-500'  },
    idle:     { color: 'text-slate-400',  bg: 'bg-slate-50 border-slate-200', label: 'Available',  dot: 'bg-slate-300'  },
  };
  const cfg = statusConfig[slot.status] || statusConfig.idle;

  return (
    <div className={cn('border rounded-xl p-4', cfg.bg)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', cfg.dot,
            slot.status === 'charging' && 'animate-pulse')} />
          <p className="text-slate-800 font-semibold text-sm">Charger {slot.id}</p>
        </div>
        <span className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</span>
      </div>

      {slot.busId ? (
        <>
          <p className="text-slate-500 text-xs mb-3">{slot.busId}</p>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Power</span>
              <span className="text-slate-800 font-medium">{slot.kw} kW</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">SOC now</span>
              <span className="text-slate-800 font-medium">{Math.round(slot.soc)}%</span>
            </div>
            {slot.eta && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Full charge ETA</span>
                <span className={cn('font-medium', cfg.color)}>{slot.eta}</span>
              </div>
            )}
            {slot.cost && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Session cost</span>
                <span className="text-slate-800 font-medium">{formatINR(slot.cost)}</span>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-16 text-slate-400 text-xs">
          No bus connected
        </div>
      )}
    </div>
  );
}

const DEFAULT_TARIFF = [
  4.2, 4.0, 3.8, 3.8, 3.9, 4.2,
  5.1, 6.8, 8.2, 9.5, 9.5, 8.0,
  7.0, 6.5, 6.2, 6.8, 7.5, 8.8,
  9.2, 9.0, 8.0, 6.5, 5.2, 4.5,
];

const TARIFF_PRESETS = {
  Default:     [...DEFAULT_TARIFF],
  'Flat Rate': Array(24).fill(6.0),
  'TOU Peak':  [3.8,3.8,3.8,3.8,3.8,4.0, 5.5,7.5,9.5,9.5,9.5,8.0, 6.5,6.0,6.0,6.5,7.5,9.0, 9.5,9.0,8.0,6.5,5.0,4.2],
  Weekend:     [3.5,3.5,3.5,3.5,3.5,3.8, 4.5,5.5,6.5,7.0,7.0,6.5, 5.5,5.0,5.0,5.5,6.0,7.0, 7.5,7.0,6.0,5.0,4.0,3.8],
};

function TariffModal({ rates, onClose, onApply }) {
  const [local, setLocal] = useState([...rates]);
  const minR = Math.min(...local);
  const maxR = Math.max(...local);
  const avgR = (local.reduce((a, b) => a + b, 0) / 24).toFixed(2);

  function setRate(i, v) {
    const n = [...local];
    n[i] = parseFloat(v) || 0;
    setLocal(n);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white">
          <div>
            <p className="font-semibold text-slate-800 text-sm">Electricity Tariff Schedule</p>
            <p className="text-slate-400 text-xs mt-0.5">Set hourly rates (₹/kWh) — smart charging uses off-peak slots automatically</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Quick Presets</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(TARIFF_PRESETS).map(name => (
                <button key={name} onClick={() => setLocal([...TARIFF_PRESETS[name]])}
                  className="px-3 py-1.5 rounded-lg border text-xs font-medium
                    bg-slate-50 border-slate-200 text-slate-600
                    hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all">
                  {name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs font-medium text-slate-500 mb-2">Live Preview</p>
            <DemandChart tariff={local} />
          </div>

          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Hourly Rates (₹/kWh)</p>
            <div className="grid grid-cols-6 gap-2">
              {local.map((r, i) => (
                <div key={i} className="text-center">
                  <p className="text-slate-400 text-[9px] mb-1">{String(i).padStart(2, '0')}:00</p>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.1"
                    value={r}
                    onChange={e => setRate(i, e.target.value)}
                    className="w-full text-center text-xs border border-slate-200 rounded-lg py-1.5
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6 bg-slate-50 rounded-xl px-4 py-3 text-xs">
            <span className="text-slate-500">Min: <strong className="text-green-600">₹{minR}/kWh</strong></span>
            <span className="text-slate-500">Max: <strong className="text-red-600">₹{maxR}/kWh</strong></span>
            <span className="text-slate-500">Avg: <strong className="text-slate-800">₹{avgR}/kWh</strong></span>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 border border-slate-200 text-slate-600 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-all">
              Cancel
            </button>
            <button onClick={() => { onApply(local); onClose(); }}
              className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700 transition-all">
              Apply & Reschedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── DemandChart — fixed-position tooltip to avoid overflow clipping ── */
function DemandChart({ tariff = DEFAULT_TARIFF }) {
  const [tooltip, setTooltip] = useState(null);
  const max     = Math.max(...tariff);
  const now     = new Date().getHours();
  const optimal = tariff.map(t => t < 5.5);

  return (
    <div>
      <div className="flex items-end gap-0.5 h-20 mb-1">
        {tariff.map((t, i) => {
          const heightPct = (t / max) * 100;
          const isNow     = i === now;
          const isOpt     = optimal[i];
          return (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition-all"
              style={{
                height: `${heightPct}%`,
                backgroundColor: isNow ? '#3b82f6' : isOpt ? '#22c55e60' : '#ef444440',
                border: isNow ? '1px solid #3b82f6' : 'none',
              }}
              onMouseEnter={e => setTooltip({ i, t, x: e.clientX, y: e.clientY })}
              onMouseMove={e => setTooltip(prev => prev?.i === i ? { ...prev, x: e.clientX, y: e.clientY } : { i, t, x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-slate-400 text-[9px]">
        {[0, 6, 12, 18, 23].map(h => (
          <span key={h}>{h}:00</span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-green-500/40" /> Optimal window
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-red-500/40" /> Peak tariff
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <div className="w-3 h-3 rounded-sm bg-blue-500" /> Now
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-[9999] bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none"
          style={{ top: tooltip.y + 14, left: tooltip.x + 6 }}
        >
          {tooltip.i}:00 · ₹{tooltip.t}/kWh
        </div>
      )}
    </div>
  );
}

const STATUS_OPTS = [
  { id: null,       label: 'Off',      on: 'bg-slate-100 border-slate-300 text-slate-600'  },
  { id: 'queued',   label: 'Queued',   on: 'bg-amber-100 border-amber-300 text-amber-700'  },
  { id: 'charging', label: 'Charging', on: 'bg-blue-100 border-blue-300 text-blue-700'     },
  { id: 'complete', label: 'Done',     on: 'bg-green-100 border-green-300 text-green-700'  },
];

function EVBusCard({ bus, schedule, onStatusChange }) {
  const ambientTemp = 28 + Math.floor(Math.random() * 10);
  const tooHot      = ambientTemp > 35;
  const curStatus   = schedule?.status ?? null;

  return (
    <div className={cn(
      'bg-white border rounded-xl p-5 transition-all shadow-sm',
      bus.soc < 25
        ? 'border-red-300'
        : tooHot
        ? 'border-orange-300'
        : 'border-slate-200'
    )}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-slate-800 font-semibold text-sm">{bus.busId}</p>
          <p className="text-slate-400 text-xs mt-0.5">{bus.routeNo} · {bus.routeName}</p>
        </div>
        <ThermalBadge temp={ambientTemp} />
      </div>

      <div className="mb-4">
        <SOCBar soc={bus.soc} charging={curStatus === 'charging'} />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Km today',    value: `${bus.kmToday} km`,                       color: 'text-slate-800'  },
          { label: 'Energy used', value: `${(bus.kmToday * 1.4).toFixed(0)} kWh`,  color: 'text-purple-600' },
          { label: 'Range left',  value: `${Math.round(bus.soc * 2.8)} km`,         color: bus.soc < 25 ? 'text-red-600' : 'text-slate-800' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-50 rounded-lg px-3 py-2">
            <p className="text-slate-400 text-xs mb-0.5">{label}</p>
            <p className={cn('font-semibold text-sm', color)}>{value}</p>
          </div>
        ))}
      </div>

      <p className="text-slate-400 text-[10px] font-medium mb-1.5 uppercase tracking-wide">Charging Status</p>
      <div className="grid grid-cols-4 gap-1 mb-3">
        {STATUS_OPTS.map(({ id, label, on }) => {
          const active = curStatus === id;
          return (
            <button
              key={String(id)}
              onClick={() => onStatusChange(bus.busId, id)}
              className={cn(
                'py-1.5 rounded-lg text-xs font-medium border transition-all',
                active ? on : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {schedule ? (
        <div className={cn(
          'rounded-lg px-3 py-2.5 border text-xs',
          curStatus === 'charging'
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : curStatus === 'queued'
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-green-50 border-green-200 text-green-700'
        )}>
          <div className="flex items-center gap-1.5 font-medium mb-0.5">
            <Zap size={11} />
            {curStatus === 'charging' ? 'Currently charging'
             : curStatus === 'queued'  ? `Scheduled: ${schedule.scheduledAt ?? '23:00'}`
             : 'Charge complete'}
          </div>
          <p className="text-slate-500">
            {curStatus === 'charging'
              ? `${schedule.kw ?? 60}kW AC · Full charge in ${schedule.eta ?? '2h 30m'}`
              : curStatus === 'queued'
              ? `Off-peak slot · Est. cost ${formatINR(schedule.estCost ?? 400)}`
              : `Ready for duty · SOC at ${Math.round(bus.soc)}%`
            }
          </p>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-400">
          Not scheduled — select a status above to assign
        </div>
      )}

      {tooHot && (
        <div className="mt-2 bg-orange-50 border border-orange-200
          rounded-lg px-3 py-2 text-orange-700 text-xs flex items-center gap-2">
          <AlertTriangle size={11} />
          Ambient {ambientTemp}°C — delay charging until temperature drops below 35°C
        </div>
      )}
    </div>
  );
}

/* ══ Scheduler (ported from Charging Planner) ════════════════════════════════ */
const CHARGER_KW = 60;
const SLOT_MIN   = 30;
const SLOTS_DAY  = 48;

function _hhmmToSlot(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return Math.floor((h * 60 + (m || 0)) / SLOT_MIN);
}
function _slotToHHMM(slot) {
  const totalMin = (slot % SLOTS_DAY) * SLOT_MIN;
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
}
function _slotTariff(slot, ht) {
  return ht[Math.floor((slot % SLOTS_DAY) / 2)];
}
function _windowCost(startSlot, numSlots, ht) {
  let c = 0;
  for (let s = 0; s < numSlots; s++) c += _slotTariff(startSlot + s, ht) * CHARGER_KW * (SLOT_MIN / 60);
  return c;
}

function runOptimizer(busList, numChargers, ht) {
  const TOTAL = SLOTS_DAY * 2;
  const occ   = Array.from({ length: numChargers }, () => new Array(TOTAL).fill(null));

  const entries = busList.map(b => {
    let outSlot = _hhmmToSlot(b.outTime) ?? 40;
    let inSlot  = _hhmmToSlot(b.inTime)  ?? 12;
    if (inSlot <= outSlot) inSlot += SLOTS_DAY;
    const kwhNeeded = b.kwh ? Number(b.kwh) : 100;
    const numSlots  = Math.ceil(kwhNeeded / (CHARGER_KW * (SLOT_MIN / 60)));
    const soc       = b.soc ?? 60;
    const urgency   = (100 - soc) * 100 + Math.max(0, 48 - (inSlot - outSlot));
    return { ...b, outSlot, inSlot, kwhNeeded, numSlots, soc, urgency };
  }).sort((a, b) => b.urgency - a.urgency);

  const scheduled = [], conflicts = [];
  for (const bus of entries) {
    const { outSlot, inSlot, numSlots } = bus;
    let bestCost = Infinity, bestStart = -1, bestCharger = -1;
    for (let start = outSlot; start <= inSlot - numSlots; start++) {
      const cost = _windowCost(start, numSlots, ht);
      if (cost >= bestCost) continue;
      for (let c = 0; c < numChargers; c++) {
        let free = true;
        for (let s = 0; s < numSlots; s++) {
          if (occ[c][start + s]) { free = false; break; }
        }
        if (free) { bestCost = cost; bestStart = start; bestCharger = c; break; }
      }
    }
    if (bestStart >= 0) {
      for (let s = 0; s < numSlots; s++) occ[bestCharger][bestStart + s] = bus.busId;
      const naiveCost = _windowCost(outSlot, numSlots, ht);
      scheduled.push({
        busId:       bus.busId,
        charger:     `C-${String(bestCharger + 1).padStart(2, '0')}`,
        arrives:     bus.outTime,
        departs:     bus.inTime,
        chargeStart: _slotToHHMM(bestStart),
        chargeEnd:   _slotToHHMM(bestStart + numSlots),
        delayed:     bestStart > outSlot,
        delayMins:   (bestStart - outSlot) * SLOT_MIN,
        kWh:         bus.kwhNeeded,
        chargeHours: +(numSlots * SLOT_MIN / 60).toFixed(1),
        cost:        Math.round(bestCost),
        naiveCost:   Math.round(naiveCost),
        savings:     Math.round(naiveCost - bestCost),
        isUrgent:    bus.soc < 25,
      });
    } else {
      conflicts.push({
        busId:  bus.busId,
        reason: (inSlot - outSlot) < numSlots
          ? `Window too short — needs ${+(numSlots * SLOT_MIN / 60).toFixed(1)} h`
          : 'All chargers occupied during window',
      });
    }
  }

  const totalCost      = scheduled.reduce((s, r) => s + r.cost, 0);
  const totalNaiveCost = scheduled.reduce((s, r) => s + r.naiveCost, 0);
  return {
    scheduled, conflicts, totalCost, totalNaiveCost,
    totalSavings: totalNaiveCost - totalCost,
    savingsPct:   totalNaiveCost > 0
      ? Math.round((totalNaiveCost - totalCost) / totalNaiveCost * 100) : 0,
  };
}

function findMinChargers(busList, ht) {
  if (!busList.length) return 1;
  let lo = 1, hi = busList.length, result = busList.length;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (runOptimizer(busList, mid, ht).conflicts.length === 0) { result = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  return result;
}

/* ── Charging Schedule Timeline (CSS-based) ─────────────────────────────── */
function ScheduleTimeline({ scheduled, tariff }) {
  const groups = {};
  for (const b of scheduled) {
    if (!groups[b.charger]) groups[b.charger] = [];
    groups[b.charger].push(b);
  }
  const chargers = Object.keys(groups).sort();

  // 18:00 → 10:00 next day (16 hrs)
  const T_START = 18 * 60;
  const T_RANGE = 16 * 60;

  function toMin(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = String(hhmm).split(':').map(Number);
    let min = h * 60 + (m || 0);
    if (min < 12 * 60) min += 24 * 60;
    return min;
  }
  function toPct(hhmm) {
    return Math.max(0, Math.min(100, ((toMin(hhmm) - T_START) / T_RANGE) * 100));
  }

  // Tariff background (hours 18–09)
  const tariffSlice = [...tariff.slice(18), ...tariff.slice(0, 10)];
  const tMin = Math.min(...tariff), tMax = Math.max(...tariff), tRange = tMax - tMin || 1;
  const hours = [18, 20, 22, 0, 2, 4, 6, 8, 10];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <p className="text-slate-700 font-semibold text-sm mb-3">Charger Bay Timeline</p>

      {/* Tariff heatmap strip */}
      <div className="relative h-5 rounded-lg overflow-hidden mb-1 flex">
        {tariffSlice.map((rate, i) => {
          const norm = (rate - tMin) / tRange;
          return (
            <div key={i} className="flex-1 h-full"
              style={{ backgroundColor: `hsl(${Math.round((1 - norm) * 120)},60%,50%)`, opacity: 0.35 }} />
          );
        })}
        <span className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-600 font-medium pointer-events-none">
          Electricity tariff (green = cheap · red = peak)
        </span>
      </div>

      {/* Hour labels */}
      <div className="flex mb-2">
        {hours.map(h => (
          <div key={h} style={{ width: `${100 / (hours.length - 1)}%` }}
            className="text-center text-[9px] text-slate-400 first:text-left last:text-right">
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>

      {/* Charger rows */}
      <div className="flex flex-col gap-1.5">
        {chargers.map(charger => (
          <div key={charger} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 font-semibold w-10 flex-shrink-0">{charger}</span>
            <div className="flex-1 relative h-7 bg-slate-100 rounded-lg overflow-hidden">
              {groups[charger].map(bus => {
                const left  = toPct(bus.chargeStart);
                const right = toPct(bus.chargeEnd);
                const width = right - left;
                const color = bus.isUrgent ? '#f97316' : bus.delayed ? '#10b981' : '#6366f1';
                return (
                  <div key={bus.busId}
                    className="absolute top-1 bottom-1 rounded flex items-center justify-center"
                    style={{ left: `${left}%`, width: `${Math.max(width, 1)}%`, backgroundColor: color }}
                    title={`${bus.busId}: ${bus.chargeStart}–${bus.chargeEnd} · ${formatINR(bus.cost)}`}
                  >
                    {width > 8 && (
                      <span className="text-white text-[9px] font-bold truncate px-1">
                        {bus.busId}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Off-peak (delayed)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Immediate</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-500 inline-block" /> Urgent (low SOC)</span>
      </div>
    </div>
  );
}

/* ══ Default state ═══════════════════════════════════════════════════════════ */
const DEFAULT_SCHEDULES = {
  'MH12-AB-1234': { status: 'charging', kw: 60, eta: '2h 15m',   scheduledAt: null,    estCost: 420 },
  'MH12-CD-5678': { status: 'queued',   kw: 60, eta: '3h 00m',   scheduledAt: '23:00', estCost: 380 },
  'MH12-EF-9012': { status: 'complete', kw: 0,  eta: null,        scheduledAt: null,    estCost: 510 },
  'MH12-GH-3456': { status: 'queued',   kw: 60, eta: '2h 45m',   scheduledAt: '01:00', estCost: 360 },
  'MH12-IJ-7890': { status: 'queued',   kw: 60, eta: '1h 50m',   scheduledAt: '00:00', estCost: 290 },
};

let _uid = 0;
const makeRowId = () => `r${++_uid}-${Date.now()}`;

/* ══ Main Component ══════════════════════════════════════════════════════════ */
export default function FleetEV({ buses }) {
  const [tariffOpen,  setTariffOpen]  = useState(false);
  const [tariffRates, setTariffRates] = useState(DEFAULT_TARIFF);
  const [schedules,   setSchedules]   = useState(DEFAULT_SCHEDULES);

  // Smart Schedule Optimizer state
  const [schedBuses, setSchedBuses] = useState(() =>
    buses.filter(b => b.fuelType === 'Electric').map(b => ({
      id:       b.busId,
      busId:    b.busId,
      outTime:  '20:00',
      inTime:   '06:00',
      kwh:      String(Math.round((100 - (b.soc || 60)) * 2)),
      soc:      b.soc ?? 60,
    }))
  );
  const [schedResult,    setSchedResult]    = useState(null);
  const [depotChargers,  setDepotChargers]  = useState(4);

  const evBuses = buses.filter(b => b.fuelType === 'Electric');

  function setChargeStatus(busId, status) {
    setSchedules(prev => {
      if (status === null) {
        const next = { ...prev };
        delete next[busId];
        return next;
      }
      const base = prev[busId] || {};
      return {
        ...prev,
        [busId]: {
          ...base,
          status,
          kw:          status === 'charging' ? 60 : 0,
          eta:         status === 'charging' ? '2h 30m' : status === 'queued' ? '3h 00m' : null,
          scheduledAt: status === 'queued' ? (base.scheduledAt ?? '23:00') : null,
          estCost:     base.estCost ?? 400,
        },
      };
    });
  }

  const chargerSlots = [
    { id: 'C-01', busId: 'MH12-AB-1234', status: 'charging', kw: 60, soc: evBuses[0]?.soc || 45, eta: '2h 15m', cost: 420 },
    { id: 'C-02', busId: 'MH12-EF-9012', status: 'complete', kw: 0,  soc: evBuses[2]?.soc || 98, eta: null,     cost: 510 },
    { id: 'C-03', busId: null,            status: 'idle',     kw: 0,  soc: null,                   eta: null,     cost: null },
    { id: 'C-04', busId: null,            status: 'idle',     kw: 0,  soc: null,                   eta: null,     cost: null },
  ];

  const avgSOC       = evBuses.length
    ? Math.round(evBuses.reduce((s, b) => s + (b.soc || 0), 0) / evBuses.length) : 0;
  const lowSOC       = evBuses.filter(b => (b.soc || 0) < 25).length;
  const charging     = Object.values(schedules).filter(s => s.status === 'charging').length;
  const peakSaving   = charging * 60 * 1.8;
  const now          = new Date().getHours();
  const isOffPeak    = now >= 22 || now <= 6;
  const currentTariff = isOffPeak ? '₹4.0/kWh' : now >= 9 && now <= 11 ? '₹9.5/kWh' : '₹7.0/kWh';

  // Optimizer helpers
  function updateSchedBus(id, field, value) {
    setSchedBuses(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));
  }
  function addSchedBus() {
    setSchedBuses(prev => [...prev, { id: makeRowId(), busId: '', outTime: '20:00', inTime: '06:00', kwh: '100', soc: 60 }]);
  }
  function deleteSchedBus(id) {
    setSchedBuses(prev => prev.filter(b => b.id !== id));
  }
  function runSmartSchedule() {
    const busList = schedBuses
      .filter(b => b.busId.trim() && b.outTime && b.inTime)
      .map(b => ({ busId: b.busId.trim(), outTime: b.outTime, inTime: b.inTime, kwh: b.kwh ? Number(b.kwh) : 100, soc: b.soc, numTrips: 1, routes: [] }));
    if (!busList.length) return;
    const minC   = findMinChargers(busList, tariffRates);
    const result = runOptimizer(busList, Math.max(depotChargers, minC), tariffRates);
    setSchedResult({ ...result, minChargers: minC, runAt: new Date() });
  }

  return (
    <>
    <div className="flex flex-col gap-5">

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'EV Fleet',           value: `${evBuses.length} buses`, sub: 'electric in depot',  color: 'text-blue-600'   },
          { label: 'Avg SOC',            value: `${avgSOC}%`,              sub: 'fleet average',      color: avgSOC < 30 ? 'text-red-600' : 'text-green-600' },
          { label: 'Low Battery',        value: lowSOC,                    sub: 'below 25% SOC',      color: lowSOC > 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Currently Charging', value: charging,                  sub: 'chargers active',    color: 'text-blue-600'   },
          { label: 'Tariff Now',         value: currentTariff,             sub: isOffPeak ? 'Off-peak ✓' : 'Peak hours', color: isOffPeak ? 'text-green-600' : 'text-orange-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-slate-500 text-xs mb-1">{s.label}</p>
            <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
            <p className="text-slate-400 text-xs mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {lowSOC > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-3">
          <Battery size={18} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-red-700 font-semibold text-sm">
              {lowSOC} bus{lowSOC > 1 ? 'es' : ''} below 25% SOC
            </p>
            <p className="text-red-500 text-xs mt-0.5">
              Assign to available charger immediately to ensure duty readiness tomorrow.
            </p>
          </div>
        </div>
      )}

      {/* 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Bus Cards */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <h3 className="text-slate-500 text-xs font-medium uppercase tracking-wide">
            EV Fleet Status
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {evBuses.map(bus => (
              <EVBusCard
                key={bus.busId}
                bus={bus}
                schedule={schedules[bus.busId]}
                onStatusChange={setChargeStatus}
              />
            ))}
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex flex-col gap-4">

          {/* Smart Charging Banner */}
          <div className="bg-gradient-to-br from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
            <p className="text-blue-700 font-semibold text-sm flex items-center gap-2 mb-1">
              <Zap size={14} /> Smart Charging
              {schedResult ? ' — Schedule Active' : ' Optimizer'}
            </p>
            {schedResult ? (
              <>
                <p className="text-slate-500 text-xs mb-3">
                  {schedResult.scheduled.length} buses optimally scheduled · run {schedResult.runAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <span className="text-green-700 text-xs font-medium">Est. savings today</span>
                  <span className="text-green-700 font-bold text-sm">{formatINR(schedResult.totalSavings)}</span>
                </div>
                <p className="text-slate-400 text-xs mt-2">vs charging all buses at immediate arrival rate</p>
              </>
            ) : (
              <>
                <p className="text-slate-500 text-xs mb-3">
                  Use the optimizer below to find the cheapest charging windows based on your tariff schedule.
                </p>
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <span className="text-blue-700 text-xs font-medium">Est. savings today</span>
                  <span className="text-blue-700 font-bold text-sm">{formatINR(peakSaving + 840)}</span>
                </div>
                <p className="text-slate-400 text-xs mt-2">vs charging all buses during peak hours (₹9.5/kWh)</p>
              </>
            )}
          </div>

          {/* Tariff Chart */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">
                24h Electricity Tariff
              </p>
              <button
                onClick={() => setTariffOpen(true)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1
                  rounded-lg hover:bg-blue-50 transition-all border border-transparent hover:border-blue-200">
                Edit Schedule
              </button>
            </div>
            <DemandChart tariff={tariffRates} />
            <div className="mt-3 space-y-1.5">
              {[
                { icon: Moon,   label: 'Off-peak (22:00–06:00)',      value: '₹3.8–4.2/kWh', color: 'text-green-600'  },
                { icon: Sun,    label: 'Peak (09:00–11:00)',           value: '₹9.5/kWh',     color: 'text-red-600'    },
                { icon: Sunset, label: 'Evening peak (18:00–21:00)',   value: '₹8.8–9.2/kWh', color: 'text-orange-600' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Icon size={11} className={color} /> {label}
                  </span>
                  <span className={cn('font-medium', color)}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Depot Chargers */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">
              Depot Chargers — {depotChargers} Slots
            </p>
            <div className="grid grid-cols-2 gap-2">
              {chargerSlots.map(slot => (
                <ChargingSlot key={slot.id} slot={slot} />
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ══ Smart Charging Optimizer ═════════════════════════════════════════ */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-slate-800 font-semibold text-sm flex items-center gap-2">
              <Zap size={14} className="text-blue-600" />
              Smart Charging Optimizer
            </p>
            <p className="text-slate-400 text-xs mt-0.5">
              Pre-filled with today's bus data — edit return/depart windows and kWh needed, then run the schedule
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setTariffOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg
                text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors">
              <Settings2 size={12} /> Edit Tariff
            </button>
            <button
              onClick={runSmartSchedule}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-blue-600
                hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm">
              <Play size={12} /> Run Schedule
            </button>
          </div>
        </div>

        {/* Bus Input Table */}
        <div className="p-5">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs min-w-[620px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2.5 text-slate-500 font-medium">Bus ID</th>
                  <th className="text-left px-3 py-2.5 text-slate-500 font-medium">
                    Returns to depot <span className="font-normal text-slate-400">(charging window start)</span>
                  </th>
                  <th className="text-left px-3 py-2.5 text-slate-500 font-medium">
                    Departs depot <span className="font-normal text-slate-400">(charging window end)</span>
                  </th>
                  <th className="text-left px-3 py-2.5 text-slate-500 font-medium">
                    kWh to charge <span className="font-normal text-slate-400">(capacity needed)</span>
                  </th>
                  <th className="text-left px-3 py-2.5 text-slate-500 font-medium">SOC</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedBuses.map(bus => (
                  <tr key={bus.id} className="group hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-2">
                      <input
                        value={bus.busId}
                        onChange={e => updateSchedBus(bus.id, 'busId', e.target.value)}
                        placeholder="e.g. MH12-AB-1234"
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs
                          focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white text-slate-800"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        value={bus.outTime}
                        onChange={e => updateSchedBus(bus.id, 'outTime', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs
                          focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white text-slate-800"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        value={bus.inTime}
                        onChange={e => updateSchedBus(bus.id, 'inTime', e.target.value)}
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs
                          focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white text-slate-800"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        value={bus.kwh}
                        onChange={e => updateSchedBus(bus.id, 'kwh', e.target.value)}
                        placeholder="e.g. 80"
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs
                          focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white text-slate-800"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'px-2 py-0.5 rounded-full text-[10px] font-medium',
                        bus.soc < 25 ? 'bg-red-50 text-red-600' : bus.soc < 60 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
                      )}>
                        {bus.soc}%
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => deleteSchedBus(bus.id)}
                        className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center
                          text-slate-300 hover:text-red-500 rounded transition-all">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer controls */}
          <div className="flex items-center justify-between mt-3 gap-4">
            <button
              onClick={addSchedBus}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600
                border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
              <Plus size={12} /> Add Bus
            </button>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Charger bays in depot:</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={depotChargers}
                  onChange={e => setDepotChargers(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-xs text-center
                    focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
              {schedResult && (
                <span className="text-xs text-slate-400">
                  Min needed: <strong className="text-violet-600">{schedResult.minChargers}</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Results */}
        {schedResult && (
          <div className="border-t border-slate-100 px-5 pb-5 flex flex-col gap-4">
            <p className="text-slate-500 text-[10px] font-medium uppercase tracking-wide pt-4">
              Schedule Results · run at {schedResult.runAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Buses scheduled', value: String(schedResult.scheduled.length), sub: `of ${schedBuses.length} in table`,                        color: 'text-blue-600'   },
                { label: 'Min chargers',    value: String(schedResult.minChargers),       sub: 'bays required to fit all buses',                           color: 'text-violet-600' },
                { label: 'Total cost',      value: formatINR(schedResult.totalCost),      sub: 'off-peak optimised',                                       color: 'text-slate-800'  },
                { label: 'Savings',         value: formatINR(schedResult.totalSavings),   sub: `${schedResult.savingsPct}% vs charging immediately`,       color: 'text-green-600'  },
              ].map(s => (
                <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <p className="text-slate-500 text-xs mb-1">{s.label}</p>
                  <p className={cn('text-lg font-bold', s.color)}>{s.value}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Conflicts */}
            {schedResult.conflicts.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1.5">
                <p className="text-red-700 text-xs font-semibold flex items-center gap-1.5">
                  <AlertTriangle size={12} /> {schedResult.conflicts.length} bus{schedResult.conflicts.length > 1 ? 'es' : ''} could not be scheduled
                </p>
                {schedResult.conflicts.map(c => (
                  <div key={c.busId} className="flex items-start gap-2 text-xs text-red-600">
                    <span className="font-medium min-w-[140px]">{c.busId}</span>
                    <span className="text-red-400">{c.reason}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Timeline */}
            {schedResult.scheduled.length > 0 && (
              <ScheduleTimeline scheduled={schedResult.scheduled} tariff={tariffRates} />
            )}

            {/* Per-bus schedule table */}
            {schedResult.scheduled.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs min-w-[680px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Bus ID</th>
                      <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Charger</th>
                      <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Available window</th>
                      <th className="text-left px-3 py-2.5 text-slate-400 font-medium">Optimal charge slot</th>
                      <th className="text-right px-3 py-2.5 text-slate-400 font-medium">kWh</th>
                      <th className="text-right px-3 py-2.5 text-slate-400 font-medium">Cost</th>
                      <th className="text-right px-4 py-2.5 text-slate-400 font-medium">Saved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {schedResult.scheduled.map(r => (
                      <tr key={r.busId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5">
                            {r.isUrgent && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                            <span className="font-medium text-slate-800">{r.busId}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-blue-600 font-medium">{r.charger}</td>
                        <td className="px-3 py-2.5 text-slate-500">{r.arrives} → {r.departs}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn('font-medium', r.delayed ? 'text-amber-600' : 'text-green-600')}>
                            {r.chargeStart} – {r.chargeEnd}
                          </span>
                          {r.delayed && (
                            <span className="ml-1.5 text-amber-400 text-[10px]">delayed {r.delayMins}m (off-peak)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{r.kWh}</td>
                        <td className="px-3 py-2.5 text-right text-slate-700 font-medium">{formatINR(r.cost)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-green-600">
                          {r.savings > 0 ? `+${formatINR(r.savings)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td colSpan={5} className="px-4 py-2.5 text-slate-500 text-xs font-medium">
                        Total · {schedResult.scheduled.length} buses
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">{formatINR(schedResult.totalCost)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-green-600">+{formatINR(schedResult.totalSavings)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

    </div>

    {tariffOpen && (
      <TariffModal
        rates={tariffRates}
        onClose={() => setTariffOpen(false)}
        onApply={rates => {
          setTariffRates(rates);
          // Re-run schedule with new tariff if results exist
          if (schedResult) {
            const busList = schedBuses
              .filter(b => b.busId.trim() && b.outTime && b.inTime)
              .map(b => ({ busId: b.busId.trim(), outTime: b.outTime, inTime: b.inTime, kwh: b.kwh ? Number(b.kwh) : 100, soc: b.soc, numTrips: 1, routes: [] }));
            if (busList.length) {
              const minC   = findMinChargers(busList, rates);
              const result = runOptimizer(busList, Math.max(depotChargers, minC), rates);
              setSchedResult({ ...result, minChargers: minC, runAt: new Date() });
            }
          }
        }}
      />
    )}
    </>
  );
}
