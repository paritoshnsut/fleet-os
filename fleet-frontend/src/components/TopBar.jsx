import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

const FLEET_ALERT_ROLES = new Set(['admin', 'fleet_operator']);

function timeAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function TopBar({ connected, wsAccum = [], activePage }) {
  const { profile } = useAuth();
  const showAlerts = FLEET_ALERT_ROLES.has(profile?.role);
  const pageLabels = {
    'fleet-map':     'Fleet Intelligence — Live Map',
    'fleet-drivers': 'Fleet Intelligence — Driver Scorecards',
    'fleet-gcc':     'Fleet Intelligence — GCC Compliance',
    'fleet-ev':      'Fleet Intelligence — EV Charging',
    'safe-school':   'SafeRide — School Dashboard',
    'safe-parent':   'SafeRide — Parent View',
    'ondc-journey':  'ONDC Transport — Journey Planner',
    'ondc-arrivals': 'ONDC Transport — Live Arrivals',
    'fleet-alerts':  'Fleet Intelligence — Alert Center',
    'fleet-handover':'Fleet Intelligence — Shift Handover Log',
    'fleet-defects': 'Fleet Intelligence — Trip Defect Reports',
    'fleet-setup':   'Fleet Intelligence — Fleet Setup',
    'trip-planner':  'Fleet Intelligence — Trip Planner',
  };

  const latest = wsAccum[0];

  return (
    <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-6 flex-shrink-0 shadow-sm">
      {/* Page title */}
      <div>
        <h1 className="text-slate-800 font-semibold text-sm">
          {pageLabels[activePage] || 'FleetOS'}
        </h1>
        <p className="text-slate-400 text-xs">Tata Motors · CV Passenger Division · Pune</p>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Latest alert ticker — fleet operators and admins only */}
        {showAlerts && latest && (
          <div className={cn(
            'hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs',
            latest.severity === 'high'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          )}>
            <AlertTriangle size={12} />
            <span className="truncate max-w-[260px]">{latest.message}</span>
            <span className="text-slate-400 flex-shrink-0">{timeAgo(latest.detected_at)}</span>
          </div>
        )}

        {/* Connection status */}
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border',
          connected
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        )}>
          {connected
            ? <><Wifi size={11} /> Live</>
            : <><WifiOff size={11} /> Offline</>
          }
        </div>
      </div>
    </header>
  );
}
