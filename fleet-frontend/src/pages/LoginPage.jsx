import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

const ROLES = [
  { id: 'admin',            label: 'Admin'            },
  { id: 'fleet_operator',   label: 'Fleet Operator'   },
  { id: 'internal_analyst', label: 'Internal Analyst' },
  { id: 'school_staff',     label: 'School Staff'     },
  { id: 'parent',           label: 'Parent'           },
];

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest">
        {label}
      </label>
      {children}
    </div>
  );
}

const INPUT_CLS = `w-full px-4 py-3 rounded-lg border border-slate-200 bg-slate-50
  text-slate-800 placeholder-slate-300 text-sm
  focus:outline-none focus:ring-2 focus:ring-[#1D6DB8]/30 focus:border-[#1D6DB8] transition`;

export default function LoginPage() {
  const { signIn, signUp } = useAuth();

  const [mode,     setMode]     = useState('login');
  const [role,     setRole]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  function switchMode(m) {
    setMode(m);
    setError('');
    setSuccess('');
    setRole('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (mode === 'signup' && !role) {
      setError('Please select your role to continue.');
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
    <div className="min-h-screen bg-[#f4f6fa] flex flex-col items-center justify-center p-4">

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">

        {/* Top band */}
        <div className="h-1.5 bg-[#1D6DB8]" />

        <div className="px-8 pt-8 pb-9">

          {/* Tata logo */}
          <div className="flex flex-col items-center mb-7">
            <img
              src="/tata-logo.svg"
              alt="Tata Motors"
              className="h-16 w-auto mb-3"
            />
            <h1 className="text-slate-800 font-bold text-xl tracking-tight">FleetOS</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {mode === 'login' ? 'Sign in to continue' : 'Create your account'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {mode === 'signup' && (
              <Field label="Full Name">
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Ravi Sharma"
                  className={INPUT_CLS}
                />
              </Field>
            )}

            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={INPUT_CLS}
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={cn(INPUT_CLS, 'pr-11')}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            {mode === 'signup' && (
              <Field label="Role">
                <select
                  required
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className={cn(INPUT_CLS, 'cursor-pointer appearance-none')}
                >
                  <option value="" disabled>Select your role…</option>
                  {ROLES.map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </Field>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg px-4 py-3 leading-relaxed">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg px-4 py-3 leading-relaxed">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-1 py-3 rounded-lg bg-[#1D6DB8] hover:bg-[#1558a0] active:scale-[0.98]
                text-white font-semibold text-sm tracking-wide transition-all
                flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="text-[#1D6DB8] hover:text-[#1558a0] font-semibold transition-colors"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>

      <p className="text-slate-400 text-xs mt-6">
        Tata Motors · CV Passenger Division · &copy; 2026
      </p>
    </div>
  );
}
