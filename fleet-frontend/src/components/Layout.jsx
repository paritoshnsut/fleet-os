import { useState } from 'react';
import Sidebar from './Sidebar';
import TopBar  from './TopBar';
import { AlertTriangle, X } from 'lucide-react';

export default function Layout({ activePage, setActivePage, connected, wsAccum = [], isDemoMode, children }) {
  const [demoDismissed, setDemoDismissed] = useState(false);
  const showBanner = isDemoMode && !demoDismissed;

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Sidebar activePage={activePage} setActivePage={setActivePage} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar connected={connected} wsAccum={wsAccum} activePage={activePage} />

        {showBanner && (
          <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-5 py-2.5
            flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-amber-700 text-xs">
              <AlertTriangle size={13} className="flex-shrink-0" />
              <span>
                <strong>Demo data</strong> — you're viewing sample buses and drivers.{' '}
                <button
                  onClick={() => setActivePage('fleet-setup')}
                  className="underline underline-offset-2 hover:text-amber-900 transition-colors font-medium"
                >
                  Add your fleet in Fleet Setup
                </button>
                {' '}to see live tracking.
              </span>
            </div>
            <button
              onClick={() => setDemoDismissed(true)}
              className="text-amber-400 hover:text-amber-700 transition-colors flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
