import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Form State
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bungieId, setBungieId] = useState('');
  const [password, setPassword] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!bungieId.includes('#')) {
          setError('Bungie ID must include tag number (e.g. Runner#1234)');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, username, displayName, bungieId, password })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Registration failed');
        } else {
          login(data.token, data.user);
          onClose();
        }
      } else {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login: email, password })
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Invalid email/username or password');
        } else {
          login(data.token, data.user);
          onClose();
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#0d131f] border border-[#232f48] rounded-2xl shadow-2xl p-6 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#1b263b] mb-5">
          <div>
            <h3 className="text-lg font-display font-bold text-white uppercase tracking-wider">
              {isRegister ? 'Create Competitor Account' : 'Sign In to Marathon Arena'}
            </h3>
            <p className="text-xs text-slate-400">
              {isRegister ? 'Enter your Marathon Bungie ID to participate' : 'Enter your credentials to access matches'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2 text-xs text-red-300">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Email or Username</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isRegister ? 'player@outlook.com' : 'player@outlook.com or PlayerOne'}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#141c2c] border border-[#23304a] text-sm text-white focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500"
              />
            </div>
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Account Username</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. CryoRunner"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#141c2c] border border-[#23304a] text-sm text-white focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Marathon Bungie ID <span className="text-amber-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={bungieId}
                    onChange={(e) => setBungieId(e.target.value)}
                    placeholder="e.g. Player#1337"
                    className="w-full px-3 py-2 rounded-lg bg-[#141c2c] border border-amber-500/40 text-sm text-amber-200 font-mono focus:outline-none focus:border-amber-400 transition-colors placeholder:text-slate-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Must match your in-game Marathon account. Snapshotted on tournament registration.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Display Name (Optional)</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. FrostByte"
                  className="w-full px-3 py-2 rounded-lg bg-[#141c2c] border border-[#23304a] text-sm text-white focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#141c2c] border border-[#23304a] text-sm text-white focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {loading ? 'Processing...' : isRegister ? 'Create Account & Enter Arena' : 'Sign In'}
          </button>
        </form>

        <div className="mt-5 pt-4 border-t border-[#1b263b] text-center text-xs text-slate-400">
          {isRegister ? (
            <span>
              Already have an account?{' '}
              <button
                onClick={() => {
                  setIsRegister(false);
                  setError('');
                }}
                className="text-amber-400 hover:underline font-semibold"
              >
                Sign In
              </button>
            </span>
          ) : (
            <span>
              Need a competitor account?{' '}
              <button
                onClick={() => {
                  setIsRegister(true);
                  setError('');
                }}
                className="text-amber-400 hover:underline font-semibold"
              >
                Register Now
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
