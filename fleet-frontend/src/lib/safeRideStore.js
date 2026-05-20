// Shared in-memory pub/sub store for SafeRide cross-page state.
// Broadcasts: school → parents. Boarding simulation: school → all views.

// ── Broadcast store ───────────────────────────────────────────────────────────
let _broadcasts = [];
let _bListeners = [];

function _emitBroadcasts() {
  _bListeners.forEach(fn => fn([..._broadcasts]));
}

export function sendBroadcast(message) {
  const time = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  _broadcasts = [{ id: Date.now(), message, time }, ..._broadcasts];
  _emitBroadcasts();
}

export function subscribeToBroadcasts(fn) {
  _bListeners.push(fn);
  fn([..._broadcasts]);
  return () => { _bListeners = _bListeners.filter(l => l !== fn); };
}

// ── Boarding simulation store ─────────────────────────────────────────────────
let _boardingState  = {};   // studentId → { status: 'pending'|'boarded', time? }
let _simRunning     = false;
let _simListeners   = [];
let _incidentLog    = [];
let _incListeners   = [];

function _emitBoarding() {
  _simListeners.forEach(fn => fn({ ..._boardingState }, _simRunning));
}

function _emitIncidents() {
  _incListeners.forEach(fn => fn([..._incidentLog]));
}

function _addIncident(entry) {
  _incidentLog = [entry, ..._incidentLog];
  _emitIncidents();
}

export function startSimulation(students) {
  if (_simRunning) return;
  _simRunning  = true;
  _boardingState = {};
  students.forEach(s => { _boardingState[s.id] = { status: 'pending' }; });
  _incidentLog = [];
  _emitBoarding();
  _emitIncidents();

  const time0 = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  _addIncident({ id: Date.now(), severity: 'ok', type: 'Route Started', detail: 'Morning route simulation began', time: time0, bus: 'ALL' });

  let idx = 0;
  const tick = () => {
    if (idx >= students.length) {
      _simRunning = false;
      const tf = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      _addIncident({ id: Date.now() + 1, severity: 'ok', type: 'Route Complete', detail: `All ${students.length} students accounted for`, time: tf, bus: 'ALL' });
      _emitBoarding();
      return;
    }
    const s = students[idx++];
    const t = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    _boardingState = { ..._boardingState, [s.id]: { status: 'boarded', time: t } };
    _emitBoarding();
    _addIncident({ id: Date.now() + idx, severity: 'ok', type: 'Boarded', detail: `${s.name} boarded at ${s.stop}`, time: t, bus: s.busNumber ?? '—' });
    setTimeout(tick, 2000 + Math.random() * 1500);
  };
  setTimeout(tick, 1200);
}

export function resetSimulation() {
  _simRunning    = false;
  _boardingState = {};
  _incidentLog   = [];
  _emitBoarding();
  _emitIncidents();
}

export function subscribeToBoardingState(fn) {
  _simListeners.push(fn);
  fn({ ..._boardingState }, _simRunning);
  return () => { _simListeners = _simListeners.filter(l => l !== fn); };
}

export function subscribeToIncidents(fn) {
  _incListeners.push(fn);
  fn([..._incidentLog]);
  return () => { _incListeners = _incListeners.filter(l => l !== fn); };
}
