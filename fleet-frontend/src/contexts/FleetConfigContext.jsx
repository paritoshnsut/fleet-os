import { createContext, useContext, useState, useCallback } from 'react';

const STORAGE_KEY = 'fleetConfig_v1';

const DEFAULTS = {
  overspeedThreshold:  65,    // km/h — used in Live Map & Driver Scorecards
  gccRatePerKm:        80,    // ₹/km — GCC rate paid per km operated
  gccDriverRatePerKm:  56.5,  // ₹/km — driver earnings rate
  deployedBusCount:    3,     // total buses deployed
  contractedKmPerDay:  180,   // km — daily contracted km per bus
  paymentCycleDays:    30,    // days — PSM payment cycle (overdue threshold)
};

const FleetConfigContext = createContext(DEFAULTS);

export function FleetConfigProvider({ children }) {
  const [config, setConfig] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  });

  const updateConfig = useCallback((patch) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <FleetConfigContext.Provider value={{ config, updateConfig }}>
      {children}
    </FleetConfigContext.Provider>
  );
}

export function useFleetConfig() {
  return useContext(FleetConfigContext);
}
