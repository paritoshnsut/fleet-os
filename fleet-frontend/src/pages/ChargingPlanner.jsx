import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Zap, AlertTriangle, Info,
  UploadCloud, RotateCcw, FileSpreadsheet,
  Pencil, Plus, Trash2, Copy,
} from 'lucide-react';
import { cn, formatINR } from '../lib/utils';

const OPTIMIZER_URL = import.meta.env.VITE_OPTIMIZER_URL ?? 'http://localhost:8000';

/* ── Tariff / scheduler constants ─────────────────────────────────────────── */
const HOUR_TARIFF = [
  4.2, 4.0, 3.8, 3.8, 3.9, 4.2,
  5.1, 6.8, 8.2, 9.5, 9.5, 8.0,
  7.0, 6.5, 6.2, 6.8, 7.5, 8.8,
  9.2, 9.0, 8.0, 6.5, 5.2, 4.5,
];
const CHARGER_KW = 60;
const SLOT_MIN   = 30;
const SLOTS_DAY  = 48;

function hhmmToSlot(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return Math.floor((h * 60 + (m || 0)) / SLOT_MIN);
}
function slotToHHMM(slot) {
  const totalMin = (slot % SLOTS_DAY) * SLOT_MIN;
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
}
function slotTariff(slot) {
  return HOUR_TARIFF[Math.floor((slot % SLOTS_DAY) / 2)];
}
function windowCost(startSlot, numSlots) {
  let c = 0;
  for (let s = 0; s < numSlots; s++) c += slotTariff(startSlot + s) * CHARGER_KW * (SLOT_MIN / 60);
  return c;
}

function runScheduler(busList, numChargers) {
  const TOTAL = SLOTS_DAY * 2;
  const occ   = Array.from({ length: numChargers }, () => new Array(TOTAL).fill(null));

  const entries = busList.map(b => {
    let outSlot = hhmmToSlot(b.outTime) ?? 40;
    let inSlot  = hhmmToSlot(b.inTime)  ?? 12;
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
      const cost = windowCost(start, numSlots);
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
      const naiveCost = windowCost(outSlot, numSlots);
      scheduled.push({
        busId:       bus.busId,
        charger:     `C-${String(bestCharger + 1).padStart(2, '0')}`,
        arrives:     bus.outTime,
        departs:     bus.inTime,
        chargeStart: slotToHHMM(bestStart),
        chargeEnd:   slotToHHMM(bestStart + numSlots),
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
          ? `Window too short — needs ${+(numSlots * SLOT_MIN / 60).toFixed(1)} h to charge ${bus.kwhNeeded} kWh`
          : 'All chargers occupied during available window',
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

function findMinChargers(busList) {
  if (!busList.length) return 1;
  let lo = 1, hi = busList.length, result = busList.length;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (runScheduler(busList, mid).conflicts.length === 0) { result = mid; hi = mid - 1; }
    else lo = mid + 1;
  }
  return result;
}

function hhmmToMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}
function minToHHMM(min) {
  const t = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function greedyVSP(rawTrips) {
  if (!rawTrips.length) return [];
  const sorted = [...rawTrips].sort((a, b) => a.departMin - b.departMin);
  const buses  = [];
  for (const trip of sorted) {
    let bestIdx = -1, bestRet = -Infinity;
    for (let i = 0; i < buses.length; i++) {
      const ret = buses[i].lastReturnMin;
      if (ret <= trip.departMin && ret > bestRet) { bestRet = ret; bestIdx = i; }
    }
    if (bestIdx === -1) { buses.push({ trips: [], lastReturnMin: 0 }); bestIdx = buses.length - 1; }
    buses[bestIdx].trips.push(trip);
    buses[bestIdx].lastReturnMin = trip.returnMin;
  }
  return buses.map((bus, i) => {
    const kwhSum = bus.trips.reduce((s, t) => s + (t.kwh || 0), 0);
    return {
      busId:    `Bus-${String(i + 1).padStart(3, '0')}`,
      outTime:  minToHHMM(Math.max(...bus.trips.map(t => t.returnMin))),
      inTime:   minToHHMM(Math.min(...bus.trips.map(t => t.departMin))),
      kwh:      kwhSum > 0 ? Math.round(kwhSum) : null,
      soc:      60,
      numTrips: bus.trips.length,
      routes:   bus.trips.map(t => t.tripLabel),
    };
  });
}

/* ── Excel parsing ────────────────────────────────────────────────────────── */
function normalizeKey(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function toHHMM(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    const totalMin = Math.round(raw * 1440);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(raw).trim();
  if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
  if (/^\d{3,4}$/.test(s)) {
    const h = s.length === 3 ? s[0] : s.slice(0, 2);
    const m = s.slice(-2);
    return `${h.padStart(2, '0')}:${m}`;
  }
  return s;
}

const PURE_BUS_CANDIDATES = ['busid','busno','busnumber','busnos','vehicleno','vehicleid','vehicle','busname'];
const ROUTE_CANDIDATES    = ['routename','route','routeno','routenumber','routeid'];
const SERIAL_CANDIDATES   = ['sl','slno','sno','srno','serialno','serialnumber','no'];
const BUS_CANDIDATES      = [...PURE_BUS_CANDIDATES, ...ROUTE_CANDIDATES, ...SERIAL_CANDIDATES];
const START_CANDIDATES    = ['chargestarttime','chargestart','starttime','start','outtime','out','releasetime','returntime','arrivaltime','arrival','plugintime','plugin','from'];
const END_CANDIDATES      = ['chargeendtime','chargeend','endtime','end','intime','in','reportingtime','departuretime','departure','plugouttime','plugout','to'];
const KWH_CANDIDATES      = ['kwh','energykwh','energy'];
const COST_CANDIDATES     = ['costinr','cost','price','amount','fare'];

function findColIdx(headers, candidates) {
  return headers.findIndex(h => candidates.includes(normalizeKey(h)));
}

function parseChargeExcel(file, onDone, onError) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb  = XLSX.read(e.target.result, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      if (!raw.length) { onError('No data found in the sheet.'); return; }

      function looksLikeHeader(row) {
        const cells  = row.map(c => String(c ?? '').trim());
        const normed = cells.map(normalizeKey);
        const hasTime = normed.some(n => START_CANDIDATES.includes(n) || END_CANDIDATES.includes(n) || n.includes('intime') || n.includes('outtime') || n === 'time');
        const hasBus  = normed.some(n => BUS_CANDIDATES.includes(n) || n.includes('bus') || n.includes('vehicle') || n === 'sl');
        return (hasTime || hasBus) && cells.filter(Boolean).length >= 2;
      }

      function colsFrom(row) {
        const h = row.map(c => String(c ?? '').trim());
        return {
          idxBus:    findColIdx(h, PURE_BUS_CANDIDATES),
          idxRoute:  findColIdx(h, ROUTE_CANDIDATES),
          idxSerial: findColIdx(h, SERIAL_CANDIDATES),
          idxStart:  findColIdx(h, START_CANDIDATES),
          idxEnd:    findColIdx(h, END_CANDIDATES),
          idxKwh:    findColIdx(h, KWH_CANDIDATES),
          idxCost:   findColIdx(h, COST_CANDIDATES),
        };
      }

      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(raw.length, 15); i++) {
        if (looksLikeHeader(raw[i])) { headerRowIdx = i; break; }
      }
      if (headerRowIdx === -1) {
        for (let i = 0; i < Math.min(raw.length, 15); i++) {
          if (raw[i].filter(c => c != null && String(c).trim() !== '').length >= 3) { headerRowIdx = i; break; }
        }
      }
      if (headerRowIdx === -1) { onError('Could not find a header row in the sheet.'); return; }

      let cols = colsFrom(raw[headerRowIdx]);
      if (cols.idxStart === -1 || cols.idxEnd === -1) {
        const found = raw[headerRowIdx].filter(Boolean).join(', ');
        onError(`Could not find required columns (Start Time / Out Time, End Time / In Time).\nHeaders detected on row ${headerRowIdx + 1}: ${found || '(none)'}\nExpected names like: Bus No / Bus ID · Out Time / In Time`);
        return;
      }

      const busByName = {};
      for (let i = headerRowIdx + 1; i < raw.length; i++) {
        const row = raw[i];
        if (!row || row.every(c => c == null || String(c).trim() === '')) continue;
        if (looksLikeHeader(row)) {
          const newCols = colsFrom(row);
          if (newCols.idxStart !== -1 && newCols.idxEnd !== -1) cols = newCols;
          continue;
        }
        const busIdRaw = cols.idxBus    >= 0 ? String(row[cols.idxBus]    ?? '').trim() : '';
        const route    = cols.idxRoute  >= 0 ? String(row[cols.idxRoute]  ?? '').trim() : '';
        const serial   = cols.idxSerial >= 0 ? String(row[cols.idxSerial] ?? '').trim() : '';
        const busId    = busIdRaw || (route && serial ? `${route} #${serial}` : (route || serial));
        if (!busId) continue;
        const start = toHHMM(row[cols.idxStart]);
        const end   = toHHMM(row[cols.idxEnd]);
        if (!start || !end) continue;
        if (!busByName[busId]) busByName[busId] = [];
        busByName[busId].push({
          start, end,
          kwh:  cols.idxKwh  >= 0 ? Number(row[cols.idxKwh])  || null : null,
          cost: cols.idxCost >= 0 ? Number(row[cols.idxCost]) || null : null,
        });
      }

      const buses = Object.entries(busByName).map(([busId, chargeEvents]) => ({ busId, chargeEvents }));
      if (!buses.length) { onError('No valid charge rows found after the header row.'); return; }
      onDone({ fileName: file.name, buses, loadedAt: new Date().toISOString() });
    } catch (err) {
      onError(err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ── Component ────────────────────────────────────────────────────────────── */
let _uid = 0;
const makeId = () => `r${++_uid}-${Date.now()}`;

const DEMO_ROWS = [
  { id: 'd1', busId: 'MH12-AB-0001', outTime: '20:30', inTime: '06:00', kwh: '85', copyCount: 1 },
  { id: 'd2', busId: 'MH12-CD-0002', outTime: '21:00', inTime: '05:45', kwh: '90', copyCount: 1 },
  { id: 'd3', busId: 'MH12-EF-0003', outTime: '19:45', inTime: '06:15', kwh: '',   copyCount: 1 },
];

/* ── Charger Timeline visualisation ──────────────────────────────────────── */
function ChargerTimeline({ scheduled, tariff }) {
  const containerRef           = useRef(null);
  const [svgWidth, setSvgWidth] = useState(900);
  const [tooltip, setTooltip]   = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) =>
      setSvgWidth(Math.floor(e.contentRect.width) || 900)
    );
    ro.observe(containerRef.current);
    setSvgWidth(Math.floor(containerRef.current.offsetWidth) || 900);
    return () => ro.disconnect();
  }, []);

  const groups = {};
  for (const b of scheduled) {
    if (!groups[b.charger]) groups[b.charger] = [];
    groups[b.charger].push(b);
  }
  const chargers = Object.keys(groups).sort();

  function toAbsMin(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = String(hhmm).split(':').map(Number);
    let min = h * 60 + (m || 0);
    if (min < 14 * 60) min += 24 * 60;
    return min;
  }

  const allMins = scheduled.flatMap(b => [toAbsMin(b.arrives), toAbsMin(b.departs)]);
  const T_START = Math.max(14 * 60, Math.floor(Math.min(...allMins) / 60) * 60 - 60);
  const T_END   = Math.min(38 * 60, Math.ceil(Math.max(...allMins) / 60) * 60 + 60);
  const T_RANGE = T_END - T_START;

  const ROW_H    = 40;
  const TARIFF_H = 52;
  const PAD_L    = 62;
  const PAD_R    = 24;
  const PAD_T    = 14;
  const PAD_B    = 34;
  const W        = Math.max(100, svgWidth - PAD_L - PAD_R);
  const SVG_H    = PAD_T + TARIFF_H + 10 + chargers.length * ROW_H + PAD_B;

  function tx(hhmm) {
    if (!hhmm) return 0;
    return Math.max(0, Math.min(W, ((toAbsMin(hhmm) - T_START) / T_RANGE) * W));
  }

  const startH = Math.floor(T_START / 60);
  const endH   = Math.ceil(T_END / 60);

  const bands = [];
  for (let h = startH; h < endH; h++) {
    const rate = tariff[h % 24];
    const norm = (rate - 3.8) / (9.5 - 3.8);
    const x    = Math.max(0, ((h * 60 - T_START) / T_RANGE) * W);
    const bw   = (60 / T_RANGE) * W;
    bands.push({ h, rate, norm, x, bw, barH: Math.round(norm * TARIFF_H * 0.80) + 6 });
  }

  const ticks = [];
  for (let h = startH; h <= endH; h += 2) {
    const x = ((h * 60 - T_START) / T_RANGE) * W;
    if (x >= -1 && x <= W + 1)
      ticks.push({ x, label: `${String(h % 24).padStart(2, '0')}:00` });
  }

  const COLORS = { optimised: '#10b981', immediate: '#6366f1', urgent: '#f97316' };
  function barColor(b) {
    return b.isUrgent ? COLORS.urgent : b.delayed ? COLORS.optimised : COLORS.immediate;
  }

  const TTIP_W = 216;
  const TTIP_H = 120;

  function handleMove(e, bus) {
    if (!containerRef.current) return;
    const r  = containerRef.current.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const cH = containerRef.current.offsetHeight;
    const cW = containerRef.current.offsetWidth;
    setTooltip({
      bus,
      x: Math.min(cx + 18, cW - TTIP_W - 8),
      y: cy + 20 + TTIP_H > cH ? cy - TTIP_H - 12 : cy + 20,
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-slate-800 font-semibold text-sm">Charger Bay Timeline</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Each row = one charger · bars = charging windows · background = tariff intensity · hover a bar for details
          </p>
        </div>
        <div className="flex items-center gap-5 text-xs">
          {[
            [COLORS.optimised, 'Delayed (off-peak)'],
            [COLORS.immediate, 'Immediate'],
            [COLORS.urgent,    'Urgent (low SOC)'],
          ].map(([col, label]) => (
            <span key={label} className="flex items-center gap-1.5 text-slate-500">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 inline-block"
                style={{ backgroundColor: col, opacity: 0.9 }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div ref={containerRef} className="relative w-full">
        <svg width="100%" height={SVG_H}
          viewBox={`0 0 ${svgWidth} ${SVG_H}`}
          className="select-none"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <filter id="ctglow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
              <feFlood floodColor="#6366f1" floodOpacity="0.5" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="shadow" />
              <feMerge><feMergeNode in="shadow" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Subtle tariff column shading */}
          {bands.map(b => (
            <rect key={`bg-${b.h}`}
              x={PAD_L + b.x} y={PAD_T}
              width={Math.max(0.5, b.bw)}
              height={TARIFF_H + 10 + chargers.length * ROW_H}
              fill={`hsl(${Math.round((1 - b.norm) * 120)},80%,52%)`}
              opacity={0.022 + b.norm * 0.085}
            />
          ))}

          {/* Tariff sparkline bars */}
          {bands.map(b => (
            <rect key={`bar-${b.h}`}
              x={PAD_L + b.x + 1.5} y={PAD_T + TARIFF_H - b.barH}
              width={Math.max(0.5, b.bw - 3)} height={b.barH}
              fill={`hsl(${Math.round((1 - b.norm) * 120)},68%,44%)`}
              opacity={0.82} rx="2.5"
            />
          ))}

          {/* Rate axis labels */}
          <text x={PAD_L - 8} y={PAD_T + 11}           textAnchor="end" fontSize="9" fill="#94a3b8">₹9.5</text>
          <text x={PAD_L - 8} y={PAD_T + TARIFF_H - 2}  textAnchor="end" fontSize="9" fill="#94a3b8">₹3.8</text>
          <text x={PAD_L - 8} y={PAD_T + TARIFF_H / 2 + 4} textAnchor="end" fontSize="8" fill="#cbd5e1">₹/kWh</text>

          {/* Sparkline baseline */}
          <line x1={PAD_L} y1={PAD_T + TARIFF_H + 5}
                x2={PAD_L + W} y2={PAD_T + TARIFF_H + 5}
            stroke="#e2e8f0" strokeWidth="1.5" />

          {/* Vertical grid + time labels */}
          {ticks.map(t => (
            <g key={t.label}>
              <line x1={PAD_L + t.x} y1={PAD_T + TARIFF_H + 5}
                    x2={PAD_L + t.x} y2={PAD_T + TARIFF_H + 10 + chargers.length * ROW_H}
                stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3,4" />
              <text x={PAD_L + t.x} y={SVG_H - 9}
                textAnchor="middle" fontSize="10" fill="#94a3b8">{t.label}</text>
            </g>
          ))}

          {/* Charger rows */}
          {chargers.map((charger, ci) => {
            const y0 = PAD_T + TARIFF_H + 10 + ci * ROW_H;
            return (
              <g key={charger}>
                <rect x={PAD_L} y={y0 + 1} width={W} height={ROW_H - 1}
                  fill={ci % 2 === 0 ? '#f8fafc' : '#ffffff'} />
                <text x={PAD_L - 9} y={y0 + ROW_H / 2 + 4}
                  textAnchor="end" fontSize="10" fill="#64748b" fontWeight="600">{charger}</text>

                {groups[charger].map(bus => {
                  const ax  = tx(bus.arrives);
                  const dx  = tx(bus.departs);
                  const cx  = tx(bus.chargeStart);
                  const ex  = tx(bus.chargeEnd);
                  const bw  = Math.max(4, ex - cx);
                  const col = barColor(bus);
                  const isHov = tooltip?.bus?.busId === bus.busId;

                  return (
                    <g key={bus.busId}
                      onMouseMove={e => handleMove(e, bus)}
                      onMouseLeave={() => setTooltip(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Charge bar */}
                      <rect x={PAD_L + cx} y={y0 + 8}
                        width={bw} height={ROW_H - 16}
                        fill={col} rx="6"
                        opacity={isHov ? 1 : 0.84}
                        filter={isHov ? 'url(#ctglow)' : undefined}
                        style={{ transition: 'opacity 0.1s' }}
                      />
                      {bw > 36 && (
                        <text x={PAD_L + cx + bw / 2} y={y0 + ROW_H / 2 + 4}
                          textAnchor="middle" fontSize={bw > 58 ? '9' : '8'}
                          fill="white" fontWeight="700" opacity={0.95}>
                          {bus.busId.replace(/^Bus-0*/, 'B')}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Left axis border */}
          <line x1={PAD_L} y1={PAD_T}
                x2={PAD_L} y2={PAD_T + TARIFF_H + 10 + chargers.length * ROW_H}
            stroke="#e2e8f0" strokeWidth="1" />
        </svg>

        {/* Floating tooltip — appears near cursor, no scrolling needed */}
        {tooltip && (() => {
          const b       = tooltip.bus;
          const col     = barColor(b);
          const strategy = b.isUrgent
            ? 'Urgent charge'
            : b.delayed
            ? `Delayed ${b.delayMins}m → off-peak`
            : 'Immediate charge';
          return (
            <div className="absolute z-50 pointer-events-none"
              style={{ left: tooltip.x, top: tooltip.y }}>
              <div className="rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden"
                style={{ width: TTIP_W, background: '#0f172a' }}>
                {/* Coloured top strip */}
                <div className="h-1 w-full" style={{ background: col }} />
                <div className="p-3.5 text-[11px]">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="font-semibold text-[13px] text-white leading-none">{b.busId}</span>
                    <span className="ml-auto text-slate-400 font-medium text-[10px]">{b.charger}</span>
                  </div>
                  <div className="space-y-1.5 text-slate-300">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Available</span>
                      <span>{b.arrives} → {b.departs}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Charging</span>
                      <span style={{ color: col }}>{b.chargeStart} – {b.chargeEnd}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500">Strategy</span>
                      <span className="text-right">{strategy}</span>
                    </div>
                    <div className="border-t border-slate-700 pt-1.5 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="text-slate-400">{b.kWh} kWh</span>
                      <span className="ml-auto text-white font-semibold">{formatINR(b.cost)}</span>
                      {b.savings > 0 && (
                        <span style={{ color: '#34d399' }} className="font-bold">+{formatINR(b.savings)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default function ChargingPlanner() {
  const [chargePlan,        setChargePlan]        = useState(null);
  const [parseError,        setParseError]        = useState('');
  const [dragging,          setDragging]          = useState(false);
  const [inputMode,         setInputMode]         = useState('excel');
  const [manualRows,        setManualRows]        = useState(DEMO_ROWS);
  const [isDemoMode,        setIsDemoMode]        = useState(true);
  const [optimizerLoading,  setOptimizerLoading]  = useState(false);
  const [usedFallback,      setUsedFallback]      = useState(false);
  const [infoTip,           setInfoTip]           = useState(null);
  const fileRef = useRef(null);

  const COL_INFO = {
    cost: {
      title: 'How cost is calculated',
      body:  'kWh needed × tariff rate at the scheduled charge hour (₹/kWh). kWh is derived from the bus energy capacity × (100% – current SoC%). The rate varies by hour — off-peak (e.g. 02:00) can be as low as ₹3.8/kWh vs ₹9.5/kWh at peak.',
    },
    saved: {
      title: 'How savings are calculated',
      body:  'Immediate cost (charging the moment the bus arrives, at that hour\'s rate) minus the optimised cost (charging delayed to the cheapest window within the bus\'s dwell time). Zero if no cheaper window was available.',
    },
  };

  function scheduleAndStore(busList, meta) {
    const minChargers = findMinChargers(busList);
    const result      = runScheduler(busList, minChargers);
    const busDetails  = Object.fromEntries(
      busList.map(b => [b.busId, { numTrips: b.numTrips ?? 1, routes: b.routes ?? [] }])
    );
    setChargePlan({ ...meta, minChargers, busDetails, ...result });
  }

  function busFromBackendLeg(bus) {
    const endMins    = bus.legs.map(l => l.end_min);
    const startMins  = bus.legs.map(l => l.start_min);
    const toHM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return {
      busId:    `Bus-${String(bus.bus_id).padStart(3, '0')}`,
      outTime:  toHM(Math.max(...endMins)),
      inTime:   toHM(Math.min(...startMins)),
      kwh:      null, soc: 60,
      numTrips: bus.leg_count,
      routes:   bus.legs.map(l => l.route_name),
    };
  }

  async function handleFile(f) {
    if (!f) return;
    setParseError('');
    setUsedFallback(false);
    setOptimizerLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('benchmark_buses', 999);
      const res = await fetch(`${OPTIMIZER_URL}/optimize`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).detail ?? 'Optimizer error');
      const data = await res.json();
      const busList = data.greedy.buses.map(busFromBackendLeg);
      setOptimizerLoading(false);
      scheduleAndStore(busList, {
        fileName: f.name, loadedAt: new Date().toISOString(),
        source: 'excel', totalTrips: data.summary.total_trips,
        algorithm: 'greedy (backend)',
      });
      return;
    } catch {
      setUsedFallback(true);
    }
    setOptimizerLoading(false);

    parseChargeExcel(f, parsed => {
      const rawTrips = parsed.buses.flatMap(b =>
        b.chargeEvents.map((ev, i) => ({
          tripLabel:  b.chargeEvents.length > 1 ? `${b.busId} (trip ${i + 1})` : b.busId,
          departMin:  hhmmToMin(ev.end),
          returnMin:  hhmmToMin(ev.start),
          kwh:        ev.kwh,
        }))
      );
      if (!rawTrips.length) { setParseError('No valid trips found in the sheet.'); return; }
      const busList = greedyVSP(rawTrips);
      scheduleAndStore(busList, {
        fileName: parsed.fileName, loadedAt: parsed.loadedAt,
        source: 'excel', totalTrips: rawTrips.length,
        algorithm: 'greedy (client-side, no seat constraints)',
      });
    }, setParseError);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }

  function switchMode(m) { setInputMode(m); setParseError(''); }

  function updateRow(id, field, value) {
    setIsDemoMode(false);
    setManualRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  }

  function addRow() {
    setIsDemoMode(false);
    setManualRows(prev => {
      const last = prev[prev.length - 1];
      return [...prev, { id: makeId(), busId: '', outTime: last?.outTime || '20:00', inTime: last?.inTime || '06:00', kwh: '', copyCount: 1 }];
    });
  }

  function deleteRow(id) {
    setManualRows(prev => {
      const next = prev.filter(r => r.id !== id);
      return next.length ? next : [{ id: makeId(), busId: '', outTime: '20:00', inTime: '06:00', kwh: '', copyCount: 1 }];
    });
  }

  function copyRow(id) {
    setManualRows(prev => {
      const idx = prev.findIndex(r => r.id === id);
      if (idx === -1) return prev;
      const src = prev[idx];
      const n = Math.max(1, Math.min(200, parseInt(src.copyCount) || 1));
      const copies = Array.from({ length: n }, (_, i) => ({ ...src, id: `${makeId()}-${i}`, copyCount: 1 }));
      return [...prev.slice(0, idx + 1), ...copies, ...prev.slice(idx + 1)];
    });
  }

  function clearToBlank() {
    setIsDemoMode(false);
    setManualRows([{ id: makeId(), busId: '', outTime: '20:00', inTime: '06:00', kwh: '', copyCount: 1 }]);
  }

  function loadManualSchedule() {
    setParseError('');
    const busList = [];
    manualRows.forEach(row => {
      const busId = row.busId.trim();
      if (!busId || !row.outTime || !row.inTime) return;
      busList.push({ busId, outTime: row.outTime, inTime: row.inTime, kwh: row.kwh ? Number(row.kwh) : null, soc: 60, numTrips: 1, routes: [] });
    });
    if (!busList.length) { setParseError('Fill at least one row with Bus ID, Out Time and In Time.'); return; }
    scheduleAndStore(busList, { fileName: 'Manual Entry', loadedAt: new Date().toISOString(), source: 'manual', totalTrips: busList.length });
  }

  return (
    <div className="flex flex-col gap-5">

      <div>
        <h2 className="text-slate-800 font-semibold text-lg">EV Charging Planner</h2>
        <p className="text-slate-400 text-sm mt-0.5">
          Upload a bus schedule or enter windows manually — the planner finds the lowest-cost off-peak charging slots.
        </p>
      </div>

      {/* Optimizer loading */}
      {optimizerLoading && (
        <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center">
            <Zap size={22} className="text-white" />
          </div>
          <div className="text-center">
            <p className="text-slate-800 font-semibold">Running trip scheduler…</p>
            <p className="text-slate-400 text-xs mt-1">Calling optimizer · accounting for seat class constraints</p>
          </div>
          <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}

      {chargePlan ? (
        <div className="flex flex-col gap-4">

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Buses needed', value: `${chargePlan.scheduled.length}`,  sub: `from ${chargePlan.totalTrips ?? chargePlan.scheduled.length} routes in sheet`, color: 'text-blue-600'   },
              { label: 'Min chargers', value: `${chargePlan.minChargers}`,        sub: 'charger bays required',                                                        color: 'text-violet-600' },
              { label: 'Total cost',   value: formatINR(chargePlan.totalCost),    sub: 'off-peak optimized',                                                           color: 'text-slate-800'  },
              { label: 'Savings',      value: formatINR(chargePlan.totalSavings), sub: `${chargePlan.savingsPct}% vs immediate charge`,                               color: 'text-green-600'  },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
                <p className="text-slate-500 text-xs mb-1">{s.label}</p>
                <p className={cn('text-lg font-bold', s.color)}>{s.value}</p>
                <p className="text-slate-400 text-xs mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {usedFallback && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-700 text-xs font-semibold">Optimizer server unavailable — using client-side estimate</p>
                <p className="text-amber-600 text-xs mt-0.5">
                  Bus count may be lower than actual because seat-class constraints are not applied.
                  Start the optimizer server on port 8000 and re-upload for an accurate schedule.
                </p>
              </div>
            </div>
          )}

          {chargePlan.conflicts.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
              <p className="text-red-700 text-sm font-semibold flex items-center gap-2">
                <AlertTriangle size={14} /> {chargePlan.conflicts.length} bus{chargePlan.conflicts.length > 1 ? 'es' : ''} could not be scheduled
              </p>
              {chargePlan.conflicts.map(c => (
                <div key={c.busId} className="flex items-start gap-2 text-xs text-red-600">
                  <span className="font-medium min-w-[140px]">{c.busId}</span>
                  <span className="text-red-400">{c.reason}</span>
                </div>
              ))}
              <p className="text-red-400 text-xs mt-1">Try increasing charger count or extending the charging window for these buses.</p>
            </div>
          )}

          {/* Charger Timeline visualization */}
          <ChargerTimeline scheduled={chargePlan.scheduled} tariff={HOUR_TARIFF} />

          {/* Schedule table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <Zap size={15} className="text-green-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-slate-800 text-sm font-semibold">Optimized Charging Schedule</p>
                  <p className="text-slate-400 text-xs truncate">
                    {chargePlan.fileName} · {chargePlan.minChargers} charger{chargePlan.minChargers !== 1 ? 's' : ''} minimum
                    {chargePlan.algorithm && <span className="ml-1 text-slate-300">· {chargePlan.algorithm}</span>}
                    {' '}· loaded {new Date(chargePlan.loadedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setChargePlan(null); setParseError(''); setUsedFallback(false); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200
                  text-slate-500 text-xs hover:bg-slate-50 hover:text-slate-700 transition-colors flex-shrink-0"
              >
                <RotateCcw size={12} /> Start over
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[820px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2.5 text-slate-400 font-medium w-40">Bus ID</th>
                    <th className="text-left px-3 py-2.5 text-slate-400 font-medium w-16">Charger</th>
                    <th className="text-left px-3 py-2.5 text-slate-400 font-medium w-32">Returns → Departs</th>
                    <th className="text-left px-3 py-2.5 text-slate-400 font-medium w-36">Optimal window</th>
                    <th className="text-left px-3 py-2.5 text-slate-400 font-medium w-16">Delay</th>
                    <th className="text-right px-3 py-2.5 text-slate-400 font-medium w-20">kWh</th>
                    <th className="text-right px-3 py-2.5 text-slate-400 font-medium w-24">
                      <span className="inline-flex items-center justify-end gap-1">
                        Cost
                        <button
                          onMouseEnter={e => setInfoTip({ which: 'cost', rect: e.currentTarget.getBoundingClientRect() })}
                          onMouseLeave={() => setInfoTip(null)}
                          className="text-slate-300 hover:text-blue-400 transition-colors"
                        ><Info size={11} /></button>
                      </span>
                    </th>
                    <th className="text-right px-4 py-2.5 text-slate-400 font-medium w-24">
                      <span className="inline-flex items-center justify-end gap-1">
                        Saved
                        <button
                          onMouseEnter={e => setInfoTip({ which: 'saved', rect: e.currentTarget.getBoundingClientRect() })}
                          onMouseLeave={() => setInfoTip(null)}
                          className="text-slate-300 hover:text-green-400 transition-colors"
                        ><Info size={11} /></button>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {chargePlan.scheduled.map(r => (
                    <tr key={r.busId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {r.isUrgent && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="Low SOC — urgent" />}
                          <span className="font-medium text-slate-800">{r.busId}</span>
                        </div>
                        {chargePlan.busDetails?.[r.busId]?.numTrips > 1 && (
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-tight" title={chargePlan.busDetails[r.busId].routes.join(', ')}>
                            {chargePlan.busDetails[r.busId].numTrips} routes
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-blue-600 font-medium">{r.charger}</td>
                      <td className="px-3 py-2.5 text-slate-500">{r.arrives} → {r.departs}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('font-medium', r.delayed ? 'text-amber-600' : 'text-green-600')}>
                          {r.chargeStart} – {r.chargeEnd}
                        </span>
                        {r.delayed && <span className="ml-1.5 text-amber-400 text-[10px]">delayed {r.delayMins}m</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {r.delayed ? `+${r.delayMins}m` : <span className="text-green-500">now</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{r.kWh}</td>
                      <td
                        className="px-3 py-2.5 text-right text-slate-700 font-medium cursor-help underline decoration-dotted decoration-slate-300"
                        onMouseEnter={e => setInfoTip({ which: 'cost-row', rect: e.currentTarget.getBoundingClientRect(), row: r })}
                        onMouseLeave={() => setInfoTip(null)}
                      >{formatINR(r.cost)}</td>
                      <td
                        className="px-4 py-2.5 text-right font-semibold text-green-600 cursor-help underline decoration-dotted decoration-green-300"
                        onMouseEnter={e => setInfoTip({ which: 'saved-row', rect: e.currentTarget.getBoundingClientRect(), row: r })}
                        onMouseLeave={() => setInfoTip(null)}
                      >{r.savings > 0 ? `+${formatINR(r.savings)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={6} className="px-4 py-2.5 text-slate-500 text-xs font-medium">
                      Total · {chargePlan.scheduled.length} buses scheduled
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-800">{formatINR(chargePlan.totalCost)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-600">+{formatINR(chargePlan.totalSavings)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        {/* Unified tooltip — fixed positioning escapes table overflow */}
        {infoTip && (() => {
          const pos = infoTip.rect;
          // Flip tooltip above the cell when too close to viewport bottom
          const APPROX_H = infoTip.which === 'saved-row' ? 148 : 130;
          const tipTop = pos.bottom + 8 + APPROX_H > window.innerHeight
            ? pos.top - APPROX_H - 8
            : pos.bottom + 8;

          /* ── Header ⓘ: general formula explanation ── */
          if (infoTip.which === 'cost' || infoTip.which === 'saved') {
            const tip = COL_INFO[infoTip.which];
            return (
              <div className="fixed z-[9999] pointer-events-none"
                style={{ top: tipTop, left: Math.max(8, pos.left + pos.width / 2 - 130) }}>
                <div className="bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700/50 p-3.5 w-64">
                  <p className="font-semibold text-[11px] mb-1.5">{tip.title}</p>
                  <p className="text-slate-300 text-[10px] leading-relaxed">{tip.body}</p>
                </div>
              </div>
            );
          }

          /* ── Per-row: actual math for this bus ── */
          const row = infoTip.row;
          if (!row) return null;
          const actualRate = row.kWh > 0 ? +(row.cost    / row.kWh).toFixed(2) : 0;
          const naiveRate  = row.kWh > 0 ? +(row.naiveCost / row.kWh).toFixed(2) : 0;
          const tipLeft    = Math.max(8, pos.left - 260);

          if (infoTip.which === 'cost-row') {
            return (
              <div className="fixed z-[9999] pointer-events-none"
                style={{ top: tipTop, left: tipLeft }}>
                <div className="bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden w-60">
                  <div className="h-0.5 w-full bg-indigo-500" />
                  <div className="p-3.5 text-[11px]">
                    <p className="font-semibold text-white mb-2.5">Cost breakdown · {row.busId}</p>
                    <div className="space-y-1.5 text-slate-300">
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Energy needed</span>
                        <span>{row.kWh} kWh</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Rate at {row.chargeStart}</span>
                        <span>₹{actualRate}/kWh</span>
                      </div>
                      <div className="border-t border-slate-700 pt-1.5 flex justify-between gap-4 font-bold">
                        <span className="text-slate-400">{row.kWh} × ₹{actualRate}</span>
                        <span className="text-white">{formatINR(row.cost)}</span>
                      </div>
                    </div>
                    {row.delayed && (
                      <p className="text-emerald-400 text-[10px] mt-2">
                        Delayed {row.delayMins}m from {row.arrives} → cheaper off-peak rate
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          /* saved-row */
          const savingsPct = row.naiveCost > 0
            ? Math.round((row.savings / row.naiveCost) * 100) : 0;
          return (
            <div className="fixed z-[9999] pointer-events-none"
              style={{ top: tipTop, left: tipLeft }}>
              <div className="bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700/50 overflow-hidden w-64">
                <div className="h-0.5 w-full bg-emerald-500" />
                <div className="p-3.5 text-[11px]">
                  <p className="font-semibold text-white mb-2.5">Savings breakdown · {row.busId}</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">If charged at {row.arrives}</span>
                      <span className="text-red-400 font-medium">
                        {row.kWh} × ₹{naiveRate} = {formatINR(row.naiveCost)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Optimised at {row.chargeStart}</span>
                      <span className="text-emerald-400 font-medium">
                        {row.kWh} × ₹{actualRate} = {formatINR(row.cost)}
                      </span>
                    </div>
                    <div className="border-t border-slate-700 pt-1.5 flex justify-between gap-4 font-bold">
                      <span className="text-slate-400">You saved ({savingsPct}% cheaper)</span>
                      <span className="text-emerald-400">+{formatINR(row.savings)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
      ) : (
        /* Input section */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">

          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-slate-800 text-sm font-semibold">Charging Schedule</p>
              <p className="text-slate-400 text-xs mt-0.5">
                {inputMode === 'excel' ? 'Upload an Excel sheet to populate the schedule' : 'Enter bus charging windows directly in the browser'}
              </p>
            </div>
            <div className="flex border border-slate-200 rounded-lg overflow-hidden text-xs flex-shrink-0">
              {[['excel', FileSpreadsheet, 'Upload Excel'], ['manual', Pencil, 'Enter Manually']].map(([m, Icon, label]) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  className={cn(
                    'px-3 py-2 font-medium flex items-center gap-1.5 transition-colors',
                    inputMode === m ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
                  )}
                >
                  <Icon size={12} />{label}
                </button>
              ))}
            </div>
          </div>

          {inputMode === 'excel' ? (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'mx-5 my-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-3',
                  'py-10 cursor-pointer transition-colors select-none',
                  dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                )}
              >
                <UploadCloud size={28} className={dragging ? 'text-blue-500' : 'text-slate-300'} />
                <div className="text-center">
                  <p className="text-slate-600 text-sm font-medium">Drop your charging schedule here</p>
                  <p className="text-slate-400 text-xs mt-1">or click to browse · .xlsx / .xls</p>
                </div>
                <p className="text-slate-300 text-xs">Columns needed: Bus ID · Out Time · In Time</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              {parseError && (
                <div className="mx-5 mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700 whitespace-pre-line">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  {parseError}
                </div>
              )}
            </>
          ) : (
            <div className="p-5 space-y-4">
              {isDemoMode && (
                <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                  <p className="text-amber-700 text-xs">Example rows shown — edit any cell to start, or clear all and add your own</p>
                  <button onClick={clearToBlank} className="text-amber-600 text-xs font-semibold hover:text-amber-800 ml-4 flex-shrink-0">Clear all</button>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs min-w-[640px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-48">Bus ID / Route Name</th>
                      <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-36">Out Time <span className="font-normal text-slate-400">(charge start)</span></th>
                      <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-36">In Time <span className="font-normal text-slate-400">(charge end)</span></th>
                      <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-28">kWh <span className="font-normal text-slate-400">(optional)</span></th>
                      <th className="text-left px-3 py-2.5 text-slate-500 font-medium w-40">Duplicate row ×N</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {manualRows.map(row => {
                      const inputCls = cn(
                        'w-full border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300 transition-colors',
                        isDemoMode ? 'border-slate-200 bg-slate-50 text-slate-400 italic' : 'border-slate-200 bg-white text-slate-800'
                      );
                      return (
                        <tr key={row.id} className="group hover:bg-slate-50/50 transition-colors">
                          <td className="px-3 py-2">
                            <input value={row.busId} onChange={e => updateRow(row.id, 'busId', e.target.value)} placeholder="e.g. MH12-AB-0001" className={inputCls} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="time" value={row.outTime} onChange={e => updateRow(row.id, 'outTime', e.target.value)} className={inputCls} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="time" value={row.inTime} onChange={e => updateRow(row.id, 'inTime', e.target.value)} className={inputCls} />
                          </td>
                          <td className="px-3 py-2">
                            <input type="number" value={row.kwh} onChange={e => updateRow(row.id, 'kwh', e.target.value)} placeholder="auto" min="0" className={inputCls} />
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number" value={row.copyCount} min="1" max="200"
                                onChange={e => setManualRows(prev => prev.map(r => r.id === row.id ? { ...r, copyCount: Math.max(1, Math.min(200, parseInt(e.target.value) || 1)) } : r))}
                                className="w-14 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-blue-300 bg-white"
                              />
                              <button onClick={() => copyRow(row.id)} className="flex items-center gap-1 px-2 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap">
                                <Copy size={11} /> Copy
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => deleteRow(row.id)} className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center text-slate-300 hover:text-red-500 rounded transition-all">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button onClick={addRow} className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
                  <Plus size={13} /> Add Row
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs">{manualRows.length} row{manualRows.length !== 1 ? 's' : ''}</span>
                  <button onClick={loadManualSchedule} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
                    Load Schedule →
                  </button>
                </div>
              </div>

              {parseError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-700">
                  <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                  {parseError}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
