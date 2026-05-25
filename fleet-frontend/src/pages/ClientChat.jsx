import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Send, FileSpreadsheet, X, Bot, Download, CheckCircle } from 'lucide-react';
import { cn } from '../lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────
const delay = ms => new Promise(r => setTimeout(r, ms));

function timeToMin(t) {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
}

function fmt(n) {
  return Number(n).toLocaleString('en-IN');
}

// ── Trip Scheduler — Optimal (bipartite matching / minimum path cover) ────────
function runOptimalSchedule(trips, maxBuses) {
  const sorted = [...trips]
    .filter(t => t.outTime && t.inTime)
    .sort((a, b) => timeToMin(a.outTime) - timeToMin(b.outTime));
  const n = sorted.length;
  if (n === 0) return { busCount: 0, buses: [], totalTrips: 0, totalKm: 0, utilization: 0, savedBuses: 0 };

  // adj[i] = indices of trips that can follow trip i (with ≥15 min turnaround)
  const adj = sorted.map((_, i) => {
    const freeAt = timeToMin(sorted[i].inTime) + 15;
    return sorted.reduce((acc, _, j) => {
      if (j !== i && freeAt <= timeToMin(sorted[j].outTime)) acc.push(j);
      return acc;
    }, []);
  });

  // Hopcroft-style augmenting-path matching (simple DFS variant, O(V·E))
  const matchL = new Int16Array(n).fill(-1);   // matchL[i]=j: trip i is followed by trip j
  const matchR = new Int16Array(n).fill(-1);   // matchR[j]=i: trip j is preceded by trip i
  const seen   = new Uint8Array(n);

  function augment(u) {
    for (const v of adj[u]) {
      if (seen[v]) continue;
      seen[v] = 1;
      if (matchR[v] === -1 || augment(matchR[v])) {
        matchL[u] = v; matchR[v] = u; return true;
      }
    }
    return false;
  }

  for (let i = 0; i < n; i++) { seen.fill(0); augment(i); }

  // Reconstruct chain paths
  const buses = [];
  for (let start = 0; start < n; start++) {
    if (matchR[start] !== -1) continue;   // has a predecessor — not a chain head
    const bus = { id: buses.length + 1, legs: [], freeAt: 0 };
    let cur = start;
    while (cur !== -1) {
      bus.legs.push(sorted[cur]);
      bus.freeAt = timeToMin(sorted[cur].inTime);
      cur = matchL[cur];
    }
    buses.push(bus);
    if (maxBuses && buses.length >= maxBuses) break;
  }

  const totalKm = trips.reduce((s, t) => s + (Number(t.km) || 0), 0);
  const utilization = buses.length
    ? Math.min(99, Math.round(
        buses.reduce((s, b) => {
          const first = timeToMin(b.legs[0].outTime);
          const last  = timeToMin(b.legs[b.legs.length - 1].inTime);
          return s + Math.max(0, last - first) / 780;
        }, 0) / buses.length * 100
      ))
    : 0;

  return {
    busCount:   buses.length,
    buses,
    totalTrips: trips.length,
    totalKm,
    utilization,
    savedBuses: Math.max(0, (maxBuses || trips.length) - buses.length),
    isOptimal:  true,
  };
}

// ── Charging Scheduler ────────────────────────────────────────────────────────
const HOUR_TARIFF = [4.2,4.0,3.8,3.8,3.9,4.2,5.1,6.8,8.2,9.5,9.5,8.0,7.0,6.5,6.2,6.8,7.5,8.8,9.2,9.0,8.0,6.5,5.2,4.5];
const CHARGER_KW = 60, SLOT_MIN = 30, SLOTS_DAY = 48;

function hhmmToSlot(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return Math.floor((h * 60 + (m || 0)) / SLOT_MIN);
}
function slotToHHMM(s) {
  const m = (s % SLOTS_DAY) * SLOT_MIN;
  return `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
}
function windowCost(start, n) {
  let c = 0;
  for (let i = 0; i < n; i++)
    c += HOUR_TARIFF[Math.floor(((start + i) % SLOTS_DAY) / 2)] * CHARGER_KW * (SLOT_MIN / 60);
  return c;
}

function runChargingSchedule(busList, numChargers) {
  const TOTAL = SLOTS_DAY * 2;
  const occ   = Array.from({ length: numChargers }, () => new Array(TOTAL).fill(null));

  const entries = busList.map(b => {
    let outSlot  = hhmmToSlot(b.outTime) ?? 40;
    let inSlot   = hhmmToSlot(b.inTime)  ?? 12;
    if (inSlot <= outSlot) inSlot += SLOTS_DAY;
    const kwhNeeded = Number(b.kwhNeeded) || 90;
    const numSlots  = Math.ceil(kwhNeeded / (CHARGER_KW * SLOT_MIN / 60));
    const soc       = b.soc ?? 55;
    return { ...b, outSlot, inSlot, kwhNeeded, numSlots, soc,
      urgency: (100 - soc) * 100 + Math.max(0, 48 - (inSlot - outSlot)) };
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
        charger:     `C-${String(bestCharger + 1).padStart(2,'0')}`,
        chargeStart: slotToHHMM(bestStart),
        chargeEnd:   slotToHHMM(bestStart + numSlots),
        delayed:     bestStart > outSlot,
        delayMins:   (bestStart - outSlot) * SLOT_MIN,
        kWh:         bus.kwhNeeded,
        cost:        Math.round(bestCost),
        savings:     Math.round(naiveCost - bestCost),
      });
    } else {
      conflicts.push({ busId: bus.busId });
    }
  }

  return {
    scheduled,
    conflicts,
    totalCost:    scheduled.reduce((s, b) => s + b.cost, 0),
    totalSavings: scheduled.reduce((s, b) => s + b.savings, 0),
  };
}

// ── TCO Comparison ────────────────────────────────────────────────────────────
function runTCOComparison(kmPerDay, busCount) {
  const annualKm = kmPerDay * 300;

  const dslCPK   = 90 / 3.7 + 4.76 + 6.66;
  const dslEMI   = 7500000 * 0.9 * 0.09 / (1 - Math.pow(1.09, -6));
  const dslAnnual = (dslEMI + dslCPK * annualKm) * busCount;

  const evCPK    = (11.5 / (0.96 * 0.95)) + 2.5 + 6.66;
  const evEMI    = (14800000 + 900000) * 0.9 * 0.07 / (1 - Math.pow(1.07, -6));
  const evAnnual = (evEMI + evCPK * annualKm) * busCount;

  const annualSaving = dslAnnual - evAnnual;
  const extraCapex   = (14800000 + 900000 - 7500000) * busCount;
  const paybackYrs   = annualSaving > 0 ? extraCapex / annualSaving : Infinity;
  const npvSaving    = annualSaving * ((1 - Math.pow(1.10, -6)) / 0.10);
  const isFavourable = annualSaving > 0 && paybackYrs < 6;

  return {
    dslCPK: dslCPK.toFixed(2),
    evCPK:  evCPK.toFixed(2),
    dslAnnual:   Math.round(dslAnnual),
    evAnnual:    Math.round(evAnnual),
    annualSaving: Math.round(annualSaving),
    paybackYrs:  isFinite(paybackYrs) ? paybackYrs.toFixed(1) : '—',
    npvSaving:   Math.round(npvSaving),
    extraCapex:  Math.round(extraCapex),
    isFavourable,
  };
}

// ── Excel Parser (handles merged-title rows, TCS Adibatla + TCO formats) ─────
function minToTime(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function normalizeTime(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  const hhmm = s.match(/^(\d{1,2}):(\d{2})/);
  if (hhmm) return `${String(parseInt(hhmm[1])).padStart(2,'0')}:${hhmm[2]}`;
  const num = parseFloat(s);
  if (!isNaN(num) && num > 0 && num < 1) {
    const totalMin = Math.round(num * 1440);
    return `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`;
  }
  return null;
}

function buildColMap(headerRow) {
  const norm = s => String(s ?? '').toLowerCase().replace(/[\s_\-\.\r\n\(\)\/]+/g,'');
  const find = (...tests) => {
    for (const test of tests) {
      const i = headerRow.findIndex(h => norm(h) === test); if (i >= 0) return i;
    }
    for (const test of tests) {
      const i = headerRow.findIndex(h => norm(h).includes(test)); if (i >= 0) return i;
    }
    return -1;
  };
  return {
    routeName: find('routename','route'),
    tripType:  find('triptype','pickupdrop','type'),
    inTime:    find('intime','arrivaltime'),
    outTime:   find('outtime','departuretime'),
    km:        find('kmpertrip','kmptrip','km','dist'),
    seats:     find('seats','nrofseats','seat','cap'),
  };
}

function findHeaderRowIdx(rows) {
  const kw = ['route','name','time','trip','pickup','drop','km','seat'];
  let best = 1, idx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const score = rows[i].filter(c => kw.some(k => String(c ?? '').toLowerCase().includes(k))).length;
    if (score > best) { best = score; idx = i; }
  }
  return idx;
}

function parseFleetExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'binary' });
        let bestTrips = [];
        let isTCOFile = false;
        let tcoKmPerDay = 400;

        for (const sheetName of wb.SheetNames) {
          const ws      = wb.Sheets[sheetName];
          const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
          if (allRows.length < 3) continue;

          // Detect TCO/financial file (has DSL + EV columns + km/day)
          const topText = allRows.slice(0, 5).flat().join(' ').toLowerCase();
          if (topText.includes('dsl') && topText.includes('ev') && topText.includes('km')) {
            isTCOFile = true;
            for (const row of allRows) {
              if (/km.*day/i.test(String(row[0] ?? ''))) {
                const val = parseFloat(String(row[2] ?? '').replace(/[^\d.]/g,''));
                if (val > 0) { tcoKmPerDay = val; break; }
              }
            }
            continue;
          }

          const headerIdx = findHeaderRowIdx(allRows);
          if (headerIdx === -1) continue;

          const colMap = buildColMap(allRows[headerIdx]);
          if (colMap.routeName === -1) continue;
          if (colMap.inTime === -1 && colMap.outTime === -1) continue;

          const trips = [];
          for (const row of allRows.slice(headerIdx + 1)) {
            const routeName = String(row[colMap.routeName] ?? '').trim();
            if (!routeName || routeName.length < 3 || /^(sl|#|no\b)/i.test(routeName)) continue;

            const inTime  = colMap.inTime  >= 0 ? normalizeTime(row[colMap.inTime])  : null;
            const outTime = colMap.outTime >= 0 ? normalizeTime(row[colMap.outTime]) : null;
            const km      = colMap.km    >= 0 ? Number(row[colMap.km])    || 0  : 0;
            const seats   = colMap.seats >= 0 ? Number(row[colMap.seats]) || 36 : 36;
            const ttRaw   = colMap.tripType >= 0 ? String(row[colMap.tripType] ?? '') : '';
            const isBoth  = /both/i.test(ttRaw);
            const tripType = /drop/i.test(ttRaw) && !isBoth ? 'drop' : 'pickup';

            if (isBoth && inTime && outTime) {
              // "Both" bus is dedicated all day: departs depot → morning drop → sits at client → evening pickup → returns depot
              const travel = Math.round((km || 30) / 30 * 60);
              trips.push({ routeName, tripType: 'both',
                outTime: minToTime(Math.max(0, timeToMin(inTime) - travel)),
                inTime:  minToTime(timeToMin(outTime) + travel),
                km: km * 2, seats });
            } else if (inTime || outTime) {
              trips.push({
                routeName, tripType,
                outTime: outTime || minToTime(Math.max(0, timeToMin(inTime) - 90)),
                inTime:  inTime  || minToTime(timeToMin(outTime) + 90),
                km, seats,
              });
            }
          }
          if (trips.length > bestTrips.length) bestTrips = trips;
        }

        if (bestTrips.length === 0 && isTCOFile) {
          resolve({ trips: [], isTCOFile: true, tcoKmPerDay, totalKm: 0, routes: [], pickups: 0, drops: 0 });
          return;
        }
        if (bestTrips.length === 0) {
          reject(new Error('Could not find trip data. Expected columns: Route Name, In time, Out time, Trip Type, KM'));
          return;
        }
        resolve({
          trips: bestTrips, isTCOFile: false,
          totalKm: bestTrips.reduce((s, t) => s + (t.km || 0), 0),
          routes:  [...new Set(bestTrips.map(t => t.routeName))],
          pickups: bestTrips.filter(t => t.tripType === 'pickup').length,
          drops:   bestTrips.filter(t => t.tripType === 'drop').length,
          both:    bestTrips.filter(t => t.tripType === 'both').length,
        });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

// ── Excel Export ──────────────────────────────────────────────────────────────
function exportExcel(clientName, results, messages) {
  const wb = XLSX.utils.book_new();

  if (results.trip) {
    const rows = results.trip.buses.flatMap(bus =>
      bus.legs.map(leg => ({
        'Bus #': `Bus ${bus.id}`, 'Route': leg.routeName || '',
        'Type': leg.tripType || '', 'Departure': leg.outTime,
        'Return': leg.inTime, 'Distance (km)': leg.km || '',
      }))
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Trip Schedule');
  }

  if (results.charge) {
    const rows = results.charge.scheduled.map(b => ({
      'Bus': b.busId, 'Charger': b.charger,
      'Charge Start': b.chargeStart, 'Charge End': b.chargeEnd,
      'Energy (kWh)': b.kWh, 'Cost (₹)': b.cost, 'Savings (₹)': b.savings,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Charging Plan');
  }

  if (results.tco) {
    const t = results.tco;
    const rows = [
      { 'Metric': 'Cost per km — Diesel',        'Value': `₹${t.dslCPK}` },
      { 'Metric': 'Cost per km — EV',             'Value': `₹${t.evCPK}` },
      { 'Metric': 'Annual Fleet Cost — Diesel',   'Value': `₹${fmt(t.dslAnnual)}` },
      { 'Metric': 'Annual Fleet Cost — EV',       'Value': `₹${fmt(t.evAnnual)}` },
      { 'Metric': 'Annual Saving (EV vs Diesel)', 'Value': `₹${fmt(t.annualSaving)}` },
      { 'Metric': 'Payback Period',               'Value': `${t.paybackYrs} years` },
      { 'Metric': 'NPV Savings',                  'Value': `₹${fmt(t.npvSaving)}` },
      { 'Metric': 'Recommendation',               'Value': t.isFavourable ? 'EV is financially compelling' : 'More analysis needed' },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'TCO Summary');
  }

  const transcript = messages
    .filter(m => m.type === 'text')
    .map(m => ({
      'Role': m.role === 'bot' ? 'FleetOS Analyst' : 'Client',
      'Message': String(m.content).slice(0, 500),
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transcript), 'Conversation');

  XLSX.writeFile(wb, `FleetOS_${clientName.replace(/\s+/g,'_')}.xlsx`);
}

// ── Chat UI components ────────────────────────────────────────────────────────
function GanttChart({ msg }) {
  const { title, legend, timeStartMin, timeEndMin, rows } = msg.meta;
  const ROW_H = 22, LABEL_W = 62, PAD = 10, HEADER = 26;
  const W = 580, chartW = W - LABEL_W - PAD;
  const H = HEADER + rows.length * ROW_H + PAD;
  const range = Math.max(1, timeEndMin - timeStartMin);

  function tx(min) { return LABEL_W + (min - timeStartMin) / range * chartW; }

  const ticks = [];
  for (let m = Math.ceil(timeStartMin / 120) * 120; m <= timeEndMin; m += 120) ticks.push(m);

  return (
    <div className="flex gap-2 items-start">
      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot size={14} className="text-white" />
      </div>
      <div className="max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-sm">
        {title && (
          <div className="px-4 py-2.5 border-b border-white/10">
            <p className="text-slate-300 text-xs font-medium">{title}</p>
          </div>
        )}
        <div className="overflow-x-auto p-2">
          <svg width={W} height={H} style={{ display: 'block' }}>
            {ticks.map(m => {
              const x = tx(m);
              const h = Math.floor((m % 1440) / 60);
              const label = String(h).padStart(2,'0') + ':00' + (m >= 1440 ? '†' : '');
              return (
                <g key={m}>
                  <line x1={x} y1={HEADER - 4} x2={x} y2={H - 4} stroke="rgba(255,255,255,0.08)" strokeWidth={1}/>
                  <text x={x} y={HEADER - 9} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize={9}>{label}</text>
                </g>
              );
            })}
            {rows.map((row, i) => {
              const y = HEADER + i * ROW_H;
              return (
                <g key={i}>
                  <text x={LABEL_W - 4} y={y + ROW_H * 0.65} textAnchor="end"
                    fill="rgba(255,255,255,0.4)" fontSize={9}>{row.label}</text>
                  <rect x={LABEL_W} y={y + 2} width={chartW} height={ROW_H - 4}
                    fill={i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'} rx={2}/>
                  {row.bars.map((bar, j) => {
                    const x1 = tx(bar.startMin), x2 = tx(bar.endMin);
                    return (
                      <rect key={j} x={x1} y={y + 4} width={Math.max(2, x2 - x1)} height={ROW_H - 8}
                        fill={bar.color || 'rgba(99,102,241,0.75)'} rx={2} opacity={0.85}/>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
        {legend && legend.length > 0 && (
          <div className="px-4 py-2.5 border-t border-white/10 flex gap-4 flex-wrap">
            {legend.map(l => (
              <div key={l.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ background: l.color }}/>
                <span className="text-slate-400 text-xs">{l.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2 items-end">
      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
        <Bot size={14} className="text-white" />
      </div>
      <div className="flex gap-1.5 items-center px-4 py-3.5 bg-white border border-slate-200 rounded-2xl rounded-bl-sm shadow-sm">
        {[0,1,2].map(i => (
          <div key={i} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ msg }) {
  const isBot = msg.role === 'bot';

  if (msg.type === 'stats') {
    return (
      <div className="flex gap-2 items-end">
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 self-start mt-1">
          <Bot size={14} className="text-white" />
        </div>
        <div className="max-w-lg">
          {msg.content && <p className="text-slate-200 text-sm mb-3 px-1">{msg.content}</p>}
          <div className="grid grid-cols-2 gap-2">
            {msg.meta?.stats?.map(s => (
              <div key={s.label} className={cn(
                'rounded-xl border p-3',
                s.hi ? 'bg-indigo-500/20 border-indigo-400/40' : 'bg-white/10 border-white/10'
              )}>
                <p className={cn('text-lg font-bold', s.hi ? 'text-indigo-200' : 'text-white')}>{s.value}</p>
                <p className={cn('text-xs mt-0.5', s.hi ? 'text-indigo-300' : 'text-slate-400')}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (msg.type === 'gantt') return <GanttChart msg={msg} />;

  if (msg.type === 'table') {
    return (
      <div className="flex gap-2 items-end">
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 self-start mt-1">
          <Bot size={14} className="text-white" />
        </div>
        <div className="max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm shadow-sm">
          {msg.content && (
            <div className="px-4 py-2.5 border-b border-white/10">
              <p className="text-slate-300 text-xs font-medium">{msg.content}</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/10">
                  {msg.meta?.headers?.map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-slate-400 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {msg.meta?.rows?.map((row, i) => (
                  <tr key={i} className="border-b border-white/5">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-2 text-slate-200 whitespace-nowrap">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2 items-end', !isBot && 'flex-row-reverse')}>
      {isBot && (
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <Bot size={14} className="text-white" />
        </div>
      )}
      <div className={cn(
        'max-w-lg px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm',
        isBot
          ? 'bg-white/10 backdrop-blur-sm border border-white/10 text-slate-100 rounded-bl-sm'
          : 'bg-indigo-500 text-white rounded-br-sm'
      )}>
        {String(msg.content).split('\n').map((line, i, arr) => (
          <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
        ))}
      </div>
    </div>
  );
}

function ChoiceChips({ choices, onChoose, consumed }) {
  return (
    <div className="flex flex-wrap gap-2 pl-10">
      {choices.map(c => (
        <button key={c.id} onClick={() => !consumed && onChoose(c)} disabled={consumed}
          className={cn(
            'px-4 py-2 rounded-xl border text-sm font-medium transition-all',
            consumed
              ? 'opacity-30 cursor-not-allowed border-white/10 text-white/50 bg-transparent'
              : 'border-indigo-400/50 text-indigo-200 bg-indigo-500/20 hover:bg-indigo-500/40 hover:border-indigo-300 cursor-pointer'
          )}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

function FileDropZone({ onFile, consumed }) {
  const ref = useRef();
  const [drag, setDrag] = useState(false);

  function handle(file) {
    if (!file || consumed) return;
    if (!/\.(xlsx|xls|xlsm|csv)$/i.test(file.name)) { alert('Please upload an Excel or CSV file.'); return; }
    onFile(file);
  }

  return (
    <div
      className={cn(
        'ml-10 border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all',
        consumed ? 'opacity-30 cursor-not-allowed border-white/10' :
        drag     ? 'border-indigo-400 bg-indigo-500/20'
                 : 'border-white/20 hover:border-indigo-400/60 hover:bg-white/5'
      )}
      onClick={() => !consumed && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
    >
      <FileSpreadsheet size={28} className="mx-auto mb-2 text-indigo-400" />
      <p className="text-slate-200 text-sm font-medium">Drop your Excel here, or click to browse</p>
      <p className="text-slate-400 text-xs mt-1">Supports: TCS Adibatla format · Alternate fuel TCO · any route schedule Excel</p>
      <input ref={ref} type="file" accept=".xlsx,.xls,.xlsm,.csv" className="hidden"
        onChange={e => handle(e.target.files?.[0])} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ClientChat({ token }) {
  const [session,    setSession]    = useState(null);
  const [validating, setValidating] = useState(true);
  const [invalid,    setInvalid]    = useState(false);

  const [messages,   setMessages]   = useState([]);
  const [typing,     setTyping]     = useState(false);
  const [inputText,  setInputText]  = useState('');
  const [inputOn,    setInputOn]    = useState(false);
  const [choices,    setChoices]    = useState(null);
  const [choicesDone,setChoicesDone]= useState(false);
  const [showUpload,    setShowUpload]    = useState(false);
  const [uploadDone,    setUploadDone]    = useState(false);
  const [showTCOUpload, setShowTCOUpload] = useState(false);
  const [tcoUploadDone, setTCOUploadDone] = useState(false);

  const bottomRef   = useRef();
  const pendingRef  = useRef(null);       // resolves with user text or choice
  const fleetRef    = useRef(null);       // { trips, totalKm, routes, pickups, drops }
  const resultsRef  = useRef({});         // { trip, charge, tco }
  const sessionRef  = useRef(null);
  const started     = useRef(false);

  // Validate token
  useEffect(() => {
    supabase.from('client_sessions').select('*').eq('token', token).single()
      .then(({ data }) => {
        if (!data || (data.expires_at && new Date(data.expires_at) < new Date())) {
          setInvalid(true);
        } else {
          sessionRef.current = data;
          setSession(data);
        }
        setValidating(false);
      });
  }, [token]);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);

  // Save conversation to DB
  const save = useCallback(async (msgs) => {
    const s = sessionRef.current;
    if (!s) return;
    await supabase.from('client_sessions').update({
      conversation:   msgs,
      results:        resultsRef.current,
      status:         'active',
      last_active_at: new Date().toISOString(),
    }).eq('id', s.id);
  }, []);

  // Add a message
  const addMsg = useCallback((msg) => {
    setMessages(prev => {
      const next = [...prev, msg];
      save(next);
      return next;
    });
  }, [save]);

  // Bot sends a message with typing delay
  const bot = useCallback(async (content, type = 'text', meta = {}) => {
    setTyping(true);
    const thinkMs = Math.min(700 + String(content).length * 9, 2600);
    await delay(thinkMs);
    setTyping(false);
    addMsg({ id: Date.now() + Math.random(), role: 'bot', content, type, meta });
  }, [addMsg]);

  // Wait for user text input
  const waitText = useCallback(() => {
    setInputOn(true);
    return new Promise(resolve => { pendingRef.current = resolve; });
  }, []);

  // Wait for user choice
  const waitChoice = useCallback((opts) => {
    setChoices(opts);
    setChoicesDone(false);
    return new Promise(resolve => { pendingRef.current = resolve; });
  }, []);

  // ── Flow ─────────────────────────────────────────────────────────────────
  async function runFlow(s) {
    // Welcome
    await bot(`Hello${s.client_name ? ', ' + s.client_name : ''}! 👋\n\nI'm your FleetOS Analyst — a fleet planning assistant from Tata Motors CV Division. I'll help you analyse your bus route data and build an optimised schedule.\n\nTo get started, upload your fleet Excel file. I'll read it instantly and walk you through everything.`);
    setShowUpload(true);

    // Wait for file → then parse
    const fleet = await new Promise(resolve => { pendingRef.current = resolve; });
    fleetRef.current = fleet;

    if (fleet.isTCOFile) {
      await bot(`Got it — this looks like a financial / TCO analysis file. I can see it has DSL, EV, and alternate fuel scenarios.\n\nI'll take you straight to the financial comparison. Let me ask you a couple of quick questions.`);
      await doTCO(fleet.tcoKmPerDay);
      await doDownload(s.client_name);
      return;
    }

    const bothLine = fleet.both > 0 ? ` · ${fleet.both} both-way (dedicated full-day)` : '';
    await bot(
      `Perfect! I've read your file. Here's what I found:\n\n• ${fleet.trips.length} trips across ${fleet.routes.length} routes\n• ${fleet.pickups} pickups · ${fleet.drops} drops${bothLine}\n• Total daily distance: ${fmt(fleet.totalKm)} km\n\nWhat would you like me to analyse?`
    );

    let keepGoing = true;
    const done = new Set();

    while (keepGoing) {
      const menuChoices = [
        !done.has('trip')   && { id: 'trip',     label: '🚌  Trip Planning' },
        !done.has('charge') && { id: 'charge',   label: '⚡  Charging Schedule' },
        !done.has('tco')    && { id: 'tco',      label: '💰  Financial Analysis' },
        done.size === 0     && { id: 'full',     label: '📊  Full Report (all three)' },
        done.size > 0       && { id: 'download', label: '📥  Download Report' },
      ].filter(Boolean);

      if (menuChoices.length === 1 && menuChoices[0].id === 'download') {
        await bot('All analyses are done. Ready to download your report!');
        await doDownload(s.client_name);
        keepGoing = false;
        break;
      }

      const choice = await waitChoice(menuChoices);

      if (choice.id === 'full') {
        await doTrip();  done.add('trip');
        await doCharge(); done.add('charge');
        await doTCO();    done.add('tco');
      } else if (choice.id === 'trip')   { await doTrip();   done.add('trip'); }
        else if (choice.id === 'charge') { await doCharge(); done.add('charge'); }
        else if (choice.id === 'tco')    { await doTCO();    done.add('tco'); }
        else if (choice.id === 'download') {
          await doDownload(s.client_name);
          keepGoing = false;
        }

      if (keepGoing && done.size < 3) {
        await bot('What else would you like me to look at?');
      }
    }
  }

  // ── Trip Planning ─────────────────────────────────────────────────────────
  async function doTrip() {
    await bot('Great — trip planning it is.\n\nHow many buses do you currently have available in your fleet? (Enter a number, or type "0" to just find the minimum)');
    const text = await waitText();
    const maxB = parseInt(text) || 999;

    await bot(
      `Here's how the optimiser works:\n\n` +
      `1. Each trip is a time window — [depot departure → depot return]\n` +
      `2. We build a compatibility graph: can bus finish trip A in time to start trip B? (with 15-min turnaround)\n` +
      `3. Maximum bipartite matching on that graph finds the largest set of A→B pairings — each pairing means one less bus\n` +
      `4. Minimum buses = total trips − maximum pairings (this is provably optimal via Dilworth's theorem)\n\n` +
      `Running over all ${fleetRef.current.trips.length} trips now…`
    );
    await delay(2400);

    const result = runOptimalSchedule(fleetRef.current.trips, maxB === 999 ? 0 : maxB);
    resultsRef.current = { ...resultsRef.current, trip: result };

    // Explain what the result means
    const bothCount   = result.buses.filter(b => b.legs.some(l => l.tripType === 'both')).length;
    const sharedCount = result.buses.filter(b => b.legs.length > 1).length;
    const soloCount   = result.busCount - sharedCount;

    await bot(
      `Minimum fleet size confirmed: ${result.busCount} buses.\n\n` +
      `• ${bothCount} buses are dedicated full-day (both-way routes — they can't be reassigned mid-day)\n` +
      `• ${sharedCount} buses each cover 2+ trips in a day (the scheduler chained them)\n` +
      `• ${soloCount} buses run a single trip with no pairing opportunity\n\n` +
      `Fleet utilisation is ${result.utilization}% — the remaining time is turnaround/rest at depot.`
    );

    await bot('Optimised schedule summary:', 'stats', { stats: [
      { label: 'Minimum buses needed', value: result.busCount,          hi: true },
      { label: 'Buses available',      value: maxB === 999 ? '—' : maxB          },
      { label: 'Fleet utilisation',    value: `${result.utilization}%`, hi: true },
      { label: 'Total daily km',       value: `${fmt(result.totalKm)} km`         },
    ]});

    // Gantt chart — first 30 buses
    const ganttLimit = Math.min(result.buses.length, 30);
    const ganttRows  = result.buses.slice(0, ganttLimit).map(bus => ({
      label: `B${bus.id}`,
      bars:  bus.legs.map(leg => ({
        startMin: timeToMin(leg.outTime),
        endMin:   timeToMin(leg.inTime),
        color: leg.tripType === 'both'   ? 'rgba(139,92,246,0.8)' :
               leg.tripType === 'pickup' ? 'rgba(59,130,246,0.8)' :
                                           'rgba(16,185,129,0.8)',
      })),
    }));
    const allMins = result.buses.flatMap(b => b.legs.flatMap(l => [timeToMin(l.outTime), timeToMin(l.inTime)]));
    addMsg({ id: Date.now() + Math.random(), role: 'bot', type: 'gantt', content: null, meta: {
      title: `Bus Schedule Gantt — first ${ganttLimit} of ${result.busCount} buses (each row = 1 bus, bars = trip legs)`,
      timeStartMin: Math.min(...allMins),
      timeEndMin:   Math.max(...allMins),
      rows: ganttRows,
      legend: [
        { label: 'Both-way (dedicated)', color: 'rgba(139,92,246,0.8)' },
        { label: 'Pickup',               color: 'rgba(59,130,246,0.8)' },
        { label: 'Drop',                 color: 'rgba(16,185,129,0.8)' },
      ],
    }});

    await bot('Per-bus breakdown:', 'table', {
      headers: ['Bus', 'Trips', 'First Out', 'Last In', 'Daily km'],
      rows: result.buses.map(b => [
        `Bus ${b.id}`,
        `${b.legs.length} trip${b.legs.length !== 1 ? 's' : ''}`,
        b.legs[0]?.outTime ?? '—',
        b.legs[b.legs.length - 1]?.inTime ?? '—',
        `${b.legs.reduce((s, l) => s + (l.km || 0), 0)} km`,
      ]),
    });

    if (result.savedBuses > 0 && maxB !== 999) {
      await bot(`You can cover all ${result.totalTrips} trips with just ${result.busCount} buses — that's ${result.savedBuses} fewer than your current fleet. At ~₹75 lakh per bus, that's ₹${result.savedBuses * 75}L in potential fleet cost reduction.`);
    }
  }

  // ── Charging ──────────────────────────────────────────────────────────────
  async function doCharge() {
    await bot(
      `For the charging plan, here's what I'll do:\n\n` +
      `1. Each bus charges overnight — from when it returns to depot to when it departs next morning\n` +
      `2. The tariff varies by hour: off-peak (23:00–06:00) is ₹3.8–4.2/kWh; peak (07:00–10:00, 17:00–21:00) can be ₹8–9.5/kWh\n` +
      `3. I'll shift each bus's charge window toward off-peak hours to minimise cost\n` +
      `4. First, I'll calculate the minimum number of chargers needed so every bus can charge overnight`
    );
    await delay(1200);

    const tripResult = resultsRef.current.trip || runOptimalSchedule(fleetRef.current.trips, 0);

    // Build input with CORRECT overnight charging window: return time → next morning departure
    const rng = (a, b) => a + Math.round(Math.random() * (b - a));
    const input = tripResult.buses.map(bus => ({
      busId:     `Bus ${bus.id}`,
      outTime:   bus.legs[bus.legs.length - 1]?.inTime,  // charge window START = evening return
      inTime:    bus.legs[0]?.outTime,                    // charge window END   = next morning departure
      kwhNeeded: rng(75, 120),
      soc:       rng(35, 65),
    }));

    // Binary-search for minimum chargers (much faster than linear scan for large fleets)
    let lo = 1, hi = input.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      runChargingSchedule(input, mid).conflicts.length === 0 ? (hi = mid) : (lo = mid + 1);
    }
    const minChargers = lo;

    await bot(
      `Minimum chargers required: ${minChargers}\n\n` +
      `With ${minChargers} charger${minChargers !== 1 ? 's' : ''}, every bus fits within its overnight window (typically 8–10 hours between return and next departure).\n\n` +
      `How many chargers does your depot actually have? (Type a number, or press Enter to use the minimum of ${minChargers})`
    );
    const text        = await waitText();
    const numChargers = parseInt(text) || minChargers;

    await bot(
      `Scheduling charges across ${numChargers} charger${numChargers !== 1 ? 's' : ''}.\n\n` +
      `The optimiser assigns each bus the cheapest available overnight window on a free charger — ` +
      `prioritising low-urgency buses first so high-urgency buses (low SoC, short overnight window) always get priority access.`
    );
    await delay(1800);

    const result = runChargingSchedule(input, numChargers);
    resultsRef.current = { ...resultsRef.current, charge: result };

    const delayedCount = result.scheduled.filter(b => b.delayed).length;
    await bot(
      `Charging plan complete.\n\n` +
      `${delayedCount} of ${result.scheduled.length} buses had their charge start shifted to a cheaper tariff window — ` +
      `saving ₹${fmt(result.totalSavings)} vs charging immediately on return. ` +
      `That's ₹${fmt(Math.round(result.totalSavings / Math.max(1, result.scheduled.length)))} saved per bus per day.`
    );

    await bot('Charging plan summary:', 'stats', { stats: [
      { label: 'Buses scheduled',          value: result.scheduled.length,        hi: true },
      { label: 'Min chargers needed',      value: minChargers                               },
      { label: 'Total energy cost / day',  value: `₹${fmt(result.totalCost)}`,    hi: true },
      { label: 'Saved vs immediate charge',value: `₹${fmt(result.totalSavings)}`           },
    ]});

    // Charging Gantt — one row per charger
    const chargerIds = [...new Set(result.scheduled.map(s => s.charger))].sort();
    if (chargerIds.length > 0) {
      const ganttRows = chargerIds.map(ch => ({
        label: ch,
        bars: result.scheduled.filter(s => s.charger === ch).map(s => {
          const start = timeToMin(s.chargeStart);
          let end     = timeToMin(s.chargeEnd);
          if (end <= start) end += 1440;   // overnight wrap
          return { startMin: start, endMin: end, color: s.delayed ? 'rgba(234,179,8,0.8)' : 'rgba(16,185,129,0.8)' };
        }),
      }));
      const allMins = ganttRows.flatMap(r => r.bars.flatMap(b => [b.startMin, b.endMin]));
      addMsg({ id: Date.now() + Math.random(), role: 'bot', type: 'gantt', content: null, meta: {
        title: `Charging Schedule Gantt — each row = 1 charger, † = next-day time`,
        timeStartMin: Math.min(...allMins),
        timeEndMin:   Math.max(...allMins),
        rows: ganttRows,
        legend: [
          { label: 'Shifted to off-peak (saving cost)', color: 'rgba(234,179,8,0.8)' },
          { label: 'Charged immediately on return',      color: 'rgba(16,185,129,0.8)' },
        ],
      }});
    }

    if (result.scheduled.length > 0) {
      await bot('Per-bus charging slots:', 'table', {
        headers: ['Bus', 'Charger', 'Start', 'End', 'kWh', 'Cost (₹)', 'Saved (₹)'],
        rows: result.scheduled.map(b => [
          b.busId, b.charger, b.chargeStart, b.chargeEnd,
          b.kWh, fmt(b.cost), fmt(b.savings),
        ]),
      });
    }

    if (result.conflicts.length > 0) {
      await bot(`⚠️ ${result.conflicts.length} bus${result.conflicts.length > 1 ? 'es' : ''} couldn't be scheduled — their overnight window is shorter than their charge time. Adding one more charger or using mid-day opportunity charging would resolve this.`);
    }
  }

  // ── TCO ───────────────────────────────────────────────────────────────────
  async function doTCO(prefillKm) {
    let kmPerDay;
    if (prefillKm) {
      kmPerDay = prefillKm;
      await bot(`I can see from your file that buses run ~${kmPerDay} km/day. How many buses are in the fleet you're evaluating?`);
      const text = await waitText();
      const busMatch = text.match(/\d+/);
      resultsRef.current._tcoOverrideBuses = busMatch ? parseInt(busMatch[0]) : null;
    } else {
      await bot('For financial analysis — would you like to upload your TCO Excel file (with alternate fuel scenario data), or shall I use standard industry parameters?');
      const tcoChoice = await waitChoice([
        { id: 'upload',   label: '📤  Upload TCO Excel' },
        { id: 'standard', label: '📊  Use Standard Parameters' },
      ]);

      if (tcoChoice.id === 'upload') {
        await bot("Upload your alternate fuel / TCO scenarios Excel. I'll extract the km/day and cost parameters automatically.");
        setShowTCOUpload(true);
        const tcoFleet = await new Promise(resolve => { pendingRef.current = resolve; });
        if (tcoFleet.isTCOFile && tcoFleet.tcoKmPerDay > 0) {
          kmPerDay = tcoFleet.tcoKmPerDay;
          await bot(`Got it — extracted ${kmPerDay} km/day from your TCO file. How many buses are in the fleet you're evaluating?`);
          const text = await waitText();
          const busMatch = text.match(/\d+/);
          resultsRef.current._tcoOverrideBuses = busMatch ? parseInt(busMatch[0]) : null;
        } else {
          await bot("I couldn't extract km/day from that file. How many km per day does each bus run?\n\n(e.g. \"250 km\")");
          const text = await waitText();
          const kmMatch = text.match(/\d{2,4}/);
          kmPerDay = kmMatch ? parseInt(kmMatch[0]) : 250;
        }
      } else {
        await bot('For the financial comparison — roughly how many km per day does each bus run?\n\n(e.g. "250 km, diesel" or just "180 km")');
        const text  = await waitText();
        const kmMatch = text.match(/\d{2,4}/);
        kmPerDay = kmMatch ? parseInt(kmMatch[0]) : 250;
      }
    }
    const busCount = resultsRef.current._tcoOverrideBuses
      || resultsRef.current.trip?.busCount
      || (fleetRef.current?.trips?.length || 5);

    const annualKm = kmPerDay * 300;

    // Narrate the cost build-up before showing numbers
    await bot(
      `Let me walk you through how I calculate cost per km for each fuel type.\n\n` +
      `**Diesel bus:**\n` +
      `  • Fuel: ₹90/litre ÷ 3.7 km/litre = ₹24.32/km\n` +
      `  • Maintenance: ₹4.76/km\n` +
      `  • Driver + misc: ₹6.66/km\n` +
      `  → **Total diesel CPK ≈ ₹35.74/km**\n\n` +
      `**Electric bus:**\n` +
      `  • Electricity: 11.5 kWh/km ÷ (0.96 efficiency × 0.95 charging loss) ≈ 12.6 kWh/km at avg ₹8.5/kWh = ₹12.63/km\n` +
      `  • Maintenance (no engine, fewer moving parts): ₹2.50/km\n` +
      `  • Driver + misc: ₹6.66/km\n` +
      `  → **Total EV CPK ≈ ₹21.79/km**`
    );
    await delay(2200);

    const result = runTCOComparison(kmPerDay, busCount);
    resultsRef.current = { ...resultsRef.current, tco: result };

    await bot(
      `Now let's look at annual fleet costs for ${busCount} buses running ${fmt(annualKm)} km/year each.\n\n` +
      `**Diesel annual cost:**\n` +
      `  • EMI on ₹75L bus (10% down, 9% interest, 6 yr): ~₹${fmt(Math.round(7500000 * 0.9 * 0.09 / (1 - Math.pow(1.09, -6))))}/yr per bus\n` +
      `  • Operating (₹${result.dslCPK}/km × ${fmt(annualKm)} km): ₹${fmt(Math.round(parseFloat(result.dslCPK) * annualKm))}/yr per bus\n` +
      `  → **Fleet total: ₹${fmt(result.dslAnnual)}/year**\n\n` +
      `**EV annual cost:**\n` +
      `  • EMI on ₹148L bus + ₹9L battery pack (7% interest, 6 yr): ~₹${fmt(Math.round((14800000+900000) * 0.9 * 0.07 / (1 - Math.pow(1.07, -6))))}/yr per bus\n` +
      `  • Operating (₹${result.evCPK}/km × ${fmt(annualKm)} km): ₹${fmt(Math.round(parseFloat(result.evCPK) * annualKm))}/yr per bus\n` +
      `  → **Fleet total: ₹${fmt(result.evAnnual)}/year**`
    );
    await delay(1800);

    if (result.annualSaving > 0) {
      await bot(
        `**EV saves ₹${fmt(result.annualSaving)}/year** vs diesel for this fleet.\n\n` +
        `The extra upfront cost (EV − diesel price × ${busCount} buses) = ₹${fmt(result.extraCapex)}.\n\n` +
        `Divide extra capex by annual saving:\n` +
        `  ₹${fmt(result.extraCapex)} ÷ ₹${fmt(result.annualSaving)}/year = **${result.paybackYrs}-year payback**\n\n` +
        `NPV of savings over 6 years (10% discount rate) = **₹${fmt(result.npvSaving)}**\n\n` +
        (result.isFavourable
          ? `This is a strong business case. Payback within the 6-year bus life, with substantial positive NPV.`
          : `Payback exceeds the 6-year bus life at ${kmPerDay} km/day. Higher utilisation (longer routes or more shifts) would improve this.`)
      );
    } else {
      await bot(
        `At ${kmPerDay} km/day, diesel is actually cheaper in total annual cost — the lower EV capex benefit doesn't offset the higher per-km operating costs at this utilisation level.\n\n` +
        `The EV crossover typically occurs above 200–250 km/day for Indian fleet conditions. Routes with longer daily runs or second shifts would flip this analysis.`
      );
    }

    await bot('TCO summary:', 'stats', { stats: [
      { label: 'Diesel cost/km',     value: `₹${result.dslCPK}`                                                              },
      { label: 'EV cost/km',         value: `₹${result.evCPK}`,                                            hi: true          },
      { label: 'Annual saving (EV)', value: result.annualSaving > 0 ? `₹${fmt(result.annualSaving)}` : 'Diesel cheaper',
        hi: result.annualSaving > 0 },
      { label: 'Payback period',     value: `${result.paybackYrs} years`                                                      },
    ]});
  }

  // ── Download ──────────────────────────────────────────────────────────────
  async function doDownload(clientName) {
    await bot('Preparing your Excel report — trip schedule, charging plan, financial summary, and this full conversation...');
    await delay(1200);
    setMessages(prev => {
      exportExcel(clientName || 'Client', resultsRef.current, prev);
      return prev;
    });
    await bot('Your report has been downloaded! ✅\n\nIt contains:\n• Sheet 1 — Trip Schedule (per-bus assignments)\n• Sheet 2 — Charging Plan (cost-optimised slots)\n• Sheet 3 — TCO Summary (EV vs Diesel)\n• Sheet 4 — This conversation\n\nFeel free to share it with your team. Reach out to your Tata Motors contact for next steps.');
    await supabase.from('client_sessions').update({ status: 'completed' }).eq('token', token);
  }

  // Start flow once session loads
  useEffect(() => {
    if (!session || started.current) return;
    started.current = true;
    runFlow(session);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── User interactions ─────────────────────────────────────────────────────
  async function handleFile(file) {
    setUploadDone(true);
    setShowUpload(false);
    addMsg({ id: Date.now(), role: 'user', content: `📎 ${file.name}`, type: 'text' });
    setTyping(true);
    try {
      const fleet = await parseFleetExcel(file);
      setTyping(false);
      if (fleet.isTCOFile) {
        // Alternate fuel / TCO Excel detected — skip to TCO flow directly
        fleetRef.current = fleet;
        const fn = pendingRef.current;
        pendingRef.current = null;
        // Pass a synthetic "TCO file" fleet so runFlow takes the right branch
        fn(fleet);
      } else {
        const fn = pendingRef.current;
        pendingRef.current = null;
        fn(fleet);
      }
    } catch (err) {
      setTyping(false);
      addMsg({ id: Date.now(), role: 'bot', content: `I couldn't read that file. ${err.message}`, type: 'text' });
      setUploadDone(false);
      setShowUpload(true);
    }
  }

  async function handleTCOFile(file) {
    setTCOUploadDone(true);
    setShowTCOUpload(false);
    addMsg({ id: Date.now(), role: 'user', content: `📎 ${file.name}`, type: 'text' });
    setTyping(true);
    try {
      const fleet = await parseFleetExcel(file);
      setTyping(false);
      const fn = pendingRef.current;
      pendingRef.current = null;
      fn(fleet);
    } catch (err) {
      setTyping(false);
      addMsg({ id: Date.now(), role: 'bot', content: `I couldn't read that file. ${err.message}`, type: 'text' });
      setTCOUploadDone(false);
      setShowTCOUpload(true);
    }
  }

  function handleChoice(choice) {
    setChoicesDone(true);
    setChoices(null);
    addMsg({ id: Date.now(), role: 'user', content: choice.label, type: 'text' });
    const fn = pendingRef.current;
    pendingRef.current = null;
    fn(choice);
  }

  function handleTextSubmit() {
    const text = inputText.trim();
    if (!text || !inputOn) return;
    setInputText('');
    setInputOn(false);
    addMsg({ id: Date.now(), role: 'user', content: text, type: 'text' });
    const fn = pendingRef.current;
    pendingRef.current = null;
    if (fn) fn(text);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (validating) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex items-center justify-center">
      <p className="text-white/60 text-sm animate-pulse">Verifying your session…</p>
    </div>
  );

  if (invalid) return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <X size={20} className="text-red-500" />
        </div>
        <h2 className="text-slate-800 font-bold text-lg mb-2">Invalid or expired link</h2>
        <p className="text-slate-500 text-sm">This analysis link is not valid or has expired. Please contact your Tata Motors representative for a new link.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-white rounded-lg px-2 py-1 flex-shrink-0">
            <img src="/tata-logo.svg" alt="Tata Motors" className="h-7 w-auto" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">FleetOS Analyst</p>
            <p className="text-indigo-300 text-xs">Tata Motors CV · Intelligent Fleet Planning</p>
          </div>
        </div>
        {session?.client_name && (
          <div className="bg-white/10 px-3 py-1.5 rounded-full">
            <p className="text-white/80 text-xs">{session.client_name}</p>
          </div>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 max-w-3xl w-full mx-auto">
        {messages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}

        {typing && <TypingIndicator />}

        {showUpload    && <FileDropZone onFile={handleFile}    consumed={uploadDone}    />}
        {showTCOUpload && <FileDropZone onFile={handleTCOFile} consumed={tcoUploadDone} />}

        {choices && (
          <ChoiceChips choices={choices} onChoose={handleChoice} consumed={choicesDone} />
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-white/10 px-6 py-4 max-w-3xl w-full mx-auto flex-shrink-0">
        <div className={cn(
          'flex items-center gap-3 rounded-2xl px-4 py-3 transition-all',
          inputOn
            ? 'bg-white/10 ring-2 ring-indigo-400/50'
            : 'bg-white/5 opacity-60'
        )}>
          <input
            className="flex-1 bg-transparent text-white placeholder-white/30 text-sm outline-none"
            placeholder={inputOn ? 'Type your answer and press Enter…' : 'Choose an option above…'}
            value={inputText}
            disabled={!inputOn}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
          />
          <button onClick={handleTextSubmit} disabled={!inputOn || !inputText.trim()}
            className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center transition-all',
              inputOn && inputText.trim()
                ? 'bg-indigo-500 hover:bg-indigo-400 text-white'
                : 'text-white/20 cursor-not-allowed'
            )}>
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
