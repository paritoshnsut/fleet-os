import { useState, useEffect, useCallback } from 'react';
import {
  Bus, Users, Settings, Plus, Trash2, Pencil, CheckCircle,
  Zap, Fuel, Save, X, Loader2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const CONTRACT_LABELS = { gcc: 'GCC', private: 'Private', both: 'GCC + Private' };
const TABS = [
  { id: 'buses',   label: 'Buses',    icon: Bus      },
  { id: 'drivers', label: 'Drivers',  icon: Users    },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// ── Reusable field ─────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800',
        'focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300',
        props.className
      )}
    />
  );
}

function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className={cn(
        'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-800 bg-white',
        'focus:outline-none focus:ring-2 focus:ring-blue-300',
        props.className
      )}
    >
      {children}
    </select>
  );
}

// ── Bus tab ────────────────────────────────────────────────────────────────────
function BusesTab({ operatorId, onCountChange }) {
  const [buses,   setBuses]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [editId,  setEditId]  = useState(null);

  const blank = { bus_number: '', license_plate: '', seats: 36, fuel_type: 'Electric', battery_type: '3 Batt' };
  const [form, setForm] = useState(blank);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('fleet_buses')
      .select('*')
      .eq('operator_id', operatorId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (err) setError(err.message);
    else { setBuses(data ?? []); onCountChange(data?.length ?? 0); }
    setLoading(false);
  }, [operatorId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.bus_number.trim()) { setError('Bus number is required'); return; }
    setSaving(true);
    setError('');

    if (editId) {
      const { error: err } = await supabase
        .from('fleet_buses')
        .update({ ...form, seats: Number(form.seats) })
        .eq('id', editId);
      if (err) setError(err.message);
    } else {
      const { error: err } = await supabase
        .from('fleet_buses')
        .insert({ ...form, seats: Number(form.seats), operator_id: operatorId });
      if (err) setError(err.message);
    }

    setSaving(false);
    if (!error) { setShowAdd(false); setEditId(null); setForm(blank); await load(); }
  }

  async function handleDelete(id) {
    await supabase.from('fleet_buses').update({ is_active: false }).eq('id', id);
    await load();
  }

  function startEdit(bus) {
    setForm({
      bus_number:    bus.bus_number,
      license_plate: bus.license_plate ?? '',
      seats:         bus.seats,
      fuel_type:     bus.fuel_type,
      battery_type:  bus.battery_type ?? '3 Batt',
    });
    setEditId(bus.id);
    setShowAdd(true);
  }

  function cancelForm() {
    setShowAdd(false);
    setEditId(null);
    setForm(blank);
    setError('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-500 text-sm">{buses.length} bus{buses.length !== 1 ? 'es' : ''} registered</p>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100">
            <RefreshCw size={14} />
          </button>
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700
                text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={13} /> Add bus
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2.5 mb-3 flex items-center gap-2">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {showAdd && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
          <p className="text-slate-700 font-medium text-sm mb-3">
            {editId ? 'Edit bus' : 'New bus'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <Field label="Bus number *">
              <Input value={form.bus_number} onChange={e => setForm(p => ({ ...p, bus_number: e.target.value }))} placeholder="MH12-AB-1234" />
            </Field>
            <Field label="License plate">
              <Input value={form.license_plate} onChange={e => setForm(p => ({ ...p, license_plate: e.target.value }))} placeholder="MH12AB1234" />
            </Field>
            <Field label="Seats">
              <Select value={form.seats} onChange={e => setForm(p => ({ ...p, seats: e.target.value }))}>
                <option value={22}>22 seats</option>
                <option value={36}>36 seats</option>
              </Select>
            </Field>
            <Field label="Fuel type">
              <Select
                value={form.fuel_type}
                onChange={e => setForm(p => ({
                  ...p,
                  fuel_type: e.target.value,
                  battery_type: e.target.value === 'CNG' ? null : '3 Batt',
                }))}
              >
                <option value="Electric">Electric</option>
                <option value="CNG">CNG</option>
              </Select>
            </Field>
            {form.fuel_type === 'Electric' && (
              <Field label="Battery pack">
                <Select value={form.battery_type ?? '3 Batt'} onChange={e => setForm(p => ({ ...p, battery_type: e.target.value }))}>
                  <option value="3 Batt">3 Batt (162 km)</option>
                  <option value="4 Batt">4 Batt (210 km)</option>
                </Select>
              </Field>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700
                text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {editId ? 'Save changes' : 'Add bus'}
            </button>
            <button
              onClick={cancelForm}
              className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-500
                hover:text-slate-700 rounded-lg text-sm transition-colors"
            >
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : buses.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
          No buses registered yet. Click <strong>Add bus</strong> to get started.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs text-slate-400 uppercase tracking-wide">
                {['Bus no.', 'License', 'Seats', 'Type', 'Battery', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {buses.map(bus => (
                <tr key={bus.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-700 font-medium">{bus.bus_number}</td>
                  <td className="px-4 py-3 text-slate-500">{bus.license_plate || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{bus.seats}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-xs border',
                      bus.fuel_type === 'Electric'
                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                        : 'bg-orange-50 border-orange-200 text-orange-600'
                    )}>
                      {bus.fuel_type === 'Electric' ? <Zap size={10} /> : <Fuel size={10} />}
                      {bus.fuel_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{bus.battery_type || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(bus)}
                        className="text-slate-300 hover:text-blue-500 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(bus.id)}
                        className="text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Driver tab ─────────────────────────────────────────────────────────────────
function DriversTab({ operatorId, onCountChange }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [editId,  setEditId]  = useState(null);

  const blank = { name: '', phone: '', license_number: '', experience_yrs: 0 };
  const [form, setForm] = useState(blank);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('fleet_drivers')
      .select('*')
      .eq('operator_id', operatorId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (err) setError(err.message);
    else { setDrivers(data ?? []); onCountChange(data?.length ?? 0); }
    setLoading(false);
  }, [operatorId, onCountChange]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');

    if (editId) {
      const { error: err } = await supabase
        .from('fleet_drivers')
        .update({ ...form, experience_yrs: Number(form.experience_yrs) })
        .eq('id', editId);
      if (err) setError(err.message);
    } else {
      const { error: err } = await supabase
        .from('fleet_drivers')
        .insert({ ...form, experience_yrs: Number(form.experience_yrs), operator_id: operatorId });
      if (err) setError(err.message);
    }

    setSaving(false);
    if (!error) { setShowAdd(false); setEditId(null); setForm(blank); await load(); }
  }

  async function handleDelete(id) {
    await supabase.from('fleet_drivers').update({ is_active: false }).eq('id', id);
    await load();
  }

  function startEdit(d) {
    setForm({ name: d.name, phone: d.phone ?? '', license_number: d.license_number ?? '', experience_yrs: d.experience_yrs });
    setEditId(d.id);
    setShowAdd(true);
  }

  function cancelForm() { setShowAdd(false); setEditId(null); setForm(blank); setError(''); }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-slate-500 text-sm">{drivers.length} driver{drivers.length !== 1 ? 's' : ''} registered</p>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100">
            <RefreshCw size={14} />
          </button>
          {!showAdd && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700
                text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={13} /> Add driver
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2.5 mb-3 flex items-center gap-2">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {showAdd && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4">
          <p className="text-slate-700 font-medium text-sm mb-3">{editId ? 'Edit driver' : 'New driver'}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Field label="Full name *">
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ravi Sharma" />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+91 98765 43210" />
            </Field>
            <Field label="License no.">
              <Input value={form.license_number} onChange={e => setForm(p => ({ ...p, license_number: e.target.value }))} placeholder="MH1234567890" />
            </Field>
            <Field label="Experience (yrs)">
              <Input type="number" min={0} max={40} value={form.experience_yrs} onChange={e => setForm(p => ({ ...p, experience_yrs: e.target.value }))} />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700
                text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {editId ? 'Save changes' : 'Add driver'}
            </button>
            <button onClick={cancelForm} className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-lg text-sm transition-colors">
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 size={20} className="animate-spin mr-2" /> Loading…
        </div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
          No drivers registered yet. Click <strong>Add driver</strong> to get started.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs text-slate-400 uppercase tracking-wide">
                {['Name', 'Phone', 'License', 'Experience', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drivers.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-700 font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-slate-500">{d.phone || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{d.license_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{d.experience_yrs} yr{d.experience_yrs !== 1 ? 's' : ''}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => startEdit(d)} className="text-slate-300 hover:text-blue-500 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleDelete(d.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Settings tab ───────────────────────────────────────────────────────────────
function SettingsTab() {
  const { profile, refreshProfile, user } = useAuth();
  const [companyName,  setCompanyName]  = useState(profile?.company_name  ?? '');
  const [depotCity,    setDepotCity]    = useState(profile?.depot_city    ?? '');
  const [contractType, setContractType] = useState(profile?.contract_type ?? 'gcc');
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);
    const { error: err } = await supabase
      .from('profiles')
      .update({ company_name: companyName, depot_city: depotCity, contract_type: contractType })
      .eq('id', user.id);
    if (err) setError(err.message);
    else { await refreshProfile(); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    setSaving(false);
  }

  return (
    <div className="max-w-md space-y-4">
      <Field label="Company / operator name">
        <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Tata Motors Transport Services" />
      </Field>
      <Field label="Depot city">
        <Input value={depotCity} onChange={e => setDepotCity(e.target.value)} placeholder="Pune" />
      </Field>
      <Field label="Contract type">
        <Select value={contractType} onChange={e => setContractType(e.target.value)}>
          <option value="gcc">GCC — Government contract</option>
          <option value="private">Private — Corporate shuttle</option>
          <option value="both">Both</option>
        </Select>
      </Field>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2.5 flex items-center gap-2">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700
          text-white font-medium text-sm rounded-xl transition-colors disabled:opacity-60"
      >
        {saving
          ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
          : saved
            ? <><CheckCircle size={14} /> Saved!</>
            : <><Save size={14} /> Save settings</>
        }
      </button>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function FleetSetup() {
  const { profile, user } = useAuth();
  const [tab,         setTab]         = useState('buses');
  const [busCount,    setBusCount]    = useState(0);
  const [driverCount, setDriverCount] = useState(0);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-5 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-slate-800 font-bold text-xl">Fleet Setup</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Manage your registered buses, drivers, and fleet configuration.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Buses registered',   value: busCount,    color: 'blue',   icon: Bus     },
          { label: 'Drivers registered', value: driverCount, color: 'purple', icon: Users   },
          { label: 'Contract type',      value: CONTRACT_LABELS[profile?.contract_type ?? 'gcc'] ?? '—', color: 'green', icon: Settings },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className={`w-8 h-8 rounded-lg bg-${color}-100 flex items-center justify-center mb-2`}>
              <Icon size={15} className={`text-${color}-600`} />
            </div>
            <p className="text-slate-800 font-bold text-xl">{value}</p>
            <p className="text-slate-500 text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tab panel */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-all',
                  tab === t.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                )}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {tab === 'buses'   && <BusesTab   operatorId={user.id} onCountChange={setBusCount}    />}
          {tab === 'drivers' && <DriversTab operatorId={user.id} onCountChange={setDriverCount} />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </div>
    </div>
  );
}
