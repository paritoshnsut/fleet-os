import { Wifi, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';

export default function TopBar({ connected, activePage }) {
  const pageLabels = {
    'fleet-map':     'Fleet Intelligence — Live Map',
    'fleet-drivers': 'Fleet Intelligence — Driver Scorecards',
    'fleet-gcc':     'Fleet Intelligence — GCC Compliance',
    'fleet-ev':      'Fleet Intelligence — EV Charging',
    'safe-school':   'SafeRide — School Dashboard',
    'safe-admin':    'SafeRide — Control Panel',
    'safe-parent':   'SafeRide — Parent View',
    'ondc-journey':  'ONDC Transport — Journey Planner',
    'ondc-arrivals': 'ONDC Transport — Live Arrivals',
    'fleet-alerts':  'Fleet Intelligence — Alert Center',
    'fleet-handover':'Fleet Intelligence — Shift Handover Log',
    'fleet-defects': 'Fleet Intelligence — Trip Defect Reports',
    'fleet-setup':   'Fleet Intelligence — Fleet Setup',
    'trip-planner':     'Fleet Intelligence — Trip Planner',
    'client-sessions':  'Client Portal — Analysis Sessions',
  };

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
