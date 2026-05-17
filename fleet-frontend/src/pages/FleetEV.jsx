import {
  Zap, Thermometer, AlertTriangle,
  Battery, Sun, Moon, Sunset,
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

function DemandChart() {
  const hours  = Array.from({ length: 24 }, (_, i) => i);
  const tariff = [
    4.2, 4.0, 3.8, 3.8, 3.9, 4.2,
    5.1, 6.8, 8.2, 9.5, 9.5, 8.0,
    7.0, 6.5, 6.2, 6.8, 7.5, 8.8,
    9.2, 9.0, 8.0, 6.5, 5.2, 4.5,
  ];
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
              className="flex-1 rounded-t-sm transition-all relative group"
              style={{
                height: `${heightPct}%`,
                backgroundColor: isNow
                  ? '#3b82f6'
                  : isOpt
                  ? '#22c55e60'
                  : '#ef444440',
                border: isNow ? '1px solid #3b82f6' : 'none',
              }}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1
                bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap
                opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                {i}:00 · ₹{t}/kWh
              </div>
            </div>
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
    </div>
  );
}

function EVBusCard({ bus, schedule }) {
  const degradation = Math.max(78, 100 - (Math.random() * 15 + 2)).toFixed(1);
  const ambientTemp = 28 + Math.floor(Math.random() * 10);
  const tooHot      = ambientTemp > 35;

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
        <SOCBar soc={bus.soc} charging={schedule?.status === 'charging'} />
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {[
          { label: 'Battery SoH',  value: `${degradation}%`,                          color: parseFloat(degradation) > 90 ? 'text-green-600' : 'text-amber-600' },
          { label: 'Km today',     value: `${bus.kmToday} km`,                         color: 'text-slate-800'  },
          { label: 'Energy used',  value: `${(bus.kmToday * 1.4).toFixed(0)} kWh`,    color: 'text-purple-600' },
          { label: 'Range left',   value: `${Math.round(bus.soc * 2.8)} km`,           color: bus.soc < 25 ? 'text-red-600' : 'text-slate-800' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-50 rounded-lg px-3 py-2">
            <p className="text-slate-400 text-xs mb-0.5">{label}</p>
            <p className={cn('font-semibold text-sm', color)}>{value}</p>
          </div>
        ))}
      </div>

      {schedule ? (
        <div className={cn(
          'rounded-lg px-3 py-2.5 border text-xs',
          schedule.status === 'charging'
            ? 'bg-blue-50 border-blue-200 text-blue-700'
            : schedule.status === 'queued'
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-green-50 border-green-200 text-green-700'
        )}>
          <div className="flex items-center gap-1.5 font-medium mb-0.5">
            <Zap size={11} />
            {schedule.status === 'charging' ? 'Currently charging'
             : schedule.status === 'queued'  ? `Scheduled: ${schedule.scheduledAt}`
             : 'Charge complete'}
          </div>
          <p className="text-slate-500">
            {schedule.status === 'charging'
              ? `${schedule.kw}kW AC · Full charge in ${schedule.eta}`
              : schedule.status === 'queued'
              ? `Off-peak slot · Est. cost ${formatINR(schedule.estCost)}`
              : `Ready for duty · SOC at ${Math.round(bus.soc)}%`
            }
          </p>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-400">
          Not scheduled — assign to charger
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

export default function FleetEV({ buses }) {
  const evBuses = buses.filter(b => b.fuelType === 'Electric');

  const schedules = {
    'MH12-AB-1234': { status: 'charging', kw: 60, eta: '2h 15m',   scheduledAt: null,    estCost: 420 },
    'MH12-CD-5678': { status: 'queued',   kw: 60, eta: '3h 00m',   scheduledAt: '23:00', estCost: 380 },
    'MH12-EF-9012': { status: 'complete', kw: 0,  eta: null,        scheduledAt: null,    estCost: 510 },
    'MH12-GH-3456': { status: 'queued',   kw: 60, eta: '2h 45m',   scheduledAt: '01:00', estCost: 360 },
    'MH12-IJ-7890': { status: 'queued',   kw: 60, eta: '1h 50m',   scheduledAt: '00:00', estCost: 290 },
  };

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

  return (
    <div className="flex flex-col gap-5">

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
        <div className="flex items-center gap-3 bg-red-50 border border-red-200
          rounded-xl px-5 py-3">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

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
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">

          <div className="bg-gradient-to-br from-blue-50 to-purple-50
            border border-blue-200 rounded-xl p-4">
            <p className="text-blue-700 font-semibold text-sm flex items-center gap-2 mb-1">
              <Zap size={14} /> Smart Charging Active
            </p>
            <p className="text-slate-500 text-xs mb-3">
              3 buses scheduled for off-peak charging (22:00–06:00) to avoid
              peak demand surcharge.
            </p>
            <div className="flex items-center justify-between bg-green-50
              border border-green-200 rounded-lg px-3 py-2">
              <span className="text-green-700 text-xs font-medium">Est. savings today</span>
              <span className="text-green-700 font-bold text-sm">
                {formatINR(peakSaving + 840)}
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-2">
              vs charging all buses during peak hours (₹9.5/kWh)
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">
              24h Electricity Tariff
            </p>
            <DemandChart />
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

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">
              Depot Chargers — 4 Slots
            </p>
            <div className="grid grid-cols-2 gap-2">
              {chargerSlots.map(slot => (
                <ChargingSlot key={slot.id} slot={slot} />
              ))}
            </div>
          </div>

        </div>
      </div>


    </div>
  );
}
