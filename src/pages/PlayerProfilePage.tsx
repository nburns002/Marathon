import React, { useState } from 'react';
import { User, ShieldCheck, Trophy, Award, Edit3, Save, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const PlayerProfilePage: React.FC = () => {
  const { user, token, refreshUser } = useAuth();

  const [bungieId, setBungieId] = useState(user?.bungieId || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  if (!user) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ bungieId, displayName, avatarUrl })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update profile');
      } else {
        setMessage('Profile updated successfully!');
        setEditing(false);
        refreshUser();
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Profile Header */}
      <div className="p-8 rounded-3xl bg-[#0f1624] border border-[#1f2b42] shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <img
            src={user.avatarUrl}
            alt={user.username}
            className="w-24 h-24 rounded-2xl object-cover border-2 border-amber-500/40 shadow-xl"
          />

          <div className="space-y-1 text-center sm:text-left flex-1">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <h1 className="text-2xl font-display font-bold text-white">{user.displayName}</h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {user.role}
              </span>
            </div>
            <div className="text-sm font-mono text-amber-400 font-semibold">{user.bungieId}</div>
            <div className="text-xs text-slate-400">{user.email} • Competitor ID: {user.id}</div>
          </div>

          <button
            onClick={() => setEditing(!editing)}
            className="px-4 py-2 rounded-xl bg-[#141d2e] hover:bg-[#1a263d] border border-[#23314c] text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5"
          >
            <Edit3 className="w-4 h-4 text-amber-400" />
            <span>{editing ? 'Cancel' : 'Edit Profile & Bungie ID'}</span>
          </button>
        </div>

        {/* Edit Form */}
        {editing && (
          <form onSubmit={handleSave} className="mt-8 pt-6 border-t border-[#1a253a] space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {error}
              </div>
            )}
            {message && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                {message}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Marathon Bungie ID *
                </label>
                <input
                  type="text"
                  required
                  value={bungieId}
                  onChange={(e) => setBungieId(e.target.value)}
                  placeholder="Player#1234"
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-amber-200 font-mono focus:outline-none focus:border-amber-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Must match the in-game account. Verified in public lobbies.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">Avatar Image URL</label>
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Profile Changes'}</span>
            </button>
          </form>
        )}
      </div>

      {/* Stats Card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
        <div className="p-4 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
          <div className="text-[10px] text-slate-400 uppercase">Tournaments Entered</div>
          <div className="text-xl font-bold text-white mt-1">3</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
          <div className="text-[10px] text-slate-400 uppercase">Career Win Rate</div>
          <div className="text-xl font-bold text-amber-400 mt-1">75.0%</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
          <div className="text-[10px] text-slate-400 uppercase">Total Runner Eliminations</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">38</div>
        </div>
        <div className="p-4 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
          <div className="text-[10px] text-slate-400 uppercase">Squad Extraction Rate</div>
          <div className="text-xl font-bold text-cyan-400 mt-1">83.3%</div>
        </div>
      </div>
    </div>
  );
};
