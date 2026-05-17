import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bus, Clock, Users, Zap, Fuel, MapPin, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

const STOPS = [
  "Swargate", "Shivajinagar", "Deccan Gymkhana",
  "Aundh", "Wakad", "Hinjewadi", "Kharadi",
  "Viman Nagar", "Kalyani Nagar", "Hadapsar",
];

function createBusIcon(color) {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;border-radius:50%;
      background:${color}22;border:2.5px solid ${color};
      display:flex;align-items:center;justify-content:center;
      font-size:12px;box-shadow:0 0 8px ${color}44;">🚌</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

const STOP_COLORS = {
  "Swargate": "#3b82f6", "Shivajinagar": "#8b5cf6",
  "Deccan Gymkhana": "#f59e0b", "Aundh": "#10b981",
};

export default function ONDCArrivals({ buses, fetchArrivals }) {
  const [selectedStop, setSelectedStop] = useState('Shivajinagar');
  const [arrivals,     setArrivals]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState(new Date());

  async function load(stop) {
    setLoading(true);
    try {
      const data = await fetchArrivals(stop);
      setArrivals(data);
      setLastUpdated(new Date());
    } catch {
      setArrivals([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(selectedStop); }, [selectedStop]);

  // Auto-refresh every 15s
  useEffect(() => {
    const t = setInterval(() => load(selectedStop), 15000);
    return () => clearInterval(t);
  }, [selectedStop]);

  return (
    <div className="flex flex-col gap-5">

      {/* Stop selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-4 flex items-center gap-2">
          <MapPin size={12} className="text-blue-600" />
          Live Bus Arrivals — Select Your Stop
        </p>
        <div className="flex flex-wrap gap-2">
          {STOPS.map(stop => (
            <button
              key={stop}
              onClick={() => setSelectedStop(stop)}
              className={cn(
                'px-4 py-2 rounded-xl border text-sm transition-all font-medium',
                selectedStop === stop
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300'
              )}
            >
              {stop}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Arrivals list */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-slate-800 font-semibold">Buses at {selectedStop}</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Updated {lastUpdated.toLocaleTimeString()} · refreshes every 15s
              </p>
            </div>
            <button onClick={() => load(selectedStop)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200
                rounded-lg text-slate-400 hover:text-slate-600 text-xs transition-colors shadow-sm">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Arrival cards */}
          <div className="flex flex-col gap-3">
            {loading ? (
              <div className="text-center py-12 text-slate-400">
                <RefreshCw size={24} className="mx-auto mb-2 animate-spin" />
                Fetching live arrivals...
              </div>
            ) : arrivals.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Bus size={32} className="mx-auto mb-2 opacity-40" />
                No arrivals data for this stop
              </div>
            ) : (
              arrivals.map((bus, i) => {
                const etaMins = parseInt(bus.eta);
                const isNext  = i === 0;
                return (
                  <div key={i} className={cn(
                    'border rounded-2xl p-5 transition-all',
                    isNext
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-white border-slate-200 shadow-sm'
                  )}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {isNext && (
                            <span className="px-2 py-0.5 bg-blue-100 border border-blue-200
                              rounded-full text-blue-700 text-xs font-medium animate-pulse">
                              Next Bus
                            </span>
                          )}
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full border',
                            bus.fuelType === 'Electric'
                              ? 'bg-green-50 border-green-200 text-green-600'
                              : 'bg-orange-50 border-orange-200 text-orange-600'
                          )}>
                            {bus.fuelType === 'Electric' ? '⚡ EV' : '🔵 CNG'}
                          </span>
                        </div>
                        <p className="text-slate-800 font-bold text-lg">{bus.routeNo}</p>
                        <p className="text-slate-500 text-sm">{bus.routeName}</p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          'text-3xl font-bold',
                          etaMins <= 3 ? 'text-green-600' :
                          etaMins <= 7 ? 'text-blue-600'  : 'text-slate-500'
                        )}>
                          {bus.eta}
                        </p>
                        <p className="text-slate-400 text-xs">away</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { icon: Users,  label: 'On board',  value: `${bus.passengers} pax`,
                          color: bus.passengers > 45 ? 'text-red-500' : 'text-slate-800' },
                        { icon: Bus,    label: 'Speed',     value: `${bus.speed} km/h`,
                          color: bus.speed > 65 ? 'text-red-500' : 'text-green-600' },
                        { icon: bus.fuelType === 'Electric' ? Zap : Fuel,
                          label: 'Capacity', value: '52 seats', color: 'text-slate-800' },
                      ].map(({ icon: Icon, label, value, color }) => (
                        <div key={label} className="bg-slate-50 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-1 text-slate-400 text-xs mb-1">
                            <Icon size={11} /> {label}
                          </div>
                          <p className={cn('font-semibold text-sm', color)}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Capacity bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-400 mb-1">
                        <span>Occupancy</span>
                        <span>{Math.round((bus.passengers / 52) * 100)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, (bus.passengers / 52) * 100)}%`,
                            background: bus.passengers > 45 ? '#ef4444' : '#3b82f6',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Network status */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">
              ONDC Network Status
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Routes listed', value: '8',    color: 'text-blue-600'   },
                { label: 'Buses tracked', value: buses.length, color: 'text-green-600' },
                { label: 'Network',       value: 'Live', color: 'text-green-600'  },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className={cn('text-2xl font-bold', color)}>{value}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Mini map */}
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: '320px' }}>
            <MapContainer
              center={[18.5204, 73.8567]} zoom={12}
              style={{ width: '100%', height: '100%', background: '#f1f5f9' }}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; CARTO'
              />
              {buses.map((bus, i) => {
                if (!bus.lat || !bus.lng) return null;
                const colors = ['#3b82f6','#8b5cf6','#f59e0b','#10b981','#ef4444','#06b6d4','#f97316','#ec4899'];
                return (
                  <Marker
                    key={bus.busId}
                    position={[bus.lat, bus.lng]}
                    icon={createBusIcon(colors[i % colors.length])}
                  >
                    <Popup>
                      <div style={{ background: 'white', color: '#1e293b', padding: '4px' }}>
                        <p style={{ fontWeight: 700, fontSize: '13px' }}>{bus.routeNo}</p>
                        <p style={{ color: '#64748b', fontSize: '11px' }}>{bus.routeName}</p>
                        <p style={{ fontSize: '12px', marginTop: '4px' }}>{bus.speed} km/h</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>

          {/* Stop info card */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={14} className="text-blue-600" />
              <p className="text-slate-800 font-semibold text-sm">{selectedStop}</p>
            </div>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Routes serving stop', value: `${Math.floor(Math.random()*3)+2} routes` },
                { label: 'Next bus in',          value: arrivals[0]?.eta || '—' },
                { label: 'Buses in next 30 min', value: `${arrivals.length} buses` },
                { label: 'ONDC enabled',         value: 'Yes' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-slate-800 font-medium">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick tip */}
          <div className="bg-gradient-to-br from-blue-50 to-purple-50
            border border-blue-200 rounded-xl p-4">
            <p className="text-blue-700 font-medium text-sm mb-1">Pro Tip</p>
            <p className="text-slate-500 text-xs leading-relaxed">
              ONDC live arrival data is sourced directly from AIS 140 GPS devices on each bus.
              Accuracy is within 30 seconds of actual arrival.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .leaflet-popup-content-wrapper {
          background: white !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 12px !important;
          padding: 0 !important;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important;
        }
        .leaflet-popup-content { margin: 12px !important; color: #1e293b !important; }
        .leaflet-popup-tip { background: white !important; }
        .leaflet-popup-close-button { color: #94a3b8 !important; }
        .leaflet-control-attribution {
          background: rgba(255,255,255,0.8) !important;
          color: #64748b !important;
          font-size: 9px !important;
        }
      `}</style>
    </div>
  );
}
