import { useState } from 'react';
import {
  Bus, Users, Building2, CheckCircle, ChevronRight,
  Plus, Trash2, Zap, Fuel, ArrowRight, Loader2, AlertTriangle,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

const WIZARD_STEPS = [
  { id: 1, label: 'Fleet basics', icon: Building2  },
  { id: 2, label: 'Add buses',    icon: Bus        },
  { id: 3, label: 'Add drivers',  icon: Users      },
  { id: 4, label: 'Done',         icon: CheckCircle },
];

const CONTRACT_TYPES = [
  { id: 'gcc',     label: 'GCC',           desc: 'Government contract · ₹56.5/km rate'   },
  { id: 'private', label: 'Private',        desc: 'Corporate shuttle / own agreement'     },
  { id: 'both',    label: 'GCC + Private',  desc: 'Mix of government and private routes'  },
];

function WizardStepBar({ current }) {
  return (
    <div className="flex items-center justify-center gap-1.5 mb-8">
      {WIZARD_STEPS.map((s, i) => {
        const done   = current > s.id;
        const active = current === s.id;
        const Icon   = s.icon;
        return (
          <div key={s.id} className="flex items-center gap-1.5">
            <div className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
              done   ? 'bg-green-500 border-green-500 text-white'               :
              active ? 'bg-blue-600 border-blue-600 text-white shadow-sm'       :
                       'bg-white border-slate-200 text-slate-400'
            )}>
              {done ? <CheckCircle size={11} /> : <Icon size={11} />}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BusRowForm({ onAdd }) {
  const blank = { bus_number: '', license_plate: '', seats: 36, fuel_type: 'Electric', battery_type: '3 Batt' };
  const [form, setForm] = useState(blank);
  const [err,  setErr]  = useState('');

  function submit(e) {
    e.preventDefault();
    if (!form.bus_number.trim()) { setErr('Bus number is required'); return; }
    onAdd({ ...form, seats: Number(form.seats) });
    setForm(blank);
    setErr('');
  }

  return (
    <form onSubmit={submit} className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3">
      <p className="text-blue-700 text-xs font-semibold uppercase tracking-wide mb-3">Add a bus</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Bus number *</label>
          <input
            value={form.bus_number}
            onChange={e => setForm(p => ({ ...p, bus_number: e.target.value }))}
            placeholder="MH12-AB-1234"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">License plate</label>
          <input
            value={form.license_plate}
            onChange={e => setForm(p => ({ ...p, license_plate: e.target.value }))}
            placeholder="MH12AB1234"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Seats</label>
          <select
            value={form.seats}
            onChange={e => setForm(p => ({ ...p, seats: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value={22}>22 seats</option>
            <option value={36}>36 seats</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Fuel type</label>
          <select
            value={form.fuel_type}
            onChange={e => setForm(p => ({
              ...p,
              fuel_type: e.target.value,
              battery_type: e.target.value === 'CNG' ? null : '3 Batt',
            }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="Electric">Electric</option>
            <option value="CNG">CNG</option>
          </select>
        </div>
        {form.fuel_type === 'Electric' && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Battery pack</label>
            <select
              value={form.battery_type}
              onChange={e => setForm(p => ({ ...p, battery_type: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white
                focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              <option value="3 Batt">3 Batt (162 km range)</option>
              <option value="4 Batt">4 Batt (210 km range)</option>
            </select>
          </div>
        )}
      </div>
      {err && <p className="text-red-500 text-xs mb-2">{err}</p>}
      <button
        type="submit"
        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg
          text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <Plus size={13} /> Add bus
      </button>
    </form>
  );
}

function DriverRowForm({ onAdd }) {
  const blank = { name: '', phone: '', license_number: '', experience_yrs: 0 };
  const [form, setForm] = useState(blank);
  const [err,  setErr]  = useState('');

  function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required'); return; }
    onAdd({ ...form, experience_yrs: Number(form.experience_yrs) });
    setForm(blank);
    setErr('');
  }

  return (
    <form onSubmit={submit} className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-3">
      <p className="text-purple-700 text-xs font-semibold uppercase tracking-wide mb-3">Add a driver</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Full name *</label>
          <input
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Ravi Sharma"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Phone</label>
          <input
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            placeholder="+91 98765 43210"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">License no.</label>
          <input
            value={form.license_number}
            onChange={e => setForm(p => ({ ...p, license_number: e.target.value }))}
            placeholder="MH1234567890"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Experience (yrs)</label>
          <input
            type="number" min={0} max={40}
            value={form.experience_yrs}
            onChange={e => setForm(p => ({ ...p, experience_yrs: e.target.value }))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white
              focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300"
          />
        </div>
      </div>
      {err && <p className="text-red-500 text-xs mb-2">{err}</p>}
      <button
        type="submit"
        className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white rounded-lg
          text-sm font-medium hover:bg-purple-700 transition-colors"
      >
        <Plus size={13} /> Add driver
      </button>
    </form>
  );
}

export default function OnboardingWizard() {
  const { completeOnboarding, profile } = useAuth();

  const [step, setStep] = useState(1);

  // Step 1 state
  const [companyName,   setCompanyName]   = useState(profile?.company_name ?? '');
  const [depotCity,     setDepotCity]     = useState(profile?.depot_city ?? '');
  const [contractType,  setContractType]  = useState(profile?.contract_type ?? 'gcc');

  // Step 2 state
  const [buses,       setBuses]       = useState([]);
  const [showBusForm, setShowBusForm] = useState(false);

  // Step 3 state
  const [drivers,          setDrivers]          = useState([]);
  const [showDriverForm,   setShowDriverForm]    = useState(false);

  // Step 4 state
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleFinish() {
    setSaving(true);
    setSaveError('');
    const { error } = await completeOnboarding({
      companyName, depotCity, contractType, buses, drivers,
    });
    if (error) setSaveError(error);
    setSaving(false);
    // On success, AuthContext updates profile → isOnboarded becomes true → App re-routes
  }

  const shell = (title, sub, children, footer) => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6 justify-center">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
            <Bus size={18} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-lg leading-tight">FleetOS</p>
            <p className="text-slate-400 text-xs">Tata Motors CV</p>
          </div>
        </div>

        <WizardStepBar current={step} />

        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            <h2 className="text-slate-800 font-bold text-lg">{title}</h2>
            <p className="text-slate-400 text-sm mt-0.5">{sub}</p>
          </div>

          <div className="px-6 py-5">
            {children}
          </div>

          {footer && (
            <div className="px-6 pb-5">
              {footer}
            </div>
          )}
        </div>

        <p className="text-center text-slate-400 text-xs mt-4">
          You can always update these in Fleet Setup later.
        </p>
      </div>
    </div>
  );

  // ── Step 1: Fleet Basics ───────────────────────────────────────────────
  if (step === 1) return shell(
    'Set up your fleet',
    'Tell us a bit about your operation before we show you the dashboard.',
    <>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Company / operator name
          </label>
          <input
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="Tata Motors Transport Services"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-slate-800 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Depot city
          </label>
          <input
            value={depotCity}
            onChange={e => setDepotCity(e.target.value)}
            placeholder="Pune"
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-slate-800 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Contract type
          </label>
          <div className="grid grid-cols-3 gap-3">
            {CONTRACT_TYPES.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setContractType(c.id)}
                className={cn(
                  'text-left p-3 rounded-xl border-2 transition-all',
                  contractType === c.id
                    ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200 ring-offset-1'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                <p className={cn('text-sm font-semibold mb-0.5',
                  contractType === c.id ? 'text-blue-700' : 'text-slate-700'
                )}>
                  {c.label}
                </p>
                <p className="text-slate-400 text-xs leading-snug">{c.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>,
    <div className="flex justify-end pt-2">
      <button
        onClick={() => setStep(2)}
        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700
          text-white font-semibold text-sm rounded-xl transition-colors"
      >
        Next <ArrowRight size={15} />
      </button>
    </div>
  );

  // ── Step 2: Add Buses ──────────────────────────────────────────────────
  if (step === 2) return shell(
    'Register your buses',
    'Add the buses in your fleet. You can skip this and add them later in Fleet Setup.',
    <>
      {showBusForm
        ? <BusRowForm onAdd={b => { setBuses(p => [...p, b]); setShowBusForm(false); }} />
        : (
          <button
            onClick={() => setShowBusForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-blue-300
              text-blue-600 hover:bg-blue-50 rounded-xl text-sm font-medium transition-colors mb-3 w-full justify-center"
          >
            <Plus size={15} /> Add a bus
          </button>
        )
      }

      {buses.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs text-slate-400 uppercase tracking-wide">
                {['Bus no.', 'Seats', 'Type', 'Battery', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {buses.map((b, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{b.bus_number}</td>
                  <td className="px-4 py-2.5 text-slate-600">{b.seats}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn(
                      'flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-xs border',
                      b.fuel_type === 'Electric'
                        ? 'bg-blue-50 border-blue-200 text-blue-600'
                        : 'bg-orange-50 border-orange-200 text-orange-600'
                    )}>
                      {b.fuel_type === 'Electric' ? <Zap size={10} /> : <Fuel size={10} />}
                      {b.fuel_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{b.battery_type ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => setBuses(p => p.filter((_, j) => j !== i))}
                      className="text-slate-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {buses.length === 0 && !showBusForm && (
        <div className="text-center py-6 text-slate-400 text-sm">
          No buses added yet. You can do this later in <strong>Fleet Setup</strong>.
        </div>
      )}
    </>,
    <div className="flex items-center justify-between pt-2">
      <button
        onClick={() => setStep(1)}
        className="px-4 py-2.5 border border-slate-200 text-slate-500 hover:text-slate-700
          text-sm rounded-xl transition-colors"
      >
        Back
      </button>
      <div className="flex items-center gap-3">
        {buses.length === 0 && (
          <button
            onClick={() => setStep(3)}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Skip for now
          </button>
        )}
        <button
          onClick={() => setStep(3)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700
            text-white font-semibold text-sm rounded-xl transition-colors"
        >
          {buses.length > 0 ? `Continue with ${buses.length} bus${buses.length !== 1 ? 'es' : ''}` : 'Next'}
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );

  // ── Step 3: Add Drivers ────────────────────────────────────────────────
  if (step === 3) return shell(
    'Register your drivers',
    'Add the drivers assigned to your fleet. You can skip this and add them later.',
    <>
      {showDriverForm
        ? <DriverRowForm onAdd={d => { setDrivers(p => [...p, d]); setShowDriverForm(false); }} />
        : (
          <button
            onClick={() => setShowDriverForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-purple-300
              text-purple-600 hover:bg-purple-50 rounded-xl text-sm font-medium transition-colors mb-3 w-full justify-center"
          >
            <Plus size={15} /> Add a driver
          </button>
        )
      }

      {drivers.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-xs text-slate-400 uppercase tracking-wide">
                {['Name', 'Phone', 'License', 'Exp.', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {drivers.map((d, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{d.name}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.license_number || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{d.experience_yrs} yr{d.experience_yrs !== 1 ? 's' : ''}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => setDrivers(p => p.filter((_, j) => j !== i))}
                      className="text-slate-300 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drivers.length === 0 && !showDriverForm && (
        <div className="text-center py-6 text-slate-400 text-sm">
          No drivers added yet. You can do this later in <strong>Fleet Setup</strong>.
        </div>
      )}
    </>,
    <div className="flex items-center justify-between pt-2">
      <button
        onClick={() => setStep(2)}
        className="px-4 py-2.5 border border-slate-200 text-slate-500 hover:text-slate-700
          text-sm rounded-xl transition-colors"
      >
        Back
      </button>
      <div className="flex items-center gap-3">
        {drivers.length === 0 && (
          <button
            onClick={() => setStep(4)}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            Skip for now
          </button>
        )}
        <button
          onClick={() => setStep(4)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700
            text-white font-semibold text-sm rounded-xl transition-colors"
        >
          {drivers.length > 0 ? `Continue with ${drivers.length} driver${drivers.length !== 1 ? 's' : ''}` : 'Next'}
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );

  // ── Step 4: Summary & Finish ───────────────────────────────────────────
  return shell(
    "You're all set!",
    'Review your fleet summary, then start exploring the dashboard.',
    <>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-700">{buses.length}</p>
          <p className="text-blue-600 text-sm mt-0.5">Bus{buses.length !== 1 ? 'es' : ''} registered</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-purple-700">{drivers.length}</p>
          <p className="text-purple-600 text-sm mt-0.5">Driver{drivers.length !== 1 ? 's' : ''} registered</p>
        </div>
      </div>

      {(buses.length === 0 || drivers.length === 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 mb-4">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-700 text-sm font-medium">Demo data will be shown until you add your fleet</p>
            <p className="text-amber-600 text-xs mt-0.5">
              The Live Map, Alert Center, and Driver Scorecards will use sample data.
              Add real buses and drivers in <strong>Fleet Setup</strong> to see your actual fleet.
            </p>
          </div>
        </div>
      )}

      {companyName && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-sm">
          {[
            ['Company', companyName],
            ['Depot',   depotCity || '—'],
            ['Contract', CONTRACT_TYPES.find(c => c.id === contractType)?.label ?? contractType],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-slate-400">{k}</span>
              <span className="text-slate-700 font-medium">{v}</span>
            </div>
          ))}
        </div>
      )}

      {saveError && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={14} className="flex-shrink-0" />
          {saveError}
        </div>
      )}
    </>,
    <div className="flex items-center justify-between pt-2">
      <button
        onClick={() => setStep(3)}
        disabled={saving}
        className="px-4 py-2.5 border border-slate-200 text-slate-500 hover:text-slate-700
          text-sm rounded-xl transition-colors disabled:opacity-40"
      >
        Back
      </button>
      <button
        onClick={handleFinish}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700
          text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-60 shadow-md"
      >
        {saving
          ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
          : <><CheckCircle size={15} /> Start exploring</>
        }
      </button>
    </div>
  );
}
