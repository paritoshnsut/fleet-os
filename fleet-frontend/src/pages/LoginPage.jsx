import { useState } from 'react';
import { Bus, Shield, MapPin, Users, Eye, EyeOff, Loader2, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

const ROLES = [
  {
    id: 'admin',
    label: 'Admin',
    desc: 'Full access to all features — fleet, school, passengers',
    icon: LayoutDashboard,
    color: 'indigo',
  },
  {
    id: 'fleet_operator',
    label: 'Fleet Operator',
    desc: 'Manage buses, drivers, alerts & compliance',
    icon: Bus,
    color: 'blue',
  },
  {
    id: 'school_staff',
    label: 'School Staff',
    desc: 'Student tracking, headcount & bus management',
    icon: Shield,
    color: 'green',
  },
  {
    id: 'parent',
    label: 'Parent',
    desc: "Track your child's bus, get live ETAs",
    icon: Users,
    color: 'purple',
  },
  {
    id: 'passenger',
    label: 'Passenger',
    desc: 'Plan journeys and check live bus arrivals',
    icon: MapPin,
    color: 'orange',
  },
];

const COLOR_MAP = {
  indigo: { ring: 'ring-indigo-300', bg: 'bg-indigo-50', border: 'border-indigo-300', icon: 'bg-indigo-100 text-indigo-600', text: 'text-indigo-700' },
  blue:   { ring: 'ring-blue-300',   bg: 'bg-blue-50',   border: 'border-blue-300',   icon: 'bg-blue-100 text-blue-600',   text: 'text-blue-700'   },
  green:  { ring: 'ring-green-300',  bg: 'bg-green-50',  border: 'border-green-300',  icon: 'bg-green-100 text-green-600',  text: 'text-green-700'  },
  purple: { ring: 'ring-purple-300', bg: 'bg-purple-50', border: 'border-purple-300', icon: 'bg-purple-100 text-purple-600', text: 'text-purple-700' },
  orange: { ring: 'ring-orange-300', bg: 'bg-orange-50', border: 'border-orange-300', icon: 'bg-orange-100 text-orange-600', text: 'text-orange-700' },
};

export default function LoginPage() {
  const { signIn, signUp } = useAuth();

  const [mode,     setMode]     = useState('login');   // 'login' | 'signup'
  const [role,     setRole]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'signup' && !role) {
      setError('Please select your role before signing up.');
      return;
    }

    setLoading(true);

    if (mode === 'login') {
      const { error: err } = await signIn({ email, password });
      if (err) setError(err.message);
    } else {
      const { error: err } = await signUp({ email, password, fullName, role });
      if (err) setError(err.message);
      else setSuccess('Account created! Check your email to confirm, then sign in.');
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
              <Bus size={20} className="text-white" />
            </div>
            <span className="text-2xl font-bold text-slate-900">FleetOS</span>
          </div>
          <p className="text-slate-500 text-sm">Smart mobility platform by Tata Motors CV</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-5">

            {/* Left panel — role cards (only shown for signup) */}
            <div className={cn(
              'lg:col-span-3 p-6 border-b lg:border-b-0 lg:border-r border-slate-100',
              mode === 'login' && 'hidden lg:block'
            )}>
              <p className="text-slate-800 font-semibold mb-1">
                {mode === 'signup' ? 'Who are you?' : 'Welcome back'}
              </p>
              <p className="text-slate-400 text-xs mb-5">
                {mode === 'signup'
                  ? 'Select your role — this determines which features you can access'
                  : 'Sign in to access your FleetOS dashboard'}
              </p>

              {mode === 'signup' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {ROLES.map(r => {
                    const c = COLOR_MAP[r.color];
                    const Icon = r.icon;
                    const isSelected = role === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setRole(r.id)}
                        className={cn(
                          'text-left p-4 rounded-xl border-2 transition-all',
                          isSelected
                            ? `${c.bg} ${c.border} ring-2 ${c.ring} ring-offset-1`
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        )}
                      >
                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', c.icon)}>
                          <Icon size={18} />
                        </div>
                        <p className={cn('font-semibold text-sm', isSelected ? c.text : 'text-slate-800')}>
                          {r.label}
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5 leading-snug">{r.desc}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Login left side — product overview */
                <div className="space-y-4">
                  {ROLES.map(r => {
                    const c = COLOR_MAP[r.color];
                    const Icon = r.icon;
                    return (
                      <div key={r.id} className="flex items-center gap-3">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', c.icon)}>
                          <Icon size={15} />
                        </div>
                        <div>
                          <p className="text-slate-700 text-sm font-medium">{r.label}</p>
                          <p className="text-slate-400 text-xs">{r.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right panel — form */}
            <div className="lg:col-span-2 p-6 flex flex-col justify-center">
              <h2 className="text-slate-800 font-semibold text-lg mb-1">
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                {mode === 'login'
                  ? 'Enter your credentials to continue'
                  : 'Fill in your details to get started'}
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">

                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Full name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                      placeholder="Ravi Sharma"
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50
                        text-slate-800 placeholder-slate-400 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50
                      text-slate-800 placeholder-slate-400 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Password</label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2.5 pr-10 rounded-lg border border-slate-200 bg-slate-50
                        text-slate-800 placeholder-slate-400 text-sm
                        focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-3 py-2.5">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-3 py-2.5">
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm
                    py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                </button>
              </form>

              <p className="text-center text-xs text-slate-400 mt-5">
                {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccess(''); }}
                  className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>

          </div>
        </div>

        <p className="text-center text-slate-400 text-xs mt-5">v1.0 · TAS Internship 2026</p>
      </div>
    </div>
  );
}
