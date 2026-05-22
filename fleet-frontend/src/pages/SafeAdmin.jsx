import { useState, useEffect, useCallback } from 'react';
import {
  Bus, Users, UserCircle, AlertTriangle, CheckCircle,
  Plus, Trash2, Loader2, RefreshCw, ChevronRight,
  Send, Shield, MessageSquare, Pencil, Check, X,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { subscribeToSOS, replyToAlert, resolveSOSAlert } from '../lib/sosStore';

const TABS = [
  { id: 'buses',    label: 'Buses',          icon: Bus         },
  { id: 'drivers',  label: 'Drivers',        icon: UserCircle  },
  { id: 'students', label: 'Students',       icon: Users       },
  { id: 'alerts',   label: 'Parent Alerts',  icon: AlertTriangle },
];

const STOPS = ['Swargate','Deccan','Aundh','Wakad','Hinjewadi','Katraj','Market Yard','Pune Station','Nagar Road','Vishrantwadi','Kothrud','Karve Road','Shivajinagar','Wanowrie','Hadapsar','Pimpri','Wagholi','Kharadi','Yerwada'];

// ── Buses tab ─────────────────────────────────────────────────────────────────
function BusesTab({ userId }) {
  const [buses,      setBuses]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [adding,     setAdding]     = useState(false);
  const [form,       setForm]       = useState({ bus_number: '', seats: '36', fuel_type: 'Electric' });
  const [saving,     setSaving]     = useState(false);
  const [editingId,  setEditingId]  = useState(null);
  const [editForm,   setEditForm]   = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('fleet_buses').select('*').eq('operator_id', userId).eq('is_active', true).order('created_at');
    setBuses(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.bus_number.trim()) return;
    setSaving(true);
    await supabase.from('fleet_buses').insert({ ...form, seats: Number(form.seats), operator_id: userId, is_active: true });
    setForm({ bus_number: '', seats: '36', fuel_type: 'Electric' });
    setAdding(false);
    setSaving(false);
    load();
  }

  async function handleRemove(id) {
    await supabase.from('fleet_buses').update({ is_active: false }).eq('id', id);
    load();
  }

  function startEdit(bus) {
    setEditingId(bus.id);
    setEditForm({ bus_number: bus.bus_number, fuel_type: bus.fuel_type, seats: String(bus.seats) });
  }

  async function handleSaveEdit(id) {
    if (!editForm.bus_number.trim()) return;
    setSaving(true);
    await supabase.from('fleet_buses').update({
      bus_number: editForm.bus_number.trim(),
      fuel_type:  editForm.fuel_type,
      seats:      Number(editForm.seats),
    }).eq('id', id);
    setSaving(false);
    setEditingId(null);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-sm">{buses.length} bus{buses.length !== 1 ? 'es' : ''} registered</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><RefreshCw size={14} /></button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={14} /> Add Bus
          </button>
        </div>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-blue-700 font-medium text-sm">Add New Bus</p>
          <div className="grid grid-cols-3 gap-3">
            <input value={form.bus_number} onChange={e => setForm(p => ({ ...p, bus_number: e.target.value }))}
              placeholder="Bus number (e.g. MH12-AB-1234)"
              className="col-span-3 sm:col-span-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <select value={form.fuel_type} onChange={e => setForm(p => ({ ...p, fuel_type: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
              <option>Electric</option><option>CNG</option><option>Diesel</option>
            </select>
            <select value={form.seats} onChange={e => setForm(p => ({ ...p, seats: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
              <option value="22">22 seats</option><option value="36">36 seats</option><option value="45">45 seats</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-500 text-sm hover:bg-slate-50">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !form.bus_number.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />} Save Bus
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : buses.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
          <Bus size={32} className="mx-auto mb-3 opacity-30" />No buses added yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {buses.map(bus => editingId === bus.id ? (
            <div key={bus.id} className="bg-blue-50 border border-blue-300 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
              <input value={editForm.bus_number} onChange={e => setEditForm(p => ({ ...p, bus_number: e.target.value }))}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
              <div className="flex gap-2">
                <select value={editForm.fuel_type} onChange={e => setEditForm(p => ({ ...p, fuel_type: e.target.value }))}
                  className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none bg-white">
                  <option>Electric</option><option>CNG</option><option>Diesel</option>
                </select>
                <select value={editForm.seats} onChange={e => setEditForm(p => ({ ...p, seats: e.target.value }))}
                  className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none bg-white">
                  <option value="22">22 seats</option><option value="36">36 seats</option><option value="45">45 seats</option>
                </select>
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setEditingId(null)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 text-xs hover:bg-white">
                  <X size={12} /> Cancel
                </button>
                <button onClick={() => handleSaveEdit(bus.id)} disabled={saving || !editForm.bus_number.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />} Save
                </button>
              </div>
            </div>
          ) : (
            <div key={bus.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between shadow-sm group">
              <div>
                <p className="text-slate-800 font-semibold text-sm">{bus.bus_number}</p>
                <p className="text-slate-400 text-xs mt-0.5">{bus.fuel_type} · {bus.seats} seats</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(bus)} className="text-slate-300 hover:text-blue-500 transition-colors p-1">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleRemove(bus.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Drivers tab ───────────────────────────────────────────────────────────────
function DriversTab({ userId }) {
  const [drivers,   setDrivers]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [adding,    setAdding]    = useState(false);
  const [form,      setForm]      = useState({ name: '', phone: '', license_number: '', experience_yrs: '5' });
  const [saving,    setSaving]    = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm,  setEditForm]  = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('fleet_drivers').select('*').eq('operator_id', userId).eq('is_active', true).order('created_at');
    setDrivers(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from('fleet_drivers').insert({ ...form, experience_yrs: Number(form.experience_yrs), operator_id: userId, is_active: true });
    setForm({ name: '', phone: '', license_number: '', experience_yrs: '5' });
    setAdding(false);
    setSaving(false);
    load();
  }

  async function handleRemove(id) {
    await supabase.from('fleet_drivers').update({ is_active: false }).eq('id', id);
    load();
  }

  function startEdit(d) {
    setEditingId(d.id);
    setEditForm({ name: d.name, phone: d.phone ?? '', license_number: d.license_number ?? '', experience_yrs: String(d.experience_yrs ?? '') });
  }

  async function handleSaveEdit(id) {
    if (!editForm.name.trim()) return;
    setSaving(true);
    await supabase.from('fleet_drivers').update({
      name:            editForm.name.trim(),
      phone:           editForm.phone.trim(),
      license_number:  editForm.license_number.trim(),
      experience_yrs:  Number(editForm.experience_yrs) || 0,
    }).eq('id', id);
    setSaving(false);
    setEditingId(null);
    load();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-sm">{drivers.length} driver{drivers.length !== 1 ? 's' : ''} registered</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><RefreshCw size={14} /></button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={14} /> Add Driver
          </button>
        </div>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-blue-700 font-medium text-sm">Add New Driver</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Full name" className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              placeholder="Phone (e.g. +91 98765 00001)" className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <input value={form.license_number} onChange={e => setForm(p => ({ ...p, license_number: e.target.value }))}
              placeholder="License number" className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <input type="number" value={form.experience_yrs} onChange={e => setForm(p => ({ ...p, experience_yrs: e.target.value }))}
              placeholder="Years of experience" className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-500 text-sm hover:bg-slate-50">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !form.name.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />} Save Driver
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : drivers.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
          <UserCircle size={32} className="mx-auto mb-3 opacity-30" />No drivers added yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {drivers.map(d => editingId === d.id ? (
            <div key={d.id} className="bg-blue-50 border border-blue-300 rounded-xl p-4 flex flex-col gap-2 shadow-sm">
              <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Full name" className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
              <input value={editForm.phone} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="Phone" className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
              <div className="flex gap-2">
                <input value={editForm.license_number} onChange={e => setEditForm(p => ({ ...p, license_number: e.target.value }))}
                  placeholder="License no." className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none bg-white" />
                <input type="number" value={editForm.experience_yrs} onChange={e => setEditForm(p => ({ ...p, experience_yrs: e.target.value }))}
                  placeholder="Yrs exp" className="w-20 px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none bg-white" />
              </div>
              <div className="flex gap-2 mt-1">
                <button onClick={() => setEditingId(null)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 text-xs hover:bg-white">
                  <X size={12} /> Cancel
                </button>
                <button onClick={() => handleSaveEdit(d.id)} disabled={saving || !editForm.name.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={12} />} Save
                </button>
              </div>
            </div>
          ) : (
            <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between shadow-sm group">
              <div>
                <p className="text-slate-800 font-semibold text-sm">{d.name}</p>
                <p className="text-slate-400 text-xs mt-0.5">{d.phone}</p>
                <p className="text-slate-400 text-xs">{d.experience_yrs} yrs exp · {d.license_number}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(d)} className="text-slate-300 hover:text-blue-500 transition-colors p-1">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleRemove(d.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Students tab ──────────────────────────────────────────────────────────────
function StudentsTab({ userId }) {
  const [students, setStudents] = useState([]);
  const [buses,    setBuses]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [form,     setForm]     = useState({ name: '', class_name: '', stop: '', bus_id: '', parent_phone: '' });
  const [saving,   setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: sData }, { data: bData }] = await Promise.all([
      supabase.from('saferide_students').select('*, fleet_buses(bus_number)').eq('school_id', userId).eq('is_active', true).order('created_at'),
      supabase.from('fleet_buses').select('id, bus_number').eq('operator_id', userId).eq('is_active', true).order('bus_number'),
    ]);
    setStudents(sData ?? []);
    setBuses(bData ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.name.trim() || !form.stop) return;
    setSaving(true);
    await supabase.from('saferide_students').insert({
      name: form.name, class_name: form.class_name, stop: form.stop,
      bus_id: form.bus_id || null, parent_phone: form.parent_phone,
      school_id: userId, is_active: true,
    });
    setForm({ name: '', class_name: '', stop: '', bus_id: '', parent_phone: '' });
    setAdding(false);
    setSaving(false);
    load();
  }

  async function handleRemove(id) {
    await supabase.from('saferide_students').update({ is_active: false }).eq('id', id);
    load();
  }

  async function handleBusChange(studentId, busId) {
    await supabase.from('saferide_students').update({ bus_id: busId || null }).eq('id', studentId);
    load();
  }

  const byBus = buses.map(b => ({
    bus: b,
    students: students.filter(s => s.bus_id === b.id),
  }));
  const unassigned = students.filter(s => !s.bus_id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-sm">{students.length} student{students.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"><RefreshCw size={14} /></button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={14} /> Add Student
          </button>
        </div>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-blue-700 font-medium text-sm">Add New Student</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="Full name *" className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <input value={form.class_name} onChange={e => setForm(p => ({ ...p, class_name: e.target.value }))}
              placeholder="Class (e.g. 8A)" className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            <select value={form.stop} onChange={e => setForm(p => ({ ...p, stop: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
              <option value="">Select boarding stop *</option>
              {STOPS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={form.bus_id} onChange={e => setForm(p => ({ ...p, bus_id: e.target.value }))}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none">
              <option value="">Assign bus (optional)</option>
              {buses.map(b => <option key={b.id} value={b.id}>{b.bus_number}</option>)}
            </select>
            <input value={form.parent_phone} onChange={e => setForm(p => ({ ...p, parent_phone: e.target.value }))}
              placeholder="Parent phone" className="col-span-2 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-500 text-sm hover:bg-slate-50">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !form.name.trim() || !form.stop}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />} Save Student
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
      ) : students.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
          <Users size={32} className="mx-auto mb-3 opacity-30" />No students added yet.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {byBus.map(({ bus, students: ss }) => ss.length === 0 ? null : (
            <div key={bus.id}>
              <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2 flex items-center gap-2">
                <Bus size={12} /> {bus.bus_number}
                <span className="text-slate-400 font-normal normal-case">— {ss.length} student{ss.length !== 1 ? 's' : ''}</span>
              </p>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                {ss.map((s, i) => (
                  <div key={s.id} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-slate-100')}>
                    <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 text-xs font-bold flex-shrink-0">
                      {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 text-sm font-medium">{s.name}</p>
                      <p className="text-slate-400 text-xs">{s.class_name && `${s.class_name} · `}{s.stop}{s.parent_phone && ` · ${s.parent_phone}`}</p>
                    </div>
                    <select value={s.bus_id ?? ''} onChange={e => handleBusChange(s.id, e.target.value)}
                      className="px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none max-w-36">
                      <option value="">Unassigned</option>
                      {buses.map(b => <option key={b.id} value={b.id}>{b.bus_number}</option>)}
                    </select>
                    <button onClick={() => handleRemove(s.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {unassigned.length > 0 && (
            <div>
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Unassigned — {unassigned.length}</p>
              <div className="bg-white border border-amber-200 rounded-xl overflow-hidden shadow-sm">
                {unassigned.map((s, i) => (
                  <div key={s.id} className={cn('flex items-center gap-3 px-4 py-3', i > 0 && 'border-t border-slate-100')}>
                    <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 text-xs font-bold flex-shrink-0">
                      {s.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 text-sm font-medium">{s.name}</p>
                      <p className="text-slate-400 text-xs">{s.class_name && `${s.class_name} · `}{s.stop}</p>
                    </div>
                    <select value="" onChange={e => handleBusChange(s.id, e.target.value)}
                      className="px-2 py-1 border border-amber-200 rounded-lg text-xs text-amber-600 focus:outline-none max-w-36">
                      <option value="">Assign bus</option>
                      {buses.map(b => <option key={b.id} value={b.id}>{b.bus_number}</option>)}
                    </select>
                    <button onClick={() => handleRemove(s.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Parent Alerts tab ─────────────────────────────────────────────────────────
const SEV_COLOR = {
  critical: 'bg-red-600 text-white border-red-600',
  high:     'bg-orange-100 text-orange-700 border-orange-300',
  medium:   'bg-amber-50 text-amber-700 border-amber-300',
  low:      'bg-slate-100 text-slate-500 border-slate-200',
};

function AlertsTab() {
  const [alerts,       setAlerts]       = useState([]);
  const [expanded,     setExpanded]     = useState(null);
  const [replyText,    setReplyText]    = useState('');
  const [filterTab,    setFilterTab]    = useState('all');

  useEffect(() => {
    return subscribeToSOS(incoming => setAlerts(incoming));
  }, []);

  function resolveAlert(id) {
    const a = alerts.find(x => x.id === id);
    setAlerts(prev => prev.map(x => x.id === id ? { ...x, status: 'resolved' } : x));
    if (a?._isSOS) resolveSOSAlert(id);
  }

  function sendReply(alertId) {
    if (!replyText.trim()) return;
    const time  = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const reply = { from: 'Admin', text: replyText, time };
    const a     = alerts.find(x => x.id === alertId);
    setAlerts(prev => prev.map(x => x.id === alertId ? { ...x, status: 'in_progress', thread: [...x.thread, reply] } : x));
    if (a?._isSOS) replyToAlert(alertId, reply);
    setReplyText('');
  }

  const filtered =
    filterTab === 'new'      ? alerts.filter(a => a.status === 'new')         :
    filterTab === 'open'     ? alerts.filter(a => a.status === 'in_progress') :
    filterTab === 'resolved' ? alerts.filter(a => a.status === 'resolved')    :
    alerts;

  const openCount = alerts.filter(a => a.status !== 'resolved').length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-slate-500 text-sm flex items-center gap-2">
          {openCount > 0 && <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">{openCount}</span>}
          Parent Alert Inbox
        </p>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {[{ key: 'all', label: 'All' }, { key: 'new', label: 'New' }, { key: 'open', label: 'In Progress' }, { key: 'resolved', label: 'Resolved' }].map(tab => (
            <button key={tab.key} onClick={() => setFilterTab(tab.key)}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-all',
                filterTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}>{tab.label}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-2xl">
          <CheckCircle size={28} className="mx-auto mb-2 text-green-400" />
          {alerts.length === 0 ? 'No parent alerts yet. Alerts sent via SOS will appear here.' : 'No alerts in this category.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm divide-y divide-slate-100">
          {filtered.map(alert => (
            <div key={alert.id} className={cn(alert.status === 'new' && 'bg-red-50/20')}>
              <div className="px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(expanded === alert.id ? null : alert.id)}>
                <div className="flex items-start gap-3">
                  <span className={cn('px-2 py-0.5 rounded-full border text-xs font-bold flex-shrink-0 mt-0.5', SEV_COLOR[alert.severity] ?? SEV_COLOR.low)}>
                    {(alert.severity ?? 'low').toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5 gap-2">
                      <p className="text-slate-800 font-semibold text-sm">{alert.type}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-slate-400 text-xs">{alert.time}</span>
                        {alert.status === 'new'         && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
                        {alert.status === 'resolved'    && <CheckCircle size={13} className="text-green-500" />}
                        {alert.status === 'in_progress' && <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 text-xs rounded-full">In Progress</span>}
                      </div>
                    </div>
                    <p className="text-slate-500 text-xs mb-1">{alert.parent} · {alert.student} · {alert.busId}</p>
                    <p className="text-slate-600 text-sm line-clamp-2">{alert.message}</p>
                    {alert.thread?.length > 0 && <p className="text-slate-400 text-xs mt-1 flex items-center gap-1"><MessageSquare size={10} /> {alert.thread.length} repl{alert.thread.length === 1 ? 'y' : 'ies'}</p>}
                  </div>
                  <ChevronRight size={14} className={cn('text-slate-300 flex-shrink-0 transition-transform mt-1', expanded === alert.id && 'rotate-90')} />
                </div>
              </div>

              {expanded === alert.id && (
                <div className="px-5 pb-4 bg-slate-50/80 border-t border-slate-100">
                  <div className="mt-3 mb-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
                    <p className="text-slate-500 text-xs font-medium mb-1">Full message from {alert.parent}</p>
                    <p className="text-slate-700 text-sm leading-relaxed">{alert.message}</p>
                  </div>
                  {alert.thread?.map((msg, i) => (
                    <div key={i} className={cn('px-3 py-2 rounded-xl text-xs mb-2', msg.from === 'Admin' ? 'bg-blue-50 border border-blue-100 text-blue-800 ml-6' : 'bg-white border border-slate-200 text-slate-700 mr-6')}>
                      <span className="font-semibold">{msg.from}</span>
                      <span className="text-slate-400 ml-2">{msg.time}</span>
                      <p className="mt-0.5 leading-relaxed">{msg.text}</p>
                    </div>
                  ))}
                  {alert.status !== 'resolved' && (
                    <div className="flex gap-2 mb-3">
                      <input value={replyText} onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendReply(alert.id)}
                        placeholder="Type a reply…"
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 text-slate-800 placeholder-slate-400" />
                      <button onClick={() => sendReply(alert.id)}
                        className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 text-sm font-medium">
                        <Send size={13} /> Reply
                      </button>
                    </div>
                  )}
                  {alert.status !== 'resolved' && (
                    <button onClick={() => resolveAlert(alert.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs hover:bg-green-100 transition-colors">
                      <CheckCircle size={11} /> Mark Resolved
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SafeAdmin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('buses');

  if (!user) return null;

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <h1 className="text-slate-800 font-bold text-xl flex items-center gap-2">
          <Shield size={20} className="text-blue-600" /> SafeRide Control Panel
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">Manage your school fleet, drivers, students, and parent alerts.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              tab === t.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            )}>
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'buses'    && <BusesTab    userId={user.id} />}
      {tab === 'drivers'  && <DriversTab  userId={user.id} />}
      {tab === 'students' && <StudentsTab userId={user.id} />}
      {tab === 'alerts'   && <AlertsTab />}
    </div>
  );
}
