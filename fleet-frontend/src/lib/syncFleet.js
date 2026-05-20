import { supabase } from './supabase';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// Fetch active buses + drivers for this operator and push to the backend simulator.
// Safe to call at any time; silently swallows errors so it never breaks the UI.
// Returns the number of active buses synced (0 if nothing to sync or error)
export async function syncFleetToBackend(operatorId) {
  try {
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
