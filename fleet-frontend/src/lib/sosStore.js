// Shared in-memory pub/sub store so SafeParent and SafeAdmin stay in sync
// without needing Redux or Context threading through the whole app.

let _alerts   = [];
let _listeners = [];

function _emit() {
  _listeners.forEach(fn => fn([..._alerts]));
}

export function raiseSOS(alert) {
  _alerts = [alert, ..._alerts];
  _emit();
}

export function replyToAlert(alertId, reply) {
  _alerts = _alerts.map(a =>
    a.id === alertId
      ? { ...a, status: 'in_progress', thread: [...(a.thread ?? []), reply] }
      : a
  );
  _emit();
}

export function resolveSOSAlert(alertId) {
  _alerts = _alerts.map(a =>
    a.id === alertId ? { ...a, status: 'resolved' } : a
  );
  _emit();
}

export function subscribeToSOS(fn) {
  _listeners.push(fn);
  fn([..._alerts]);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}
