import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, AlertTriangle, Wrench, Bus,
  Loader2, RefreshCw, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const DEFECT_TYPES = [
  'Engine / Mechanical',
  'Tyre / Wheel',
  'Brakes',
  'Electrical / Battery',
  'Lights / Signals',
  'AC / HVAC',
  'Body Damage',
  'Doors / Windows',
  'CNG Leak',
  'Seat Damage',
];

// ── Defect modal ───────────────────────────────────────────────────────────────
function DefectModal({ bus, defect, onSave, onClose }) {
  const [selected, setSelected] = useState(defect?.defect_types ?? []);
  const [notes,    setNotes]    = useState(defect?.notes ?? '');
  const [saving,   setSaving]   = useState(false);

  function toggle(type) {
    setSelected(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }

  async function handleSave() {
    setSaving(true);
    await onSave(bus.id, selected, notes);
    setSaving(false);
    onClose();
  }

  const canSave = selected.length > 0 || notes.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">

        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-slate-800 font-bold text-lg">{bus.bus_number}</h3>
            <p className="text-slate-400 text-sm">{bus.fuel_type} · {bus.seats} seats</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <p className="text-slate-600 text-sm font-medium mb-3">Defects reported (select all that apply):</p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {DEFECT_TYPES.map(type => (
            <label
              key={type}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition-all select-none',
                selected.includes(type)
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(type)}
                onChange={() => toggle(type)}
                className="accent-red-500 flex-shrink-0"
              />
              {type}
            </label>
          ))}
        </div>

        <div className="mb-5">
          <label className="block text-slate-600 text-sm font-medium mb-1.5">
            Additional notes / other defect
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Describe the issue or mention a defect not listed above…"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800
              focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-slate-500 text-sm hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white text-sm font-medium
              transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
            Flag Bus
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bus card ───────────────────────────────────────────────────────────────────
function BusCard({ bus, defect, onFlag, onResolve }) {
  const hasDefect = !!defect;

  return (
    <div className={cn(
      'bg-white border rounded-2xl p-5 shadow-sm transition-all',
      hasDefect ? 'border-red-300' : 'border-green-200'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            hasDefect ? 'bg-red-100' : 'bg-green-100'
          )}>
            {hasDefect
              ? <AlertTriangle size={18} className="text-red-600" />
              : <CheckCircle   size={18} className="text-green-600" />
            }
          </div>
          <div>
            <p className="text-slate-800 font-semibold text-sm">{bus.bus_number}</p>
            <p className="text-slate-400 text-xs">{bus.fuel_type} · {bus.seats} seats</p>
          </div>
        </div>
        <span className={cn(
          'px-2 py-1 rounded-full text-xs font-medium border',
          hasDefect
            ? 'bg-red-50 border-red-200 text-red-600'
            : 'bg-green-50 border-green-200 text-green-600'
        )}>
          {hasDefect ? 'Flagged' : 'All Clear'}
        </span>
      </div>

      {hasDefect && (
        <div className="mb-3">
          {defect.defect_types?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {defect.defect_types.map(t => (
                <span key={t} className="px-2 py-0.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-full">
                  {t}
                </span>
              ))}
            </div>
          )}
          {defect.notes && (
            <p className="text-slate-500 text-xs italic line-clamp-2">"{defect.notes}"</p>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        {hasDefect ? (
          <>
            <button
              onClick={() => onFlag(bus)}
              className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-500 text-xs
                hover:bg-slate-50 transition-colors"
            >
              Edit Defect
            </button>
            <button
              onClick={() => onResolve(bus.id)}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white
                text-xs font-medium transition-colors"
            >
              ✓ Mark Resolved
            </button>
          </>
        ) : (
          <button
            onClick={() => onFlag(bus)}
            className="w-full py-2 border border-red-200 text-red-600 hover:bg-red-50
              rounded-lg text-xs font-medium transition-colors"
          >
            Report Defect
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function DefectReports() {
  const { user } = useAuth();
  const [buses,   setBuses]   = useState([]);
  const [defects, setDefects] = useState({}); // busId → active defect row
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // bus being edited

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: busData }, { data: defectData }] = await Promise.all([
      supabase
        .from('fleet_buses')
        .select('*')
        .eq('operator_id', user.id)
        .eq('is_active', true)
        .order('created_at'),
      supabase
        .from('fleet_defects')
        .select('*')
        .eq('operator_id', user.id)
        .eq('status', 'active'),
    ]);

    setBuses(busData ?? []);
    const map = {};
    (defectData ?? []).forEach(d => { map[d.bus_id] = d; });
    setDefects(map);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleFlag(busId, defectTypes, notes) {
    const existing = defects[busId];
    if (existing) {
      await supabase
        .from('fleet_defects')
        .update({ defect_types: defectTypes, notes })
        .eq('id', existing.id);
    } else {
      await supabase.from('fleet_defects').insert({
        operator_id:  user.id,
        bus_id:       busId,
        defect_types: defectTypes,
        notes,
        status:       'active',
      });
    }
    await load();
  }

  async function handleResolve(busId) {
    const existing = defects[busId];
    if (!existing) return;
    await supabase
      .from('fleet_defects')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', existing.id);
    await load();
  }

  const flagged  = buses.filter(b => defects[b.id]);
  const allClear = buses.filter(b => !defects[b.id]);

  return (
    <div className="flex flex-col gap-5 max-w-4xl">

      <div>
        <h1 className="text-slate-800 font-bold text-xl">Bus Health</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Flag buses with reported defects. Buses stay flagged until you manually mark them resolved.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle size={14} className="text-green-600" />
          <span className="text-green-700 text-sm font-medium">{allClear.length} All Clear</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl">
          <AlertTriangle size={14} className="text-red-600" />
          <span className="text-red-700 text-sm font-medium">{flagged.length} Flagged</span>
        </div>
        <button
          onClick={load}
          className="ml-auto text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading bus health…
        </div>
      ) : buses.length === 0 ? (
        <div className="text-center py-20 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
          <Bus size={32} className="mx-auto mb-3 opacity-30" />
          No buses registered. Add buses in Fleet Setup first.
        </div>
      ) : (
        <>
          {flagged.length > 0 && (
            <div>
              <p className="text-red-600 text-xs font-semibold uppercase tracking-wide mb-3">
                Flagged — {flagged.length} bus{flagged.length !== 1 ? 'es' : ''}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {flagged.map(bus => (
                  <BusCard
                    key={bus.id}
                    bus={bus}
                    defect={defects[bus.id]}
                    onFlag={b => setModal(b)}
                    onResolve={handleResolve}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-3">
              All Clear — {allClear.length} bus{allClear.length !== 1 ? 'es' : ''}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allClear.map(bus => (
                <BusCard
                  key={bus.id}
                  bus={bus}
                  defect={defects[bus.id]}
                  onFlag={b => setModal(b)}
                  onResolve={handleResolve}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {modal && (
        <DefectModal
          bus={modal}
          defect={defects[modal.id]}
          onSave={handleFlag}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
