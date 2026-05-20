import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FleetConfigProvider, useFleetConfig } from './contexts/FleetConfigContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import OnboardingWizard from './pages/OnboardingWizard';
import { useTelemetry } from './hooks/useTelemetry';
import { useAlerts } from './hooks/useAlerts';
import { syncFleetToBackend } from './lib/syncFleet';

import FleetMap      from './pages/FleetMap';
import FleetDrivers  from './pages/FleetDrivers';
import FleetGCC      from './pages/FleetGCC';
import FleetEV       from './pages/FleetEV';
import FleetSetup    from './pages/FleetSetup';
import SafeSchool    from './pages/SafeSchool';
import SafeParent    from './pages/SafeParent';
import SafeAdmin     from './pages/SafeAdmin';
import ONDCJourney   from './pages/ONDCJourney';
import ONDCArrivals  from './pages/ONDCArrivals';
import AlertCenter   from './pages/AlertCenter';
import ShiftHandover from './pages/ShiftHandover';
import DefectReports from './pages/DefectReports';
import TripPlanner      from './pages/TripPlanner';
import TCOAnalysis      from './pages/TCOAnalysis';
import ChargingPlanner  from './pages/ChargingPlanner';

const PAGES = {
  'fleet-map':      FleetMap,
  'fleet-drivers':  FleetDrivers,
  'fleet-gcc':      FleetGCC,
  'fleet-ev':       FleetEV,
  'fleet-setup':    FleetSetup,
  'safe-school':    SafeSchool,
  'safe-parent':    SafeParent,
  'safe-admin':     SafeAdmin,
  'ondc-journey':   ONDCJourney,
  'ondc-arrivals':  ONDCArrivals,
  'fleet-alerts':   AlertCenter,
  'fleet-handover': ShiftHandover,
  'fleet-defects':  DefectReports,
  'trip-planner':      TripPlanner,
  'tco-analysis':      TCOAnalysis,
  'charging-planner':  ChargingPlanner,
};

// First page shown per role after login / after onboarding
const ROLE_HOME = {
  admin:             'fleet-map',
  fleet_operator:    'fleet-map',
  internal_analyst:  'trip-planner',
  school_staff:      'safe-school',
  parent:            'safe-parent',
};

function AppShell() {
  const { user, profile, loading, isOnboarded, isDemoMode } = useAuth();
  const { buses, alerts, connected, ...telemetry } = useTelemetry();
  const { incidents, updateStatus } = useAlerts(alerts);
  const { updateConfig } = useFleetConfig();

  const defaultPage = profile ? (ROLE_HOME[profile.role] ?? 'fleet-map') : 'fleet-map';
  const [activePage, setActivePage] = useState(defaultPage);

  // Sync Fleet Setup buses/drivers to the backend simulator once on login
  // and update the deployed bus count in the Control Center config
  useEffect(() => {
    if (user) {
      syncFleetToBackend(user.id).then(count => {
        if (count > 0) updateConfig({ deployedBusCount: count });
      });
    }
  }, [user?.id]);

  // When profile first loads (async after session), jump to the correct home page
  const initialPageSet = useRef(false);
  useEffect(() => {
    if (profile && !initialPageSet.current) {
      initialPageSet.current = true;
      setActivePage(ROLE_HOME[profile.role] ?? 'fleet-map');
    }
  }, [profile]);

  // Stable WS alert accumulator — lives here so it persists across page navigation
  const [wsAccum,   setWsAccum]   = useState([]);
  const wsSeenRef = useRef(new Set());
  useEffect(() => {
    const fresh = [];
    alerts.forEach(a => {
      const key = `${a.busId ?? 'x'}-${(a.type ?? a.message ?? '').slice(0, 30).replace(/\s+/g, '-').toLowerCase()}`;
      if (wsSeenRef.current.has(key)) return;
      wsSeenRef.current.add(key);
      fresh.push({
        id:          key,
        _wsOnly:     true,
        bus_id:      a.busId      ?? null,
        route_no:    a.routeNo    ?? null,
        driver_name: a.driverName ?? null,
        message:     a.message    || 'Live Alert',
        severity:    a.severity   ?? 'medium',
        status:      'new',
        detected_at: new Date(a.id).toISOString(),
        timeline:    [{ by: 'System', note: a.message || 'Live Alert', ts: new Date(a.id).toISOString(), type: 'system' }],
      });
    });
    if (fresh.length > 0) setWsAccum(prev => [...fresh, ...prev]);
  }, [alerts]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // Fleet operators must complete onboarding before seeing the dashboard
  if (!isOnboarded) return <OnboardingWizard />;

  const PageComponent = PAGES[activePage] ?? FleetMap;

  return (
    <Layout
      activePage={activePage}
      setActivePage={setActivePage}
      connected={connected}
      wsAccum={wsAccum}
      isDemoMode={isDemoMode}
    >
      <PageComponent
        buses={buses}
        alerts={alerts}
        incidents={incidents}
        wsAccum={wsAccum}
        updateStatus={updateStatus}
        fetchDrivers={telemetry.fetchDrivers}
        fetchGCC={telemetry.fetchGCC}
        fetchStudents={telemetry.fetchStudents}
        fetchArrivals={telemetry.fetchArrivals}
      />
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FleetConfigProvider>
        <AppShell />
      </FleetConfigProvider>
    </AuthProvider>
  );
}
