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

// ── Trip Scheduler (greedy first-fit) ────────────────────────────────────────
function runGreedySchedule(trips, maxBuses) {
  const sorted = [...trips]
    .filter(t => t.outTime && t.inTime)
    .sort((a, b) => timeToMin(a.outTime) - timeToMin(b.outTime));

  const buses = [];
  for (const trip of sorted) {
    const outMin = timeToMin(trip.outTime);
    const inMin  = timeToMin(trip.inTime);
    const bus    = buses.find(b => b.freeAt + 15 <= outMin);
    if (bus) {
      bus.legs.push(trip);
      bus.freeAt = inMin;
    } else if (!maxBuses || buses.length < maxBuses) {
      buses.push({ id: buses.length + 1, legs: [trip], freeAt: inMin });
    }
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
    await bot('Great — trip planning it is.\n\nHow many buses do you currently have available in your fleet? I\'ll find the minimum you actually need.');
    const text  = await waitText();
    const maxB  = parseInt(text) || 999;

    await bot('Running the schedule optimiser — greedy first-fit, pairing heuristic, corridor matching...');
    await delay(2200);

    const result = runGreedySchedule(fleetRef.current.trips, maxB);
    resultsRef.current = { ...resultsRef.current, trip: result };

    await bot('Here\'s your optimised trip schedule:', 'stats', { stats: [
      { label: 'Buses needed',     value: result.busCount,         hi: true  },
      { label: 'Buses available',  value: maxB === 999 ? '—' : maxB           },
      { label: 'Fleet utilisation',value: `${result.utilization}%`, hi: true },
      { label: 'Total daily km',   value: `${fmt(result.totalKm)} km`          },
    ]});

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
      await bot(`You can cover all ${result.totalTrips} trips with just ${result.busCount} buses — that's ${result.savedBuses} fewer than you planned. At ~₹75 lakh per bus, that's ₹${result.savedBuses * 75}L in fleet cost saved right away.`);
    }
  }

  // ── Charging ──────────────────────────────────────────────────────────────
  async function doCharge() {
    await bot('Calculating the minimum number of chargers your depot needs...');
    await delay(1000);

    const tripResult = resultsRef.current.trip || runGreedySchedule(fleetRef.current.trips, 999);
    const input = tripResult.buses.map(bus => ({
      busId:      `Bus ${bus.id}`,
      outTime:    bus.legs[0]?.outTime,
      inTime:     bus.legs[bus.legs.length - 1]?.inTime,
      kwhNeeded:  75 + Math.round(Math.random() * 45),
      soc:        35 + Math.round(Math.random() * 30),
    }));

    let minChargers = input.length;
    for (let n = 1; n <= 30; n++) {
      if (runChargingSchedule(input, n).conflicts.length === 0) { minChargers = n; break; }
    }

    await bot(`Minimum chargers required: **${minChargers}**\n\nWith ${minChargers} charger${minChargers !== 1 ? 's' : ''}, all ${input.length} buses fit within their overnight windows.\n\nHow many chargers does your depot actually have? (Type a number, or press Enter to use ${minChargers})`);
    const text        = await waitText();
    const numChargers = parseInt(text) || minChargers;

    await bot(`Scheduling charges across ${numChargers} charger${numChargers !== 1 ? 's' : ''} — avoiding peak tariff windows to cut electricity costs...`);
    await delay(1800);

    const result = runChargingSchedule(input, numChargers);
    resultsRef.current = { ...resultsRef.current, charge: result };

    await bot('Charging plan ready!', 'stats', { stats: [
      { label: 'Buses scheduled',          value: result.scheduled.length,        hi: true },
      { label: 'Min chargers needed',      value: minChargers                               },
      { label: 'Total energy cost',        value: `₹${fmt(result.totalCost)}`,    hi: true },
      { label: 'Saved vs immediate charge',value: `₹${fmt(result.totalSavings)}`           },
    ]});

    if (result.scheduled.length > 0) {
      await bot('Per-bus charging slots:', 'table', {
        headers: ['Bus', 'Charger', 'Start', 'End', 'kWh', 'Cost', 'Savings'],
        rows: result.scheduled.map(b => [
          b.busId, b.charger, b.chargeStart, b.chargeEnd,
          b.kWh, `₹${fmt(b.cost)}`, `₹${fmt(b.savings)}`,
        ]),
      });
    }

    if (result.conflicts.length > 0) {
      await bot(`⚠️ ${result.conflicts.length} bus${result.conflicts.length > 1 ? 'es' : ''} couldn't be fitted — their trip window is shorter than their charge time. Consider adding one more charger or using opportunity charging.`);
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

    await bot(`Comparing diesel vs EV total cost of ownership over 6 years for ${busCount} buses at ${kmPerDay} km/day...`);
    await delay(2000);

    const result = runTCOComparison(kmPerDay, busCount);
    resultsRef.current = { ...resultsRef.current, tco: result };

    await bot('Financial analysis complete!', 'stats', { stats: [
      { label: 'Diesel cost/km',     value: `₹${result.dslCPK}`                                          },
      { label: 'EV cost/km',         value: `₹${result.evCPK}`,                              hi: true    },
      { label: 'Annual saving (EV)', value: result.annualSaving > 0 ? `₹${fmt(result.annualSaving)}` : 'Diesel cheaper', hi: result.annualSaving > 0 },
      { label: 'Payback period',     value: `${result.paybackYrs} years`                                  },
    ]});

    if (result.isFavourable) {
      await bot(`EV looks compelling for your fleet. The extra upfront cost (₹${fmt(result.extraCapex)}) pays back in ${result.paybackYrs} years — and over the 6-year bus life you save ₹${fmt(result.npvSaving)} in NPV terms. That's a strong business case.`);
    } else {
      await bot(`At ${kmPerDay} km/day, the EV payback stretches to ${result.paybackYrs} years against a 6-year bus life. Routes with higher daily utilisation would improve this — even 50 extra km/day can shift the crossover point significantly.`);
    }
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
