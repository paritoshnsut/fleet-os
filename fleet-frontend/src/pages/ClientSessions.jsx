import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Copy, CheckCircle, Clock, MessageCircle, Trash2, X, Users, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

function timeAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
}

// ── New Session Modal ─────────────────────────────────────────────────────────
function NewSessionModal({ onClose, onCreate }) {
  const [name,   setName]   = useState('');
  const [email,  setEmail]  = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(18)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    await onCreate({ name: name.trim(), email: email.trim(), token });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-slate-800 font-bold text-lg">New Client Session</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-slate-600 text-xs font-medium mb-1.5 block">Client / Company Name *</label>
            <input
              autoFocus
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm outline-none focus:border-indigo-400 transition-colors"
              placeholder="e.g. MSRTC Pune Division"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div>
            <label className="text-slate-600 text-xs font-medium mb-1.5 block">Contact Email (optional)</label>
            <input
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 text-sm outline-none focus:border-indigo-400 transition-colors"
              placeholder="fleet@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
        </div>

        <p className="text-slate-400 text-xs mt-4">
          A unique link will be generated. The client opens it, uploads their Excel, and gets the full analysis — no login needed.
        </p>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 text-sm hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!name.trim() || saving}
            className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-semibold text-sm disabled:opacity-50 transition-colors">
            {saving ? 'Creating…' : 'Create & Get Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Link Modal (shown right after creation) ───────────────────────────────────
function LinkModal({ session, onClose }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/?token=${session.token}`;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle size={22} className="text-green-500" />
        </div>
        <h3 className="text-slate-800 font-bold text-lg text-center mb-1">Session created!</h3>
        <p className="text-slate-500 text-sm text-center mb-5">
          Share this link with <strong>{session.client_name}</strong>. It's valid for 30 days.
        </p>

        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 mb-5">
          <p className="text-indigo-700 text-xs font-mono break-all leading-relaxed">{link}</p>
        </div>

        <div className="flex gap-3">
          <button onClick={copy}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all',
              copied
                ? 'bg-green-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            )}>
            {copied ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy Link</>}
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-sm hover:bg-slate-100 transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Full Transcript Modal ─────────────────────────────────────────────────────
const TYPE_LABEL = {
  stats:         '📊 Summary stats card',
  gantt:         '📈 Bus schedule Gantt chart',
  'charger-gantt': '⚡ Charger bay timeline chart',
  table:         '📋 Data table',
};

function TranscriptModal({ session, onClose }) {
  const convo = session.conversation || [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-slate-800 font-bold text-sm">{session.client_name} — Full Transcript</h3>
            <p className="text-slate-400 text-xs mt-0.5">{convo.length} messages</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {convo.length === 0 ? (
            <p className="text-slate-400 text-sm text-center py-8">No messages yet.</p>
          ) : convo.map((msg, i) => {
            const isBot = msg.role === 'bot';

            if (msg.type !== 'text') {
              return (
                <div key={i} className="flex justify-start">
                  <span className="text-xs text-slate-400 italic bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                    {TYPE_LABEL[msg.type] || `[${msg.type}]`}
                    {msg.meta?.title ? ` — ${msg.meta.title}` : ''}
                  </span>
                </div>
              );
            }

            return (
              <div key={i} className={cn('flex gap-2', !isBot && 'flex-row-reverse')}>
                <div className={cn(
                  'max-w-lg px-4 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap',
                  isBot
                    ? 'bg-slate-50 border border-slate-200 text-slate-700 rounded-bl-sm'
                    : 'bg-indigo-600 text-white rounded-br-sm'
                )}>
                  {String(msg.content)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Session Card ──────────────────────────────────────────────────────────────
function SessionCard({ session, onDelete }) {
  const [copied,      setCopied]      = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const link  = `${window.location.origin}/?token=${session.token}`;
  const convo = session.conversation || [];
  const res   = session.results || {};

  const statusStyle = {
    pending:   'bg-slate-100 text-slate-500',
    active:    'bg-blue-50 text-blue-600',
    completed: 'bg-green-50 text-green-600',
  };

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function openLink() {
    window.open(link, '_blank');
  }

  const analysesDone = [
    res.trip   && 'Trip Planning',
    res.charge && 'Charging',
    res.tco    && 'TCO',
  ].filter(Boolean);

  return (
    <>
      {showTranscript && (
        <TranscriptModal session={session} onClose={() => setShowTranscript(false)} />
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="text-slate-800 font-semibold text-sm">{session.client_name}</h3>
              <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusStyle[session.status] ?? statusStyle.pending)}>
                {session.status}
              </span>
              {analysesDone.length > 0 && analysesDone.map(a => (
                <span key={a} className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                  {a}
                </span>
              ))}
            </div>

            {session.client_email && (
              <p className="text-slate-400 text-xs mb-2">{session.client_email}</p>
            )}

            <div className="flex items-center gap-4 text-slate-400 text-xs flex-wrap">
              <span className="flex items-center gap-1">
                <Clock size={11} /> Created {timeAgo(session.created_at)}
              </span>
              {session.last_active_at && (
                <span className="flex items-center gap-1">
                  <Clock size={11} /> Active {timeAgo(session.last_active_at)}
                </span>
              )}
              {convo.length > 0 && (
                <span className="flex items-center gap-1">
                  <MessageCircle size={11} /> {convo.length} messages
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {convo.length > 0 && (
              <button onClick={() => setShowTranscript(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <MessageCircle size={11} /> View chat
              </button>
            )}
            <button onClick={openLink}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              title="Open client link">
              <ExternalLink size={13} />
            </button>
            <button onClick={copy}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border font-medium transition-all',
                copied
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              )}>
              {copied ? <><CheckCircle size={11} /> Copied!</> : <><Copy size={11} /> Copy link</>}
            </button>
            <button onClick={() => onDelete(session.id)}
              className="p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ClientSessions() {
  const { user } = useAuth();
  const [sessions,   setSessions]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showModal,  setShowModal]  = useState(false);
  const [newSession, setNewSession] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('client_sessions')
      .select('*')
      .eq('operator_id', user.id)
      .order('created_at', { ascending: false });
    setSessions(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate({ name, email, token }) {
    const { data } = await supabase.from('client_sessions').insert({
      operator_id:  user.id,
      client_name:  name,
      client_email: email || null,
      token,
      status:       'pending',
      conversation: [],
      results:      {},
      expires_at:   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).select().single();

    setShowModal(false);
    if (data) { setNewSession(data); load(); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this session? The client link will stop working.')) return;
    await supabase.from('client_sessions').delete().eq('id', id);
    setSessions(prev => prev.filter(s => s.id !== id));
  }

  return (
    <div className="flex flex-col gap-5">
      {newSession && <LinkModal session={newSession} onClose={() => setNewSession(null)} />}
      {showModal  && <NewSessionModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-slate-800 font-bold text-xl">Client Analysis Portal</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Share a magic link — clients upload their Excel and get full fleet analysis without logging in
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
          <Plus size={14} /> New Session
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Sessions', value: sessions.length },
          { label: 'Active',         value: sessions.filter(s => s.status === 'active').length },
          { label: 'Completed',      value: sessions.filter(s => s.status === 'completed').length },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
            <p className="text-slate-400 text-xs mb-1">{s.label}</p>
            <p className="text-slate-800 font-bold text-2xl">{s.value}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-5 py-4">
        <p className="text-indigo-800 text-sm font-semibold mb-2">How it works</p>
        <div className="grid grid-cols-4 gap-3">
          {[
            ['1. Create', 'Click "New Session", enter the client name'],
            ['2. Share', 'Copy the magic link and send to your client'],
            ['3. Analyse', 'Client uploads their Excel — chat guides them'],
            ['4. Review', 'See the full conversation and results here'],
          ].map(([step, desc]) => (
            <div key={step}>
              <p className="text-indigo-700 text-xs font-semibold">{step}</p>
              <p className="text-indigo-600 text-xs mt-0.5">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Session list */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
          <Users size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No client sessions yet</p>
          <p className="text-slate-400 text-sm mt-1">Create a session and share the link with your client</p>
          <button onClick={() => setShowModal(true)}
            className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors">
            Create first session
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(s => (
            <SessionCard key={s.id} session={s} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
