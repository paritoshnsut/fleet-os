import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Shield, MapPin, CheckCircle, Clock,
  AlertTriangle, Bell, Phone, Navigation,
  User, Bus, Calendar, X, ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';

function createBusIcon(speed) {
  const color = speed > 65 ? '#ef4444' : '#3b82f6';
  return L.divIcon({
    html: `<div style="width:36px;height:36px;border-radius:50%;
      background:${color}22;border:3px solid ${color};
      display:flex;align-items:center;justify-content:center;
      font-size:16px;box-shadow:0 0 12px ${color}66;">🚌</div>`,
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

// ── Absence Marker ────────────────────────────────────────────────────────────
function AbsenceMarker({ child, onMark }) {
  const [open,      setOpen]      = useState(false);
  const [days,      setDays]      = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [toast,     setToast]     = useState(false);

  const today     = new Date();
  const dateLabel = days === 1
    ? 'Today'
    : `Today + ${days - 1} more day${days > 2 ? 's' : ''}`;

  function handleConfirm() {
    setConfirmed(true);
    setOpen(false);
    setToast(true);
    onMark(child.id, days);
    setTimeout(() => setToast(false), 4000);
  }

  if (confirmed) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3
        flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar size={16} className="text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-amber-700 font-medium text-sm">
              {child.name} marked absent
            </p>
            <p className="text-slate-500 text-xs mt-0.5">
              {dateLabel} · Driver notified · False alerts suppressed
            </p>
          </div>
        </div>
        <button onClick={() => setConfirmed(false)}
          className="text-slate-400 hover:text-slate-600 transition-colors">
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-6 right-6 z-[9999] bg-green-50 border border-green-200
          rounded-xl px-4 py-3 text-green-700 text-sm flex items-center gap-2 shadow-lg">
          <CheckCircle size={16} />
          Absence recorded · Driver's boarding list updated
        </div>
      )}

      <button
        onClick={() => setOpen(p => !p)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-all',
          open
            ? 'bg-amber-50 border-amber-200 text-amber-700'
            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
        )}
      >
        <div className="flex items-center gap-2">
          <Calendar size={15} />
          Mark {child.name.split(' ')[0]} Absent
        </div>
        <ChevronRight size={14} className={cn('transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="mt-2 bg-white border border-amber-200 rounded-xl p-4 shadow-sm">
          <p className="text-slate-700 text-sm font-medium mb-1">
            Mark {child.name} absent for:
          </p>
          <p className="text-slate-400 text-xs mb-4">
            Today is {today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}.
            Driver's boarding list updates immediately.
          </p>

          {/* Day count */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => setDays(d => Math.max(1, d - 1))}
              className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200
                text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center text-lg"
            >−</button>
            <div className="flex-1 text-center">
              <p className="text-slate-800 font-bold text-xl">{days}</p>
              <p className="text-slate-500 text-xs">{dateLabel}</p>
            </div>
            <button
              onClick={() => setDays(d => Math.min(14, d + 1))}
              className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-200
                text-slate-600 hover:bg-slate-100 transition-colors flex items-center justify-center text-lg"
            >+</button>
          </div>

          {/* Warning if after bus departed */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4 text-xs text-blue-700">
            ℹ️ If the bus has already departed, the absence will be marked as
            {' '}<span className="font-medium">late notice</span> and logged accordingly.
          </div>

          <div className="flex gap-2">
            <button onClick={() => setOpen(false)}
              className="flex-1 py-2 bg-slate-50 border border-slate-200 rounded-xl
                text-slate-500 text-sm hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button onClick={handleConfirm}
              className="flex-1 py-2 bg-amber-50 border border-amber-200
                rounded-xl text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors">
              Confirm Absence
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline event ────────────────────────────────────────────────────────────
function TimelineEvent({ time, title, detail, type, isLatest }) {
  const cfg = {
    boarded:  { color: 'bg-green-500',  text: 'text-green-600'  },
    moving:   { color: 'bg-blue-500',   text: 'text-blue-600'   },
    stop:     { color: 'bg-purple-500', text: 'text-purple-600' },
    alert:    { color: 'bg-red-500',    text: 'text-red-600'    },
    pending:  { color: 'bg-slate-300',  text: 'text-slate-400'  },
    absent:   { color: 'bg-amber-500',  text: 'text-amber-600'  },
  };
  const c = cfg[type] || cfg.pending;
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={cn('w-3 h-3 rounded-full mt-0.5', c.color, isLatest && 'animate-pulse')} />
        <div className="w-px h-full bg-slate-200 mt-1" />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center justify-between mb-0.5">
          <p className={cn('text-sm font-medium', type === 'pending' ? 'text-slate-400' : 'text-slate-800')}>
            {title}
          </p>
          <span className={cn('text-xs', c.text)}>{time}</span>
        </div>
        <p className="text-slate-500 text-xs">{detail}</p>
        {isLatest && (
          <span className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600
            bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>
    </div>
  );
}

// ── ETA Card ──────────────────────────────────────────────────────────────────
function ETACard({ bus, eta, isAbsent }) {
  if (isAbsent) {
    return (
      <div className="rounded-2xl border bg-amber-50 border-amber-200 p-5 text-center">
        <Calendar size={32} className="text-amber-600 mx-auto mb-3" />
        <p className="text-amber-700 font-bold text-lg mb-1">Marked Absent</p>
        <p className="text-slate-500 text-sm">
          Driver has been notified. No pickup expected today.
        </p>
      </div>
    );
  }

  const urgent = eta <= 3;
  return (
    <div className={cn(
      'rounded-2xl border p-5 text-center transition-all',
      urgent ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
    )}>
      <p className="text-slate-500 text-xs mb-1">Bus arriving in</p>
      <p className={cn('text-5xl font-bold mb-1', urgent ? 'text-green-600' : 'text-blue-600')}>
        {eta}
      </p>
      <p className="text-slate-500 text-xs mb-4">minutes</p>
      {urgent && (
        <div className="bg-green-100 border border-green-200 rounded-lg px-3 py-2
          text-green-700 text-xs">
          🚨 Head to the stop now!
        </div>
      )}
      {bus && (
        <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-500 space-y-1">
          <p>Bus: <span className="text-slate-800">{bus.busId}</span></p>
          <p>Speed: <span className="text-slate-800">{bus.speed} km/h</span></p>
          <p>Driver: <span className="text-slate-800">{bus.driverName}</span></p>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SafeParent({ buses, fetchStudents }) {
  const [students,      setStudents]      = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [sosActive,     setSosActive]     = useState(false);
  const [eta,           setEta]           = useState(8);
  const [absentIds,     setAbsentIds]     = useState([]);

  useEffect(() => {
    fetchStudents().then(data => {
      setStudents(data);
      setSelectedChild(data[0] || null);
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setEta(p => p <= 1 ? 8 : p - 1), 8000);
    return () => clearInterval(t);
  }, []);

  function handleMarkAbsent(childId, days) {
    setAbsentIds(prev => [...prev, childId]);
    setStudents(prev => prev.map(s =>
      s.id === childId ? { ...s, status: 'absent' } : s
    ));
  }

  const childBus  = selectedChild ? buses.find(b => b.busId === selectedChild.busId) : null;
  const isAbsent  = selectedChild ? absentIds.includes(selectedChild.id) : false;

  const timeline = selectedChild ? [
    {
      time: '07:30', title: 'Bus departed depot',
      detail: `${selectedChild.busId} started route`,
      type: 'moving', isLatest: false,
    },
    isAbsent ? {
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      title: `${selectedChild.name} marked absent by parent`,
      detail: 'Driver notified · Boarding alert suppressed',
      type: 'absent', isLatest: true,
    } : {
      time: selectedChild.boardingTime || '—',
      title: selectedChild.status === 'boarded'
        ? `${selectedChild.name} boarded`
        : 'Waiting at stop',
      detail: selectedChild.status === 'boarded'
        ? `RFID card scanned at ${selectedChild.stop}`
        : `Expected pickup at ${selectedChild.stop}`,
      type: selectedChild.status === 'boarded' ? 'boarded' : 'pending',
      isLatest: selectedChild.status === 'boarded',
    },
    {
      time: '—', title: 'Arriving at school',
      detail: 'Estimated 08:25 AM',
      type: 'pending', isLatest: false,
    },
  ] : [];

  return (
    <div className="flex flex-col gap-5">
      {sosActive && (
        <div className="bg-red-500 border border-red-400 rounded-xl px-5 py-4
          flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-white" />
            <div>
              <p className="text-white font-bold">SOS Alert Sent</p>
              <p className="text-red-100 text-xs">School admin and driver have been notified</p>
            </div>
          </div>
          <button onClick={() => setSosActive(false)}
            className="text-red-100 text-xs border border-red-300/40 px-3 py-1.5 rounded-lg">
            Cancel
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left */}
        <div className="lg:col-span-2 flex flex-col gap-4">

          {/* Child selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">
              Select Child
            </p>
            <div className="flex gap-2 flex-wrap">
              {students.slice(0, 5).map(s => (
                <button key={s.id} onClick={() => setSelectedChild(s)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all',
                    selectedChild?.id === s.id
                      ? 'bg-blue-50 border-blue-200 text-blue-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  )}>
                  <User size={14} />
                  {s.name.split(' ')[0]}
                  <div className={cn('w-2 h-2 rounded-full',
                    absentIds.includes(s.id) ? 'bg-amber-500' :
                    s.status === 'boarded'   ? 'bg-green-500' :
                    s.status === 'absent'    ? 'bg-red-500'   : 'bg-amber-400'
                  )} />
                </button>
              ))}
            </div>
          </div>

          {/* Absence marker */}
          {selectedChild && (
            <AbsenceMarker child={selectedChild} onMark={handleMarkAbsent} />
          )}

          {/* Map */}
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: '340px' }}>
            <MapContainer center={[18.5204, 73.8567]} zoom={12}
              style={{ width: '100%', height: '100%', background: '#f1f5f9' }}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; CARTO'
              />
              {buses.slice(0, 3).map(bus => {
                if (!bus.lat || !bus.lng) return null;
                return (
                  <Marker key={bus.busId} position={[bus.lat, bus.lng]}
                    icon={createBusIcon(bus.speed)}
                    opacity={bus.busId === selectedChild?.busId ? 1 : 0.4}>
                    <Popup>
                      <div style={{ background: 'white', color: '#1e293b', padding: '4px' }}>
                        <p style={{ fontWeight: 700 }}>{bus.busId}</p>
                        <p style={{ color: '#64748b', fontSize: '12px' }}>{bus.routeName}</p>
                        <p style={{ fontSize: '12px', marginTop: '6px' }}>Speed: {bus.speed} km/h</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>

          {/* Status card */}
          {selectedChild && (
            <div className={cn(
              'rounded-xl border p-4',
              isAbsent
                ? 'bg-amber-50 border-amber-200'
                : selectedChild.status === 'boarded'
                ? 'bg-green-50 border-green-200'
                : selectedChild.status === 'absent'
                ? 'bg-red-50 border-red-200'
                : 'bg-yellow-50 border-yellow-200'
            )}>
              <div className="flex items-center gap-3">
                {isAbsent
                  ? <Calendar size={20} className="text-amber-600" />
                  : selectedChild.status === 'boarded'
                  ? <CheckCircle size={20} className="text-green-600" />
                  : selectedChild.status === 'absent'
                  ? <AlertTriangle size={20} className="text-red-500" />
                  : <Clock size={20} className="text-amber-600" />
                }
                <div>
                  <p className={cn('font-semibold text-sm',
                    isAbsent ? 'text-amber-700' :
                    selectedChild.status === 'boarded' ? 'text-green-700' :
                    selectedChild.status === 'absent'  ? 'text-red-700'   : 'text-amber-700'
                  )}>
                    {isAbsent
                      ? `${selectedChild.name} is marked absent today`
                      : selectedChild.status === 'boarded'
                      ? `${selectedChild.name} is safely on the bus`
                      : selectedChild.status === 'absent'
                      ? `${selectedChild.name} is marked absent`
                      : `Waiting for ${selectedChild.name} to board`
                    }
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {isAbsent
                      ? 'Driver notified · No pickup scheduled · False alerts suppressed'
                      : selectedChild.status === 'boarded'
                      ? `Boarded at ${selectedChild.boardingTime} · ${selectedChild.stop}`
                      : `Expected at ${selectedChild.stop}`
                    }
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right */}
        <div className="flex flex-col gap-4">
          <ETACard bus={childBus} eta={eta} isAbsent={isAbsent} />

          {/* Timeline */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-4">
              Trip Timeline
            </p>
            <div className="space-y-0">
              {timeline.map((event, i) => (
                <TimelineEvent key={i} {...event} />
              ))}
            </div>
          </div>

          {/* Trip history */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-3">
              Recent Trip History
            </p>
            <div className="space-y-2">
              {[
                { date: 'Today',     status: isAbsent ? 'absent' : 'boarded', time: isAbsent ? '—' : '07:42' },
                { date: 'Yesterday', status: 'boarded', time: '07:39' },
                { date: 'Mon 21',    status: 'boarded', time: '07:45' },
                { date: 'Fri 18',    status: 'absent',  time: '—'     },
                { date: 'Thu 17',    status: 'boarded', time: '07:41' },
              ].map((h, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{h.date}</span>
                  <span className="text-slate-400">{h.time}</span>
                  <span className={cn(
                    'px-2 py-0.5 rounded-full border text-xs',
                    h.status === 'boarded'
                      ? 'bg-green-50 border-green-200 text-green-600'
                      : h.status === 'absent' && i === 0 && isAbsent
                      ? 'bg-amber-50 border-amber-200 text-amber-600'
                      : 'bg-red-50 border-red-200 text-red-600'
                  )}>
                    {h.status === 'boarded' ? 'Boarded' :
                     h.status === 'absent' && i === 0 && isAbsent ? 'Marked Absent' : 'Absent'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button onClick={() => setSosActive(true)}
              className={cn(
                'w-full py-3 rounded-xl font-bold text-sm border transition-all flex items-center justify-center gap-2',
                sosActive
                  ? 'bg-red-500 border-red-400 text-white'
                  : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
              )}>
              <AlertTriangle size={16} />
              {sosActive ? 'SOS Sent — Help Coming' : 'SOS Emergency Alert'}
            </button>
            <button className="w-full py-2.5 bg-slate-50 border border-slate-200 rounded-xl
              text-slate-600 text-sm hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
              <Phone size={14} /> Call Driver
            </button>
            <button className="w-full py-2.5 bg-slate-50 border border-slate-200 rounded-xl
              text-slate-600 text-sm hover:bg-slate-100 transition-colors flex items-center justify-center gap-2">
              <Bell size={14} /> Contact School
            </button>
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
