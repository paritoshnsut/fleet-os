import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle, AlertTriangle, Bus,
  Loader2, RefreshCw, X, ShieldAlert, ShieldOff, Flag,
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

// These types auto-elevate severity to critical
const CRITICAL_TYPES = new Set(['Engine / Mechanical', 'Brakes', 'CNG Leak']);

/* ── Defect modal ─────────────────────────────────────────────────────────── */
function DefectModal({ bus, defect, onSave, onClose }) {
  const [selected,   setSelected]   = useState(defect?.defect_types ?? []);
  const [notes,      setNotes]      = useState(defect?.notes ?? '');
  const [severity,   setSeverity]   = useState(defect?.severity ?? 'minor');
  const [isGrounded, setIsGrounded] = useState(defect?.is_grounded ?? false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');

  // Auto-suggest critical when a critical defect type is chosen
  useEffect(() => {
    if (selected.some(t => CRITICAL_TYPES.has(t))) setSeverity('critical');
  }, [selected]);

  function toggle(type) {
    setSelected(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const err = await onSave(bus.id, selected, notes, severity, isGrounded);
    setSaving(false);
    if (err) { setError(err); return; }
    onClose();
  }

  const canSave = selected.length > 0 || notes.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-slate-800 font-bold text-lg">{bus.bus_number}</h3>
            <p className="text-slate-400 text-sm">{bus.fuel_type} · {bus.seats} seats</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Severity */}
        <p className="text-slate-600 text-sm font-medium mb-2">Severity</p>
        <div className="flex gap-2 mb-4">
          {[
            { id: 'minor',    label: 'Minor',    desc: 'Bus can still operate',  active: 'border-amber-300 bg-amber-50 text-amber-700' },
            { id: 'critical', label: 'Critical', desc: 'Do not deploy this bus', active: 'border-red-300 bg-red-50 text-red-700'       },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => setSeverity(opt.id)}
              className={cn(
                'flex-1 py-2.5 px-3 rounded-xl border text-left transition-all',
                severity === opt.id ? opt.active : 'border-slate-200 text-slate-400 hover:border-slate-300'
              )}
            >
              <p className="text-xs font-semibold">{opt.label}</p>
              <p className="text-[10px] mt-0.5 opacity-80">{opt.desc}</p>
            </button>
          ))}
        </div>

        {/* Defect type checkboxes */}
        <p className="text-slate-600 text-sm font-medium mb-3">Defects (select all that apply)</p>
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
              {CRITICAL_TYPES.has(type) && (
                <span className="ml-auto text-[9px] text-red-400 font-medium">critical</span>
              )}
            </label>
          ))}
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="block text-slate-600 text-sm font-medium mb-1.5">
            Additional notes / other defect
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Describe the issue or mention a defect not listed above…"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800
              focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 resize-none"
          />
        </div>

        {/* Ground bus toggle */}
        <div
          onClick={() => setIsGrounded(v => !v)}
          className={cn(
            'flex items-start gap-3 p-3 rounded-xl border mb-5 cursor-pointer transition-all',
            isGrounded
              ? 'bg-red-50 border-red-300'
              : 'bg-slate-50 border-slate-200 hover:border-slate-300'
          )}
        >
          <input
            type="checkbox"
            checked={isGrounded}
            onChange={() => setIsGrounded(v => !v)}
            className="accent-red-600 mt-0.5 flex-shrink-0"
            onClick={e => e.stopPropagation()}
          />
          <div>
            <p className={cn('text-sm font-semibold', isGrounded ? 'text-red-700' : 'text-slate-600')}>
              Ground bus — stop movement immediately
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Marks bus as non-operational across the portal. Bus will be removed from active duty until you lift the grounding.
            </p>
          </div>
        </div>

        {error && (
          <p className="text-red-600 text-xs mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

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
            className={cn(
              'flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2',
              isGrounded ? 'bg-red-700 hover:bg-red-800' : 'bg-red-600 hover:bg-red-700'
            )}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Flag size={14} />}
            {isGrounded ? 'Flag & Ground Bus' : 'Flag Bus'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Bus card ─────────────────────────────────────────────────────────────── */
function BusCard({ bus, defect, onFlag, onResolve, onLiftGrounding }) {
  const hasDefect  = !!defect;
  const isGrounded = !!bus.is_grounded;
  const isCritical = defect?.severity === 'critical';

  return (
    <div className={cn(
      'bg-white border rounded-2xl p-5 shadow-sm transition-all',
      isGrounded  ? 'border-red-400'   :
      hasDefect   ? 'border-orange-300':
                    'border-green-200'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            isGrounded ? 'bg-red-100' : hasDefect ? 'bg-orange-100' : 'bg-green-100'
          )}>
            {isGrounded
              ? <ShieldAlert size={18} className="text-red-600" />
              : hasDefect
              ? <AlertTriangle size={18} className="text-orange-500" />
              : <CheckCircle size={18} className="text-green-600" />
            }
          </div>
          <div>
            <p className="text-slate-800 font-semibold text-sm">{bus.bus_number}</p>
            <p className="text-slate-400 text-xs">{bus.fuel_type} · {bus.seats} seats</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {isGrounded && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white tracking-wide">
              GROUNDED
            </span>
          )}
          <span className={cn(
            'px-2 py-1 rounded-full text-xs font-medium border',
            isGrounded  ? 'bg-red-50 border-red-200 text-red-600'       :
            isCritical  ? 'bg-red-50 border-red-200 text-red-600'       :
            hasDefect   ? 'bg-orange-50 border-orange-200 text-orange-600':
                          'bg-green-50 border-green-200 text-green-600'
          )}>
            {isGrounded  ? 'Grounded'          :
             isCritical  ? '⚠ Critical Defect' :
             hasDefect   ? 'Flagged'            :
                           'All Clear'}
          </span>
        </div>
      </div>

      {/* Grounded banner */}
      {isGrounded && (
        <div className="flex items-center gap-2 bg-red-100 border border-red-200 rounded-lg px-3 py-2 mb-3 text-xs text-red-700">
          <ShieldAlert size={12} className="flex-shrink-0" />
          Bus grounded — not cleared for duty. Lift grounding to restore operations.
        </div>
      )}

      {/* Defect details */}
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
          <p className="text-slate-400 text-[10px] mt-1">
            Reported {new Date(defect.reported_at ?? Date.now()).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-2 flex-wrap">
        {hasDefect ? (
          <>
            <button
              onClick={() => onFlag(bus)}
              className="flex-1 min-w-[80px] py-2 border border-slate-200 rounded-lg text-slate-500 text-xs hover:bg-slate-50 transition-colors"
            >
              Edit Defect
            </button>
            {isGrounded && (
              <button
                onClick={() => onLiftGrounding(bus.id)}
                className="flex-1 min-w-[80px] py-2 bg-amber-500 hover:bg-amber-600 rounded-lg text-white text-xs font-medium transition-colors flex items-center justify-center gap-1"
              >
                <ShieldOff size={11} /> Lift Grounding
              </button>
            )}
            <button
              onClick={() => onResolve(bus.id)}
              className="flex-1 min-w-[80px] py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-xs font-medium transition-colors"
            >
              ✓ Mark Resolved
            </button>
          </>
        ) : (
          <button
            onClick={() => onFlag(bus)}
            className="w-full py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition-colors"
          >
            Report Defect
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function DefectReports() {
  const { user } = useAuth();
  const [buses,   setBuses]   = useState([]);
  const [defects, setDefects] = useState({}); // busId → active defect row
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null);
  const [toast,   setToast]   = useState('');

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [{ data: busData, error: busErr }, { data: defectData, error: defErr }] = await Promise.all([
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

    if (busErr)  console.error('buses fetch error', busErr);
    if (defErr)  console.error('defects fetch error', defErr);

    setBuses(busData ?? []);
    const map = {};
    (defectData ?? []).forEach(d => { map[d.bus_id] = d; });
    setDefects(map);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleFlag(busId, defectTypes, notes, severity, isGrounded) {
    const existing = defects[busId];
    let dbErr;

    if (existing) {
      const { error } = await supabase
        .from('fleet_defects')
        .update({ defect_types: defectTypes, notes, severity, is_grounded: isGrounded })
        .eq('id', existing.id);
      dbErr = error;
    } else {
      const { error } = await supabase.from('fleet_defects').insert({
        operator_id:  user.id,
        bus_id:       busId,
        defect_types: defectTypes,
        notes,
        severity,
        is_grounded:  isGrounded,
        status:       'active',
      });
      dbErr = error;
    }

    if (dbErr) {
      console.error('defect save error', dbErr);
      return `Failed to save: ${dbErr.message}`;
    }

    // Update bus grounding state
    await supabase
      .from('fleet_buses')
      .update({ is_grounded: isGrounded, grounded_reason: isGrounded ? 'Defect reported' : null })
      .eq('id', busId);

    showToast(isGrounded ? 'Bus flagged and grounded.' : 'Bus flagged.');
    await load();
    return null;
  }

  async function handleResolve(busId) {
    const existing = defects[busId];
    if (!existing) return;

    await Promise.all([
      supabase
        .from('fleet_defects')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', existing.id),
      // Always lift grounding when defect is resolved
      supabase
        .from('fleet_buses')
        .update({ is_grounded: false, grounded_reason: null })
        .eq('id', busId),
    ]);

    showToast('Defect resolved. Bus is back in service.');
    await load();
  }

  async function handleLiftGrounding(busId) {
    await supabase
      .from('fleet_buses')
      .update({ is_grounded: false, grounded_reason: null })
      .eq('id', busId);

    // Also update the active defect record
    const existing = defects[busId];
    if (existing) {
      await supabase
        .from('fleet_defects')
        .update({ is_grounded: false })
        .eq('id', existing.id);
    }

    showToast('Grounding lifted. Bus cleared for duty (defect still logged).');
    await load();
  }

  const grounded  = buses.filter(b => b.is_grounded);
  const flagged   = buses.filter(b => !b.is_grounded && defects[b.id]);
  const allClear  = buses.filter(b => !b.is_grounded && !defects[b.id]);

  return (
    <div className="flex flex-col gap-5 max-w-4xl">

      <div>
        <h1 className="text-slate-800 font-bold text-xl">Bus Health</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Flag buses with defects. Grounded buses are removed from active duty until cleared.
        </p>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 flex-wrap">
        {grounded.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-100 border border-red-300 rounded-xl">
            <ShieldAlert size={14} className="text-red-600" />
            <span className="text-red-700 text-sm font-semibold">{grounded.length} Grounded</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-xl">
          <AlertTriangle size={14} className="text-orange-500" />
          <span className="text-orange-700 text-sm font-medium">{flagged.length} Flagged</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle size={14} className="text-green-600" />
          <span className="text-green-700 text-sm font-medium">{allClear.length} All Clear</span>
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
          {/* Grounded buses */}
          {grounded.length > 0 && (
            <div>
              <p className="text-red-600 text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <ShieldAlert size={12} /> Grounded — {grounded.length} bus{grounded.length !== 1 ? 'es' : ''}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {grounded.map(bus => (
                  <BusCard
                    key={bus.id}
                    bus={bus}
                    defect={defects[bus.id]}
                    onFlag={b => setModal(b)}
                    onResolve={handleResolve}
                    onLiftGrounding={handleLiftGrounding}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Flagged (not grounded) */}
          {flagged.length > 0 && (
            <div>
              <p className="text-orange-600 text-xs font-semibold uppercase tracking-wide mb-3">
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
                    onLiftGrounding={handleLiftGrounding}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All Clear */}
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
                  onLiftGrounding={handleLiftGrounding}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Defect modal */}
      {modal && (
        <DefectModal
          bus={modal}
          defect={defects[modal.id]}
          onSave={handleFlag}
          onClose={() => setModal(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-slate-800 text-white text-sm px-5 py-3 rounded-xl shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
