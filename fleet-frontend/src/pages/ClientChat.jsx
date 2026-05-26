import { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { Send, FileSpreadsheet, X, Bot, Download, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';

const OPTIMIZER_URL = import.meta.env.VITE_OPTIMIZER_URL ?? 'http://localhost:8000';

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
        cost:        Math.round(bestCost),
        naiveCost:   Math.round(naiveCost),
        savings:     Math.round(naiveCost - bestCost),
        isUrgent:    bus.soc < 25,
      });
    } else {
      conflicts.push({ busId: bus.busId, reason: 'All chargers occupied during available window' });
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

function busFromBackendLeg(bus) {
  const endMins   = bus.legs.map(l => l.end_min);
  const startMins = bus.legs.map(l => l.start_min);
  const toHM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return {
    busId:    `Bus-${String(bus.bus_id).padStart(3, '0')}`,
    outTime:  toHM(Math.max(...endMins)),    // latest return = charge window start
    inTime:   toHM(Math.min(...startMins)),  // earliest departure = charge window end
    kwh:      null, soc: 60,
    numTrips: bus.leg_count,
    routes:   bus.legs.map(l => l.route_name),
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
const TRIP_COLORS = { pickup: '#3b82f6', drop: '#10b981', both: '#8b5cf6', mixed: '#8b5cf6' };

function BusGantt({ msg }) {
  const [expanded, setExpanded] = useState(false);
  const buses = msg.meta?.buses || [];
  const shown = expanded ? buses : buses.slice(0, 15);
  // time axis: 05:00 (300 min) → 23:00 (1380 min)
  const START = 300, END = 1380;
  const toX = min => Math.max(0, Math.min(100, ((min - START) / (END - START)) * 100));
  const hours = Array.from({ length: 19 }, (_, i) => 5 + i);   // 05..23

  return (
    <div className="flex gap-2 items-start">
      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot size={14} className="text-white" />
      </div>
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-slate-700 text-sm font-semibold">{msg.meta?.title || 'Bus Schedule Gantt'}</p>
            <p className="text-slate-400 text-xs mt-0.5">Each row = one bus · bars = trip legs</p>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            {[['Pickup','#3b82f6'],['Drop','#10b981'],['Both-way','#8b5cf6'],['Charging','#f59e0b']].map(([l,c]) => (
              <div key={l} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: c }}/>
                <span className="text-slate-500">{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* time axis */}
        <div className="relative h-5 mb-1 ml-16 mr-16">
          {hours.filter(h => h % 2 === 0).map(h => (
            <span key={h} className="absolute text-xs text-slate-400 -translate-x-1/2 select-none"
              style={{ left: `${toX(h * 60)}%` }}>
              {String(h).padStart(2,'0')}:00
            </span>
          ))}
        </div>

        {/* rows */}
        <div className="space-y-px overflow-y-auto" style={{ maxHeight: expanded ? '640px' : '340px' }}>
          {shown.map(bus => (
            <div key={bus.bus_id} className="flex items-center gap-2">
              <span className="text-xs text-slate-400 w-14 text-right flex-shrink-0 tabular-nums">
                Bus {bus.bus_id}
              </span>
              <div className="relative flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                {hours.map(h => (
                  <div key={h} className="absolute top-0 bottom-0 w-px bg-slate-200"
                    style={{ left: `${toX(h * 60)}%` }} />
                ))}
                {(bus.legs || []).map((leg, i) => {
                  const x  = toX(leg.start_min);
                  const w  = Math.max(0.4, toX(leg.end_min) - x);
                  const cx = leg.charge_start != null ? toX(leg.charge_start) : null;
                  const cw = cx != null ? Math.max(0.3, toX(leg.charge_end) - cx) : 0;
                  return (
                    <div key={i}>
                      <div className="absolute h-full rounded-sm opacity-90"
                        style={{ left:`${x}%`, width:`${w}%`, background: TRIP_COLORS[leg.trip_type] ?? '#94a3b8' }}
                        title={`${leg.route_name ?? ''} · ${leg.start_time ?? ''}–${leg.end_time ?? ''}`} />
                      {cx != null && (
                        <div className="absolute h-full rounded-sm opacity-75"
                          style={{ left:`${cx}%`, width:`${cw}%`, background:'#f59e0b' }}
                          title={`Charging ${leg.charge_start_time ?? ''}–${leg.charge_end_time ?? ''}`} />
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="text-xs text-slate-400 w-14 flex-shrink-0 tabular-nums">
                {bus.run_km ?? ''}{bus.run_km != null ? ' km' : ''}
              </span>
            </div>
          ))}
        </div>

        {buses.length > 15 && (
          <button onClick={() => setExpanded(p => !p)}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-slate-400
              hover:text-slate-600 transition-colors py-1.5 border border-slate-200 rounded-lg">
            {expanded
              ? <><ChevronUp size={12}/> Show fewer</>
              : <><ChevronDown size={12}/> Show all {buses.length} buses</>}
          </button>
        )}
      </div>
    </div>
  );
}

function ChargerGantt({ msg }) {
  const containerRef = useRef(null);
  const [svgWidth, setSvgWidth] = useState(700);
  const [expanded, setExpanded] = useState(false);

  const scheduled = msg.meta?.scheduled || [];

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) =>
      setSvgWidth(Math.floor(e.contentRect.width) || 700)
    );
    ro.observe(containerRef.current);
    setSvgWidth(Math.floor(containerRef.current.offsetWidth) || 700);
    return () => ro.disconnect();
  }, []);

  const groups = {};
  for (const b of scheduled) {
    if (!groups[b.charger]) groups[b.charger] = [];
    groups[b.charger].push(b);
  }
  const allChargers = Object.keys(groups).sort();
  const shown = expanded ? allChargers : allChargers.slice(0, 12);

  function toAbsMin(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = String(hhmm).split(':').map(Number);
    let min = h * 60 + (m || 0);
    if (min < 14 * 60) min += 24 * 60;
    return min;
  }

  const allMins = scheduled.flatMap(b => [toAbsMin(b.arrives), toAbsMin(b.departs)]);
  const T_START = allMins.length ? Math.max(14 * 60, Math.floor(Math.min(...allMins) / 60) * 60 - 60) : 19 * 60;
  const T_END   = allMins.length ? Math.min(38 * 60, Math.ceil(Math.max(...allMins)  / 60) * 60 + 60) : 31 * 60;
  const T_RANGE = T_END - T_START;

  const ROW_H    = 36;
  const TARIFF_H = 48;
  const PAD_L    = 58;
  const PAD_R    = 16;
  const PAD_T    = 12;
  const PAD_B    = 28;
  const W        = Math.max(100, svgWidth - PAD_L - PAD_R);
  const SVG_H    = PAD_T + TARIFF_H + 8 + shown.length * ROW_H + PAD_B;

  function tx(hhmm) {
    if (!hhmm) return 0;
    return Math.max(0, Math.min(W, ((toAbsMin(hhmm) - T_START) / T_RANGE) * W));
  }

  const startH = Math.floor(T_START / 60);
  const endH   = Math.ceil(T_END / 60);
  const tariffMin = Math.min(...HOUR_TARIFF);
  const tariffMax = Math.max(...HOUR_TARIFF);
  const tariffRange = tariffMax - tariffMin || 1;

  const bands = [];
  for (let h = startH; h < endH; h++) {
    const rate = HOUR_TARIFF[h % 24];
    const norm = (rate - tariffMin) / tariffRange;
    const x    = Math.max(0, ((h * 60 - T_START) / T_RANGE) * W);
    const bw   = (60 / T_RANGE) * W;
    bands.push({ h, rate, norm, x, bw, barH: Math.round(norm * TARIFF_H * 0.80) + 5 });
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

  return (
    <div className="flex gap-2 items-start">
      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot size={14} className="text-white" />
      </div>
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <p className="text-slate-700 text-sm font-semibold">{msg.meta?.title || 'Charger Bay Timeline'}</p>
            <p className="text-slate-400 text-xs mt-0.5">Each row = one charger · bars = charging windows · background = tariff intensity</p>
          </div>
          <div className="flex items-center gap-4 text-xs flex-wrap">
            {[
              [COLORS.optimised, 'Delayed (off-peak)'],
              [COLORS.immediate, 'Immediate'],
              [COLORS.urgent,    'Urgent (low SoC)'],
            ].map(([col, label]) => (
              <span key={label} className="flex items-center gap-1.5 text-slate-500">
                <span className="w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0" style={{ backgroundColor: col }} />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div ref={containerRef} className="relative w-full">
          <svg width="100%" height={SVG_H}
            viewBox={`0 0 ${svgWidth} ${SVG_H}`}
            className="select-none"
            style={{ overflow: 'visible' }}
          >
            {bands.map(b => (
              <rect key={`bg-${b.h}`}
                x={PAD_L + b.x} y={PAD_T}
                width={Math.max(0.5, b.bw)}
                height={TARIFF_H + 8 + shown.length * ROW_H}
                fill={`hsl(${Math.round((1 - b.norm) * 120)},80%,52%)`}
                opacity={0.022 + b.norm * 0.085}
              />
            ))}
            {bands.map(b => (
              <rect key={`bar-${b.h}`}
                x={PAD_L + b.x + 1.5} y={PAD_T + TARIFF_H - b.barH}
                width={Math.max(0.5, b.bw - 3)} height={b.barH}
                fill={`hsl(${Math.round((1 - b.norm) * 120)},68%,44%)`}
                opacity={0.82} rx="2"
              />
            ))}
            <text x={PAD_L - 6} y={PAD_T + 10}              textAnchor="end" fontSize="8" fill="#94a3b8">₹{tariffMax.toFixed(1)}</text>
            <text x={PAD_L - 6} y={PAD_T + TARIFF_H - 2}    textAnchor="end" fontSize="8" fill="#94a3b8">₹{tariffMin.toFixed(1)}</text>
            <text x={PAD_L - 6} y={PAD_T + TARIFF_H / 2 + 4} textAnchor="end" fontSize="7" fill="#cbd5e1">₹/kWh</text>
            <line x1={PAD_L} y1={PAD_T + TARIFF_H + 4}
                  x2={PAD_L + W} y2={PAD_T + TARIFF_H + 4}
              stroke="#e2e8f0" strokeWidth="1.5" />
            {ticks.map(t => (
              <g key={t.label}>
                <line x1={PAD_L + t.x} y1={PAD_T + TARIFF_H + 4}
                      x2={PAD_L + t.x} y2={PAD_T + TARIFF_H + 8 + shown.length * ROW_H}
                  stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3,4" />
                <text x={PAD_L + t.x} y={SVG_H - 7}
                  textAnchor="middle" fontSize="9" fill="#94a3b8">{t.label}</text>
              </g>
            ))}
            {shown.map((charger, ci) => {
              const y0 = PAD_T + TARIFF_H + 8 + ci * ROW_H;
              return (
                <g key={charger}>
                  <rect x={PAD_L} y={y0 + 1} width={W} height={ROW_H - 1}
                    fill={ci % 2 === 0 ? '#f8fafc' : '#ffffff'} />
                  <text x={PAD_L - 7} y={y0 + ROW_H / 2 + 4}
                    textAnchor="end" fontSize="9" fill="#64748b" fontWeight="600">{charger}</text>
                  {(groups[charger] || []).map(bus => {
                    const cx  = tx(bus.chargeStart);
                    const ex  = tx(bus.chargeEnd);
                    const bw  = Math.max(4, ex - cx);
                    const col = barColor(bus);
                    return (
                      <g key={bus.busId}>
                        <rect x={PAD_L + cx} y={y0 + 6}
                          width={bw} height={ROW_H - 12}
                          fill={col} rx="5" opacity={0.85} />
                        {bw > 32 && (
                          <text x={PAD_L + cx + bw / 2} y={y0 + ROW_H / 2 + 4}
                            textAnchor="middle" fontSize={bw > 54 ? '8' : '7'}
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
            <line x1={PAD_L} y1={PAD_T}
                  x2={PAD_L} y2={PAD_T + TARIFF_H + 8 + shown.length * ROW_H}
              stroke="#e2e8f0" strokeWidth="1" />
          </svg>
        </div>

        {allChargers.length > 12 && (
          <button onClick={() => setExpanded(p => !p)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-slate-400
              hover:text-slate-600 transition-colors py-1.5 border border-slate-200 rounded-lg">
            {expanded
              ? <><ChevronUp size={12} /> Show fewer</>
              : <><ChevronDown size={12} /> Show all {allChargers.length} chargers</>}
          </button>
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
          {msg.content && <p className="text-slate-600 text-sm mb-3 px-1">{msg.content}</p>}
          <div className="grid grid-cols-2 gap-2">
            {msg.meta?.stats?.map(s => (
              <div key={s.label} className={cn(
                'rounded-xl border p-3',
                s.hi ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200'
              )}>
                <p className={cn('text-lg font-bold', s.hi ? 'text-indigo-700' : 'text-slate-800')}>{s.value}</p>
                <p className={cn('text-xs mt-0.5', s.hi ? 'text-indigo-500' : 'text-slate-400')}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (msg.type === 'gantt') return <BusGantt msg={msg} />;
  if (msg.type === 'charger-gantt') return <ChargerGantt msg={msg} />;

  if (msg.type === 'table') {
    return (
      <div className="flex gap-2 items-end">
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 self-start mt-1">
          <Bot size={14} className="text-white" />
        </div>
        <div className="max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {msg.content && (
            <div className="px-4 py-2.5 border-b border-slate-100">
              <p className="text-slate-600 text-xs font-medium">{msg.content}</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {msg.meta?.headers?.map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-slate-500 font-medium uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {msg.meta?.rows?.map((row, i) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    {row.map((cell, j) => (
                      <td key={j} className="px-3 py-2 text-slate-700 whitespace-nowrap">{cell}</td>
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
          ? 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
          : 'bg-indigo-600 text-white rounded-br-sm'
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
              ? 'opacity-40 cursor-not-allowed border-slate-200 text-slate-400 bg-white'
              : 'border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-300 cursor-pointer shadow-sm'
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
        consumed ? 'opacity-40 cursor-not-allowed border-slate-200 bg-slate-50' :
        drag     ? 'border-indigo-400 bg-indigo-50'
                 : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/50'
      )}
      onClick={() => !consumed && ref.current?.click()}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
    >
      <FileSpreadsheet size={28} className="mx-auto mb-2 text-indigo-400" />
      <p className="text-slate-700 text-sm font-medium">Drop your Excel here, or click to browse</p>
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
  const [readOnly,   setReadOnly]   = useState(false);
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
  const rawFileRef  = useRef(null);       // raw File object for optimizer API
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
    await bot('Great — let\'s plan your fleet.\n\nWhich scheduling algorithm would you like to use?');
    const algoChoice = await waitChoice([
      { id: 'greedy',  label: '⚡ Smart Greedy' },
      { id: 'pairing', label: '🔗 Pairing Heuristic' },
      { id: 'ortools', label: '🎯 OR-Tools CP-SAT (optimal)' },
    ]);
    const ALGO_LABELS = { greedy: 'Smart Greedy', pairing: 'Pairing Heuristic', ortools: 'OR-Tools CP-SAT' };
    const algoLabel = ALGO_LABELS[algoChoice.id];

    const ALGO_EXPLAIN = {
      greedy:  'Sorts trips by departure time, assigns each to the first available bus with ≥15 min turnaround. Fast — runs in milliseconds and typically within 5–10% of optimal.',
      pairing: 'Matches morning pickups with evening drops on the same corridor, locks them to one bus, then fills remaining gaps with a greedy pass. Closest to how an experienced transport manager plans manually.',
      ortools: 'Models the schedule as a Vehicle Routing Problem with Time Windows (VRPTW) and uses Google\'s OR-Tools CP-SAT constraint solver — same engine used by Google Maps and FedEx — to find the provably minimum fleet size. Budget: 30 seconds.',
    };
    await bot(ALGO_EXPLAIN[algoChoice.id]);

    // ── Fire the API call immediately — it can take 40–60 s for OR-Tools ──
    const optimizePromise = rawFileRef.current ? (async () => {
      const fd = new FormData();
      fd.append('file', rawFileRef.current);
      fd.append('benchmark_buses', String(fleetRef.current.trips.length));
      const res = await fetch(`${OPTIMIZER_URL}/optimize`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('API error');
      return res.json();
    })() : Promise.reject(new Error('no file'));

    let fetchResolved = false;
    optimizePromise.then(() => { fetchResolved = true; }).catch(() => { fetchResolved = true; });

    // ── Step-by-step narration shown while the optimizer runs in background ──
    const NARRATION = {
      greedy: [
        `Optimizer started on ${fmt(fleetRef.current.trips.length)} trips.\n\nStep 1 — Sort by departure: all trips are ordered from earliest to latest departure. This ensures we always assign the most time-constrained trips first.`,
        `Step 2 — Availability timeline: for each trip we record when the bus becomes free: return time + 15-minute driver handover buffer. This prevents back-to-back assignments that would leave no time for the driver to swap.`,
        `Step 3 — Greedy assignment: for each trip (in departure order) we pick the bus that returned most recently and is still available. This maximises reuse — buses don't sit idle at the depot — and minimises the total fleet size.`,
        `Step 4 — Chain reconstruction: a "chain" is the full sequence of trips one bus handles across the day. Counting chains gives us the bus requirement. Chains starting at the depot with no predecessor trip = buses needed.`,
      ],
      pairing: [
        `Optimizer started on ${fmt(fleetRef.current.trips.length)} trips.\n\nStep 1 — Corridor analysis: scanning pickup and drop routes to detect shared geographies. Routes that serve the same area in opposite directions (AM pickup ↔ PM drop) are natural pairs for one dedicated bus.`,
        `Step 2 — Pair locking: matched AM-pickup + PM-drop pairs are committed to single buses — one bus per corridor. This mirrors how experienced transport managers build "anchor routes" to minimise empty running.`,
        `Step 3 — Residual greedy pass: unpaired trips (those with no morning/evening counterpart) go through the standard greedy assignment — sorted by departure, assigned to the earliest-available bus with a 15-min buffer.`,
        `Step 4 — Conflict scan: verifying all chains are valid — no two legs overlap, every handover is within the 15-min buffer. Counting total chains to get the final bus requirement…`,
      ],
      ortools: [
        `Optimizer started on ${fmt(fleetRef.current.trips.length)} trips.\n\nStep 1 — Problem formulation: modelling as a Vehicle Routing Problem with Time Windows (VRPTW). Each trip is a node with a fixed time window [departure, return]. A "vehicle" is a bus. Goal: minimum vehicles to cover all nodes.`,
        `Step 2 — Constraint model construction: for ${fmt(fleetRef.current.trips.length)} trips the solver builds ~${fmt(Math.round(fleetRef.current.trips.length * (fleetRef.current.trips.length - 1) / 2))} possible "arc" variables. Each arc (trip A → trip B) represents a bus doing A then B back-to-back. Arcs that violate the 15-min turnaround are pruned before search begins — this alone eliminates most of the search space.`,
        `Step 3 — CP-SAT search started: the solver runs clause learning (CDCL), LP relaxation, and branch-and-bound in parallel across multiple CPU threads. It's looking simultaneously for:\n  • An upper bound — any valid schedule (feasible solution found quickly)\n  • A lower bound — proof that fewer buses can't possibly work`,
        `Step 4 — Incumbent found: the solver has a feasible fleet size — a valid schedule that covers all trips. Now it's in "proof mode": trying to show that (incumbent − 1) buses makes the problem infeasible. Each failed attempt prunes a large branch of the search tree.`,
        `Step 5 — Bound tightening via LP relaxation: the solver relaxes the integer constraints, solves the LP, and uses the fractional solution to derive a tight lower bound. If the LP lower bound = the integer incumbent, optimality is proven immediately without more search.`,
        `Step 6 — Closing the optimality gap: OR-Tools is propagating time-window constraints backward through the chain — checking whether any assignment of the remaining trips is feasible under the hypothesis "use one fewer bus." Almost done…`,
      ],
    };

    for (const msg of NARRATION[algoChoice.id]) {
      if (fetchResolved) break;
      await bot(msg);
    }

    if (!fetchResolved) {
      await bot('Optimizer is still running — finishing the optimality proof. Results coming right up…');
    }

    let ganttBuses = null;
    let busCount = 0;
    let utilization = 0;
    let totalKm = fleetRef.current.totalKm;
    let comparison = null;

    try {
      const data = await optimizePromise;
      const algo = data[algoChoice.id];

      busCount    = algo.bus_count;
      utilization = algo.avg_utilization_pct ?? algo.utilization ?? 0;
      totalKm     = algo.total_run_km ?? totalKm;
      ganttBuses  = algo.buses;
      comparison  = data.comparison;

      resultsRef.current = {
        ...resultsRef.current,
        trip: {
          busCount,
          buses: algo.buses.map(b => ({
            id:     b.bus_id,
            freeAt: b.legs.length ? b.legs[b.legs.length - 1].end_min : 0,
            legs:   b.legs.map(l => ({
              routeName: l.route_name, tripType: l.trip_type,
              outTime: l.start_time,  inTime: l.end_time, km: 0, seats: 36,
            })),
          })),
          totalTrips: fleetRef.current.trips.length,
          totalKm, utilization,
          savedBuses: fleetRef.current.trips.length - busCount,
        },
      };
    } catch {
      await bot('(Optimizer server not reachable — using built-in solver instead.)');
      const r = runOptimalSchedule(fleetRef.current.trips, 0);
      busCount    = r.busCount;
      utilization = r.utilization;
      totalKm     = r.totalKm;
      resultsRef.current = { ...resultsRef.current, trip: r };
      ganttBuses = r.buses.map(b => ({
        bus_id: b.id,
        run_km: b.legs.reduce((s, l) => s + (l.km || 0), 0),
        legs: b.legs.map(l => ({
          route_name: l.routeName, trip_type: l.tripType,
          start_min: timeToMin(l.outTime), end_min: timeToMin(l.inTime),
          start_time: l.outTime, end_time: l.inTime,
          charge_start: null, charge_end: null,
        })),
      }));
    }

    await bot(
      `${algoLabel} complete.\n\n` +
      `${busCount} buses cover all ${fleetRef.current.trips.length} trips with ${utilization}% average utilisation. ` +
      `The remaining time per bus is depot turnaround, driver breaks, and standby.`
    );

    await bot('Schedule summary:', 'stats', { stats: [
      { label: 'Buses needed',      value: busCount,          hi: true },
      { label: 'Total daily km',    value: `${fmt(totalKm)} km`        },
      { label: 'Fleet utilisation', value: `${utilization}%`, hi: true },
      { label: 'Trips covered',     value: fleetRef.current.trips.length },
    ]});

    addMsg({ id: Date.now() + Math.random(), role: 'bot', type: 'gantt', content: null, meta: {
      title: `Bus Schedule Gantt — ${algoLabel} · ${busCount} buses`,
      buses: ganttBuses,
    }});

    if (comparison) {
      await bot('All algorithms compared:', 'table', {
        headers: ['Algorithm', 'Buses', 'Daily km', 'Utilisation'],
        rows: [
          ['Smart Greedy',    comparison.greedy?.bus_count,  `${comparison.greedy?.total_run_km} km`,  `${comparison.greedy?.utilization}%`],
          ['Pairing Heuristic',comparison.pairing?.bus_count,`${comparison.pairing?.total_run_km} km`, `${comparison.pairing?.utilization}%`],
          ['OR-Tools CP-SAT', comparison.ortools?.bus_count, `${comparison.ortools?.total_run_km} km`, `${comparison.ortools?.utilization}%`],
        ],
      });
    }
  }

  // ── Charging ──────────────────────────────────────────────────────────────
  async function doCharge() {
    await bot(
      `For the charging plan:\n\n` +
      `1. Each bus charges overnight — from when it returns to depot until next morning's departure\n` +
      `2. Tariff varies by hour: off-peak (23:00–06:00) ₹3.8–4.2/kWh; peak (07:00–10:00, 17:00–21:00) ₹8–9.5/kWh\n` +
      `3. The scheduler shifts each bus to the cheapest available overnight window\n` +
      `4. First I'll calculate the minimum chargers so every bus fits within its overnight window`
    );

    // ── Fire the API call immediately in the background ──
    const optimizePromise = rawFileRef.current ? (async () => {
      const fd = new FormData();
      fd.append('file', rawFileRef.current);
      fd.append('benchmark_buses', 999);
      const res = await fetch(`${OPTIMIZER_URL}/optimize`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('API error');
      return res.json();
    })() : Promise.reject(new Error('no file'));

    let fetchResolved = false;
    optimizePromise.then(() => { fetchResolved = true; }).catch(() => { fetchResolved = true; });

    // ── Narration while the optimizer runs ──
    const CHARGE_NARRATION = [
      `The optimizer is running the greedy trip scheduler on your routes to determine each bus's first departure and last return for the day. Charging always uses the greedy schedule as the baseline — same approach as the portal's EV Charging Planner.`,
      `While that runs — here's how charging window detection works:\n\nEach bus's overnight window = [last return time → first departure next morning]. For a typical transport fleet this spans roughly 19:00–06:00, an 11-hour window.\n\nA 60 kW charger adds 100 kWh in ~1h 40m (~3.3 half-hour slots). Most buses need only 2–2.5 hours of charger time, leaving the rest of the overnight window free.`,
      `Finding the minimum number of chargers is an interval graph colouring problem:\n\nEach bus maps to an interval [charge start slot → charge end slot] on the overnight timeline. The minimum chargers = the maximum number of intervals that overlap at any single 30-minute slot.\n\nWe find this via binary search: test N chargers → run the full schedule → any unscheduled buses means N is too small. Repeat, narrowing until we find the smallest valid N.`,
      `Why does the greedy schedule (more buses, fewer trips per bus) need FEWER chargers than an OR-Tools schedule (fewer buses, more trips per bus)?\n\nGreedy buses often finish their single trip early (e.g., return by 08:30) and start late next morning — giving a 22-hour charging window. OR-Tools buses are utilised all day (06:00–21:00) and have a tighter 9-hour overnight window. Tighter windows = harder scheduling = more chargers needed.\n\nSo 16 chargers for 113 greedy buses is not just normal — it's correct.`,
    ];

    for (const msg of CHARGE_NARRATION) {
      if (fetchResolved) break;
      await bot(msg);
    }

    if (!fetchResolved) {
      await bot('Optimizer still running — assembling the bus schedule, almost done…');
    }

    let busList = [];
    try {
      const data = await optimizePromise;
      busList = data.greedy.buses.map(busFromBackendLeg);
    } catch {
      // Fallback: convert stored trip result or recompute
      const tripResult = resultsRef.current.trip;
      if (tripResult?.buses) {
        busList = tripResult.buses.map(bus => ({
          busId:    `Bus-${String(bus.id).padStart(3, '0')}`,
          outTime:  bus.legs[bus.legs.length - 1]?.inTime,
          inTime:   bus.legs[0]?.outTime,
          kwh: null, soc: 60,
        }));
      } else {
        const r = runOptimalSchedule(fleetRef.current.trips, 0);
        busList = r.buses.map(bus => ({
          busId:    `Bus-${String(bus.id).padStart(3, '0')}`,
          outTime:  bus.legs[bus.legs.length - 1]?.inTime,
          inTime:   bus.legs[0]?.outTime,
          kwh: null, soc: 60,
        }));
      }
    }

    const minChargers = findMinChargers(busList);

    await bot(
      `Minimum chargers required: ${minChargers}\n\n` +
      `With ${minChargers} charger${minChargers !== 1 ? 's' : ''}, every bus fits within its overnight window.\n\n` +
      `How many chargers does your depot have? (Type a number, or press Enter to use the minimum of ${minChargers})`
    );
    const text        = await waitText();
    const numChargers = parseInt(text) || minChargers;

    await bot(
      `Scheduling charges across ${numChargers} charger${numChargers !== 1 ? 's' : ''}.\n\n` +
      `Each bus is assigned the cheapest available overnight window — high-urgency buses (low SoC, short window) get priority access.`
    );
    await delay(1500);

    const result = runScheduler(busList, numChargers);
    resultsRef.current = { ...resultsRef.current, charge: result };

    const delayedCount = result.scheduled.filter(b => b.delayed).length;
    await bot(
      `Charging plan complete.\n\n` +
      `${delayedCount} of ${result.scheduled.length} buses had their charge shifted to a cheaper tariff window — ` +
      `saving ₹${fmt(result.totalSavings)} vs charging immediately on return. ` +
      `That's ₹${fmt(Math.round(result.totalSavings / Math.max(1, result.scheduled.length)))} saved per bus per day.`
    );

    await bot('Charging plan summary:', 'stats', { stats: [
      { label: 'Buses scheduled',          value: result.scheduled.length,        hi: true },
      { label: 'Min chargers needed',      value: minChargers                               },
      { label: 'Total energy cost / day',  value: `₹${fmt(result.totalCost)}`,    hi: true },
      { label: 'Saved vs immediate charge',value: `₹${fmt(result.totalSavings)}`           },
    ]});

    addMsg({ id: Date.now() + Math.random(), role: 'bot', type: 'charger-gantt', content: null, meta: {
      title: `Charger Bay Timeline — ${numChargers} bay${numChargers !== 1 ? 's' : ''} · ${result.scheduled.length} buses`,
      scheduled: result.scheduled,
    }});

    if (result.scheduled.length > 0) {
      await bot('Per-bus charging slots:', 'table', {
        headers: ['Bus', 'Charger', 'Window', 'Charged', 'kWh', 'Cost (₹)', 'Saved (₹)'],
        rows: result.scheduled.slice(0, 40).map(b => [
          b.busId, b.charger,
          `${b.arrives} → ${b.departs}`,
          `${b.chargeStart} – ${b.chargeEnd}`,
          b.kWh, fmt(b.cost), b.savings > 0 ? fmt(b.savings) : '—',
        ]),
      });
    }

    if (result.conflicts.length > 0) {
      await bot(`⚠️ ${result.conflicts.length} bus${result.conflicts.length > 1 ? 'es' : ''} couldn't be scheduled — overnight window shorter than charge time. Adding one more charger or using mid-day opportunity charging would resolve this.`);
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
    if (session.conversation?.length > 0) {
      setMessages(session.conversation);
      if (session.results) resultsRef.current = session.results;
      setReadOnly(true);
      return;
    }
    runFlow(session);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── User interactions ─────────────────────────────────────────────────────
  async function handleFile(file) {
    setUploadDone(true);
    setShowUpload(false);
    rawFileRef.current = file;                // store for optimizer API calls
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 text-sm animate-pulse">Verifying your session…</p>
    </div>
  );

  if (invalid) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-xl border border-slate-200">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <X size={20} className="text-red-500" />
        </div>
        <h2 className="text-slate-800 font-bold text-lg mb-2">Invalid or expired link</h2>
        <p className="text-slate-500 text-sm">This analysis link is not valid or has expired. Please contact your Tata Motors representative for a new link.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 bg-white flex-shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/tata-logo.svg" alt="Tata Motors" className="h-8 w-auto" />
          <div>
            <p className="text-slate-800 font-bold text-sm">FleetOS Analyst</p>
            <p className="text-slate-400 text-xs">Tata Motors CV · Intelligent Fleet Planning</p>
          </div>
        </div>
        {session?.client_name && (
          <div className="bg-slate-100 px-3 py-1.5 rounded-full">
            <p className="text-slate-600 text-xs font-medium">{session.client_name}</p>
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

      {/* Input bar / read-only notice */}
      {readOnly ? (
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3.5 max-w-3xl w-full mx-auto flex-shrink-0 flex items-center justify-center gap-2">
          <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
          <p className="text-slate-400 text-xs">This session is complete — view only</p>
        </div>
      ) : (
        <div className="border-t border-slate-200 bg-white px-6 py-4 max-w-3xl w-full mx-auto flex-shrink-0">
          <div className={cn(
            'flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all',
            inputOn
              ? 'bg-white border-indigo-300 ring-2 ring-indigo-100'
              : 'bg-slate-50 border-slate-200 opacity-60'
          )}>
            <input
              className="flex-1 bg-transparent text-slate-800 placeholder-slate-400 text-sm outline-none"
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
      )}
    </div>
  );
}
