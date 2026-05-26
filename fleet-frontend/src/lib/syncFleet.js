import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const SEED_BUSES = [
  { bus_number: 'MH12-AB-1234', license_plate: 'MH12AB1234', seats: 36, fuel_type: 'Electric', battery_type: '4 Batt' },
  { bus_number: 'MH12-CD-5678', license_plate: 'MH12CD5678', seats: 36, fuel_type: 'Electric', battery_type: '3 Batt' },
  { bus_number: 'MH12-EF-9012', license_plate: 'MH12EF9012', seats: 36, fuel_type: 'CNG',      battery_type: null     },
  { bus_number: 'MH12-GH-3456', license_plate: 'MH12GH3456', seats: 36, fuel_type: 'Diesel',   battery_type: null     },
];

const SEED_DRIVERS = [
  { name: 'Ramesh Kumar',   phone: '+91 98765 11001', license_number: 'MH0120240001', experience_yrs: 8  },
  { name: 'Vijay Shinde',   phone: '+91 98765 11002', license_number: 'MH0120240002', experience_yrs: 5  },
  { name: 'Suresh Patil',   phone: '+91 98765 11003', license_number: 'MH0120240003', experience_yrs: 12 },
];

// Insert seed buses + drivers if this operator has none yet.
async function seedFleetIfEmpty(operatorId) {
  const [{ count: busCount }, { count: driverCount }] = await Promise.all([
    supabase.from('fleet_buses').select('id', { count: 'exact', head: true }).eq('operator_id', operatorId),
    supabase.from('fleet_drivers').select('id', { count: 'exact', head: true }).eq('operator_id', operatorId),
  ]);

  if ((busCount ?? 0) === 0) {
    await supabase.from('fleet_buses').insert(
      SEED_BUSES.map(b => ({ ...b, operator_id: operatorId, is_active: true }))
    );
  }
  if ((driverCount ?? 0) === 0) {
    await supabase.from('fleet_drivers').insert(
      SEED_DRIVERS.map(d => ({ ...d, operator_id: operatorId, is_active: true }))
    );
  }
}

// Fetch active buses + drivers for this operator and push to the backend simulator.
// Seeds demo data on first load if the fleet is empty.
// Safe to call at any time; silently swallows errors so it never breaks the UI.
// Returns the number of active buses synced (0 if nothing to sync or error)
export async function syncFleetToBackend(operatorId) {
  try {
    await seedFleetIfEmpty(operatorId);

    const [{ data: buses }, { data: drivers }] = await Promise.all([
      supabase.from('fleet_buses').select('*').eq('operator_id', operatorId).eq('is_active', true).order('created_at'),
      supabase.from('fleet_drivers').select('*').eq('operator_id', operatorId).eq('is_active', true).order('created_at'),
    ]);

    const count = buses?.length ?? 0;
    if (count === 0) return 0;

    await fetch(`${API_URL}/reload-buses`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ buses, drivers: drivers || [] }),
    });

    return count;
  } catch {
    return 0;
  }
}
