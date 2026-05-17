import { useState } from 'react';
import {
  MapPin, Navigation, Clock, Search,
  Bus, Train, ArrowRight, Zap, Users,
  ChevronRight, CheckCircle, AlertCircle
} from 'lucide-react';
import { cn, formatINR } from '../lib/utils';

// ── Mock journey data ─────────────────────────────────────────────────────────
const JOURNEYS = {
  "Wakad → Swargate": [
    {
      id: 1, duration: "52 min", fare: 38, transfers: 1, co2: "1.2 kg",
      legs: [
        { mode: "bus", route: "Route 101", from: "Wakad", to: "Shivajinagar", time: "22 min", fare: 18, color: "#3b82f6", operator: "PMPML" },
        { mode: "walk", from: "Shivajinagar", to: "Shivajinagar Metro", time: "4 min", fare: 0, color: "#64748b" },
        { mode: "bus", route: "Route 156", from: "Shivajinagar", to: "Swargate", time: "18 min", fare: 15, color: "#10b981", operator: "PMPML" },
        { mode: "walk", from: "Swargate Bus Stop", to: "Swargate", time: "3 min", fare: 0, color: "#64748b" },
      ]
    },
    {
      id: 2, duration: "41 min", fare: 52, transfers: 0, co2: "0.8 kg",
      legs: [
        { mode: "bus", route: "Route 95", from: "Wakad", to: "Swargate", time: "38 min", fare: 48, color: "#ec4899", operator: "PMPML EV" },
        { mode: "walk", from: "Swargate Bus Stop", to: "Swargate", time: "3 min", fare: 0, color: "#64748b" },
      ]
    },
    {
      id: 3, duration: "68 min", fare: 24, transfers: 2, co2: "0.6 kg",
      legs: [
        { mode: "bus", route: "Route 89", from: "Wakad", to: "Deccan", time: "28 min", fare: 12, color: "#06b6d4", operator: "PMPML" },
        { mode: "walk", from: "Deccan", to: "Deccan Bus Stand", time: "5 min", fare: 0, color: "#64748b" },
        { mode: "bus", route: "Route 211", from: "Deccan", to: "Swargate", time: "22 min", fare: 10, color: "#f97316", operator: "PMPML" },
        { mode: "walk", from: "Swargate Stop", to: "Swargate", time: "4 min", fare: 0, color: "#64748b" },
      ]
    },
  ],
  "Kharadi → Hinjewadi": [
    {
      id: 1, duration: "65 min", fare: 52, transfers: 1, co2: "1.8 kg",
      legs: [
        { mode: "bus", route: "Route 178", from: "Kharadi", to: "Shivajinagar", time: "32 min", fare: 28, color: "#ef4444", operator: "PMPML" },
        { mode: "bus", route: "Route 101", from: "Shivajinagar", to: "Hinjewadi", time: "26 min", fare: 22, color: "#3b82f6", operator: "PMPML" },
      ]
    },
    {
      id: 2, duration: "80 min", fare: 35, transfers: 0, co2: "1.1 kg",
      legs: [
        { mode: "bus", route: "Route 95", from: "Kharadi", to: "Hinjewadi", time: "75 min", fare: 32, color: "#ec4899", operator: "PMPML EV" },
        { mode: "walk", from: "Hinjewadi Phase 1", to: "Hinjewadi", time: "5 min", fare: 0, color: "#64748b" },
      ]
    },
  ],
};

const POPULAR = [
  "Wakad → Swargate",
  "Kharadi → Hinjewadi",
  "Katraj → Shivajinagar",
  "Hadapsar → Deccan",
  "Pimpri → Swargate",
];

const STOPS = [
  "Wakad", "Hinjewadi", "Baner", "Aundh", "Shivajinagar",
  "Deccan", "Swargate", "Kothrud", "Hadapsar", "Kharadi",
  "Viman Nagar", "Kalyani Nagar", "Pimpri", "Chinchwad",
  "Katraj", "Kondhwa", "Wagholi", "Yerwada",
];

// ── Mode icon ─────────────────────────────────────────────────────────────────
function ModeIcon({ mode }) {
  if (mode === 'bus')  return <Bus    size={14} className="text-blue-600"  />;
  if (mode === 'walk') return <Navigation size={14} className="text-slate-400" />;
  return                      <Train  size={14} className="text-purple-600"/>;
}

// ── Journey option card ───────────────────────────────────────────────────────
function JourneyCard({ journey, isSelected, onSelect, onBook }) {
  const isFastest  = journey.id === 1;
  const isCheapest = journey.fare === Math.min(...Object.values(JOURNEYS).flat().map(j => j.fare));

  return (
    <div
      onClick={onSelect}
      className={cn(
        'border rounded-2xl p-5 cursor-pointer transition-all',
        isSelected
          ? 'border-blue-300 bg-blue-50'
          : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-slate-800 font-bold text-lg">
            <Clock size={16} className="text-slate-400" />
            {journey.duration}
          </div>
          <div className="flex gap-1">
            {isFastest && (
              <span className="px-2 py-0.5 bg-green-50 border border-green-200
                rounded-full text-green-600 text-xs font-medium">Fastest</span>
            )}
            {journey.transfers === 0 && (
              <span className="px-2 py-0.5 bg-blue-50 border border-blue-200
                rounded-full text-blue-600 text-xs font-medium">Direct</span>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-slate-800 font-bold text-lg">{formatINR(journey.fare)}</p>
          <p className="text-slate-400 text-xs">{journey.transfers} transfer{journey.transfers !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Leg visualiser */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {journey.legs.map((leg, i) => (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs"
              style={{
                background: leg.mode === 'walk' ? 'rgba(148,163,184,0.1)' : `${leg.color}15`,
                borderColor: leg.mode === 'walk' ? '#e2e8f0' : `${leg.color}40`,
              }}>
              <ModeIcon mode={leg.mode} />
              {leg.mode !== 'walk' && (
                <span className="font-medium" style={{ color: leg.color }}>{leg.route}</span>
              )}
              <span className="text-slate-400">{leg.time}</span>
            </div>
            {i < journey.legs.length - 1 && (
              <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Detailed legs */}
      {isSelected && (
        <div className="border-t border-slate-200 pt-4 mb-4">
          <div className="space-y-3">
            {journey.legs.map((leg, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${leg.color}20`, border: `1px solid ${leg.color}40` }}>
                  <ModeIcon mode={leg.mode} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-800 text-sm font-medium">
                      {leg.mode === 'walk' ? 'Walk' : leg.route}
                      {leg.operator && <span className="text-slate-400 text-xs ml-2">· {leg.operator}</span>}
                    </p>
                    <span className="text-slate-400 text-xs">{leg.time}</span>
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {leg.from} → {leg.to}
                    {leg.fare > 0 && <span className="text-slate-400 ml-2">· {formatINR(leg.fare)}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* CO2 */}
          <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200
            rounded-lg px-3 py-2">
            <Zap size={12} className="text-green-600" />
            <span className="text-green-700 text-xs">
              CO₂: {journey.co2} saved vs auto-rickshaw
            </span>
          </div>
        </div>
      )}

      {/* Book button */}
      {isSelected && (
        <button
          onClick={e => { e.stopPropagation(); onBook(journey); }}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl
            text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle size={16} />
          Book via ONDC · {formatINR(journey.fare)}
        </button>
      )}
    </div>
  );
}

// ── Booking confirmation ──────────────────────────────────────────────────────
function BookingConfirmation({ journey, route, onClose }) {
  const ref = `ONDC${Date.now().toString().slice(-6)}`;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-50 border border-green-200 rounded-full
            flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={32} className="text-green-600" />
          </div>
          <p className="text-slate-800 font-bold text-xl">Booking Confirmed</p>
          <p className="text-slate-500 text-sm mt-1">via ONDC Transport Network</p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 space-y-2">
          {[
            ["Booking Ref",  ref],
            ["Route",        route],
            ["Duration",     journey.duration],
            ["Fare paid",    formatINR(journey.fare)],
            ["Transfers",    `${journey.transfers}`],
            ["Valid for",    "Today only"],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between text-sm">
              <span className="text-slate-500">{l}</span>
              <span className="text-slate-800 font-medium">{v}</span>
            </div>
          ))}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
          <p className="text-blue-700 text-sm font-medium mb-1">NCMC QR Code</p>
          <div className="bg-white rounded-lg p-3 flex items-center justify-center border border-slate-200">
            <div className="grid grid-cols-8 gap-0.5">
              {Array.from({ length: 64 }).map((_, i) => (
                <div key={i} className="w-3 h-3 rounded-sm"
                  style={{ background: Math.random() > 0.5 ? '#000' : '#fff' }} />
              ))}
            </div>
          </div>
          <p className="text-blue-500 text-xs mt-2 text-center">
            Show this QR at boarding — {ref}
          </p>
        </div>

        <button onClick={onClose}
          className="w-full py-2.5 bg-slate-50 border border-slate-200 rounded-xl
            text-slate-600 text-sm hover:bg-slate-100 transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ONDCJourney({ buses }) {
  const [from,         setFrom]         = useState('');
  const [to,           setTo]           = useState('');
  const [results,      setResults]      = useState([]);
  const [selectedId,   setSelectedId]   = useState(null);
  const [searched,     setSearched]     = useState(false);
  const [booking,      setBooking]      = useState(null);
  const [showFromList, setShowFromList] = useState(false);
  const [showToList,   setShowToList]   = useState(false);

  function handleSearch() {
    if (!from || !to) return;
    const key = `${from} → ${to}`;
    const rev  = `${to} → ${from}`;
    const data = JOURNEYS[key] || JOURNEYS[rev] || JOURNEYS[POPULAR[0]];
    setResults(data);
    setSelectedId(data[0]?.id);
    setSearched(true);
    setShowFromList(false);
    setShowToList(false);
  }

  function handlePopular(route) {
    const [f, t] = route.split(' → ');
    setFrom(f); setTo(t);
    const data = JOURNEYS[route] || JOURNEYS[POPULAR[0]];
    setResults(data);
    setSelectedId(data[0]?.id);
    setSearched(true);
  }

  const filteredFrom = STOPS.filter(s => s.toLowerCase().includes(from.toLowerCase()) && s !== to);
  const filteredTo   = STOPS.filter(s => s.toLowerCase().includes(to.toLowerCase())   && s !== from);

  return (
    <div className="flex flex-col gap-5">
      {booking && (
        <BookingConfirmation
          journey={booking}
          route={`${from} → ${to}`}
          onClose={() => setBooking(null)}
        />
      )}

      {/* Search box */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-4 flex items-center gap-2">
          <Navigation size={12} className="text-blue-600" />
          Multimodal Journey Planner — Powered by ONDC
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* From */}
          <div className="relative">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl
              px-4 py-3 focus-within:border-blue-400 transition-colors">
              <MapPin size={16} className="text-green-500 flex-shrink-0" />
              <input
                className="flex-1 bg-transparent text-slate-800 text-sm outline-none placeholder-slate-400"
                placeholder="From..."
                value={from}
                onChange={e => { setFrom(e.target.value); setShowFromList(true); }}
                onFocus={() => setShowFromList(true)}
              />
            </div>
            {showFromList && from && filteredFrom.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200
                rounded-xl overflow-hidden z-50 shadow-lg">
                {filteredFrom.slice(0, 5).map(s => (
                  <button key={s} onClick={() => { setFrom(s); setShowFromList(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-600
                      hover:bg-slate-50 hover:text-slate-800 transition-colors flex items-center gap-2">
                    <MapPin size={12} className="text-slate-300" /> {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* To */}
          <div className="relative">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl
              px-4 py-3 focus-within:border-blue-400 transition-colors">
              <MapPin size={16} className="text-red-500 flex-shrink-0" />
              <input
                className="flex-1 bg-transparent text-slate-800 text-sm outline-none placeholder-slate-400"
                placeholder="To..."
                value={to}
                onChange={e => { setTo(e.target.value); setShowToList(true); }}
                onFocus={() => setShowToList(true)}
              />
            </div>
            {showToList && to && filteredTo.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200
                rounded-xl overflow-hidden z-50 shadow-lg">
                {filteredTo.slice(0, 5).map(s => (
                  <button key={s} onClick={() => { setTo(s); setShowToList(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-slate-600
                      hover:bg-slate-50 hover:text-slate-800 transition-colors flex items-center gap-2">
                    <MapPin size={12} className="text-slate-300" /> {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search button */}
          <button
            onClick={handleSearch}
            disabled={!from || !to}
            className={cn(
              'flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all',
              from && to
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            )}
          >
            <Search size={16} />
            Find Routes
          </button>
        </div>

        {/* Popular routes */}
        <div className="mt-4">
          <p className="text-slate-400 text-xs mb-2">Popular routes:</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR.map(route => (
              <button key={route} onClick={() => handlePopular(route)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-sm
                  text-slate-500 text-xs hover:text-slate-700 hover:border-slate-300 transition-all">
                {route}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live bus feed */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {buses.slice(0, 4).map(bus => (
          <div key={bus.busId} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-slate-600 text-xs font-medium">{bus.routeNo}</p>
            </div>
            <p className="text-slate-800 text-sm font-semibold mb-1">
              {Math.floor(Math.random() * 8) + 2} min
            </p>
            <p className="text-slate-400 text-xs truncate">{bus.routeName?.split('→')[0].trim()}</p>
            <div className="flex items-center gap-1 mt-2 text-slate-400 text-xs">
              <Users size={10} /> {bus.passengerLoad} on board
            </div>
          </div>
        ))}
      </div>

      {/* Results */}
      {searched && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-slate-800 font-semibold text-sm">
              {results.length} routes found · {from} → {to}
            </p>
            <span className="text-slate-400 text-xs">ONDC Network · Live data</span>
          </div>
          <div className="flex flex-col gap-3">
            {results.map(journey => (
              <JourneyCard
                key={journey.id}
                journey={journey}
                isSelected={selectedId === journey.id}
                onSelect={() => setSelectedId(journey.id)}
                onBook={j => setBooking(j)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!searched && (
        <div className="text-center py-16 text-slate-300">
          <Navigation size={40} className="mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium text-slate-400">Plan your journey</p>
          <p className="text-slate-400 text-sm mt-1">Search above or pick a popular route</p>
        </div>
      )}
    </div>
  );
}
