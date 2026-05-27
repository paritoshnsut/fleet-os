import { useState, useEffect, useRef, useCallback } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { FleetConfigProvider, useFleetConfig } from './contexts/FleetConfigContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import OnboardingWizard from './pages/OnboardingWizard';
import { useTelemetry } from './hooks/useTelemetry';
import { useAlerts } from './hooks/useAlerts';


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
import ScenarioEngine   from './pages/ScenarioEngine';
import ClientSessions   from './pages/ClientSessions';
import ClientChat       from './pages/ClientChat';

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
  'scenario-engine':   ScenarioEngine,
  'client-sessions':   ClientSessions,
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
  const { buses, alerts, connected, ...telemetry } = useTelemetry(user?.id);
  const { updateConfig } = useFleetConfig();

  // Single demo-active flag — lifted here so all alert pipelines gate on the same source
  const [demoActive, setDemoActive] = useState(false);

  const { incidents, updateStatus } = useAlerts(demoActive ? alerts : []);

  const defaultPage = profile ? (ROLE_HOME[profile.role] ?? 'fleet-map') : 'fleet-map';
  const [activePage, setActivePage] = useState(defaultPage);

  // Update deployed bus count in Control Center config once buses arrive from telemetry
  useEffect(() => {
    if (buses.length > 0) updateConfig({ deployedBusCount: buses.length });
  }, [buses.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // When profile loads for a given user, jump to that role's home page.
  // Track user.id so switching accounts always resets to the correct tab.
  const initialPageSet = useRef(null);
  useEffect(() => {
    if (profile && user && initialPageSet.current !== user.id) {
      initialPageSet.current = user.id;
      setActivePage(ROLE_HOME[profile.role] ?? 'fleet-map');
    }
  }, [profile, user]);

  // Stable WS alert accumulator — only grows while demo is running
  const [wsAccum,   setWsAccum]   = useState([]);
  const wsSeenRef = useRef(new Set());
  useEffect(() => {
    const fresh = [];
    alerts.forEach(a => {
      const key = `${a.busId ?? 'x'}-${(a.type ?? a.message ?? '').slice(0, 30).replace(/\s+/g, '-').toLowerCase()}`;
      if (wsSeenRef.current.has(key)) return;
      wsSeenRef.current.add(key);      // always mark seen so they don't burst when demo starts
      if (!demoActive) return;         // only log to Alert Center during demo
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
  }, [alerts, demoActive]);

  // Called by FleetMap when a DEMO_EVENT toast fires — mirrors it into Alert Center
  const pushDemoAlert = useCallback((event) => {
    const ts = new Date().toISOString();
    const key = `demo-${(event.message ?? '').slice(0, 40).replace(/\s+/g, '-').toLowerCase()}`;
    if (wsSeenRef.current.has(key)) return;
    wsSeenRef.current.add(key);
    setWsAccum(prev => [{
      id:          key,
      _wsOnly:     true,
      bus_id:      event.busId   ?? null,
      route_no:    event.routeNo ?? null,
      driver_name: null,
      message:     event.message || 'Demo Alert',
      severity:    event.severity ?? 'medium',
      status:      'new',
      detected_at: ts,
      timeline:    [{ by: 'System', note: event.message || 'Demo Alert', ts, type: 'system' }],
    }, ...prev]);
  }, []);

  if (loading || (user && !profile)) {
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
        demoActive={demoActive}
        setDemoActive={setDemoActive}
        onDemoAlert={pushDemoAlert}
      />
    </Layout>
  );
}

export default function App() {
  // Magic-link route: ?token=xxx renders the client chat without any auth
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) return <ClientChat token={token} />;

  return (
    <AuthProvider>
      <FleetConfigProvider>
        <AppShell />
      </FleetConfigProvider>
    </AuthProvider>
  );
}
