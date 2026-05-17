import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [profile,    setProfile]    = useState(null);
  const [fleetStats, setFleetStats] = useState({ busCount: 0, driverCount: 0 });
  const [loading,    setLoading]    = useState(true);

  async function fetchFleetStats(userId) {
    const [{ count: busCount }, { count: driverCount }] = await Promise.all([
      supabase.from('fleet_buses').select('id', { count: 'exact', head: true })
        .eq('operator_id', userId).eq('is_active', true),
      supabase.from('fleet_drivers').select('id', { count: 'exact', head: true })
        .eq('operator_id', userId).eq('is_active', true),
    ]);
    setFleetStats({ busCount: busCount ?? 0, driverCount: driverCount ?? 0 });
  }

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!data) {
      // Profile row missing — account was deleted; kill the session
      await supabase.auth.signOut();
      setProfile(null);
      return null;
    }

    setProfile(data);
    if (data.role === 'fleet_operator') {
      fetchFleetStats(userId);
    }
    return data;
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setFleetStats({ busCount: 0, driverCount: 0 });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signUp({ email, password, fullName, role }) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });
    return { error };
  }

  async function signIn({ email, password }) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setFleetStats({ busCount: 0, driverCount: 0 });
  }

  async function completeOnboarding({ companyName, depotCity, contractType, buses = [], drivers = [] }) {
    if (!user) return { error: 'Not authenticated' };

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        onboarding_complete: true,
        company_name:  companyName  || null,
        depot_city:    depotCity    || null,
        contract_type: contractType || 'gcc',
      })
      .eq('id', user.id);

    if (profileError) return { error: profileError.message };

    if (buses.length > 0) {
      const { error: busError } = await supabase
        .from('fleet_buses')
        .insert(buses.map(b => ({ ...b, operator_id: user.id })));
      if (busError) return { error: busError.message };
    }

    if (drivers.length > 0) {
      const { error: driverError } = await supabase
        .from('fleet_drivers')
        .insert(drivers.map(d => ({ ...d, operator_id: user.id })));
      if (driverError) return { error: driverError.message };
    }

    await fetchProfile(user.id);
    return { error: null };
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  // fleet operators need onboarding; all other roles are immediately "done"
  const isOnboarded = profile?.role !== 'fleet_operator'
    ? true
    : (profile?.onboarding_complete ?? false);

  // demo mode: fleet operator who hasn't registered any buses yet
  const isDemoMode = profile?.role === 'fleet_operator' && fleetStats.busCount === 0;

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      fleetStats, isOnboarded, isDemoMode,
      signUp, signIn, signOut,
      completeOnboarding, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
