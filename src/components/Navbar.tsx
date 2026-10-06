import React, { useState } from 'react';
import {
  Trophy,
  Users,
  Shield,
  Swords,
  BookOpen,
  Bell,
  LogOut,
  ChevronDown,
  User,
  Radio,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';

interface NavbarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openAuthModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, openAuthModal }) => {
  const { user, logout, switchDemoUser, notifications, invitations } = useAuth();
  const { connected } = useRealtime();

  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const demoPersonas = [
    { id: 'usr-capt-1', name: 'PlayerOne [Cryo]', role: 'Captain (Team Alpha)', team: 'Cryo Kings' },
    { id: 'usr-capt-2', name: 'TauCaptain', role: 'Captain (Team Bravo)', team: 'Tau Ceti Boys' },
    { id: 'usr-capt-8', name: 'ArachneQueen', role: 'Captain (Disputing)', team: 'Arachne Elite' },
    { id: 'usr-admin-1', name: 'TournamentDirector', role: 'Superadmin', team: 'Staff' },
    { id: 'usr-admin-2', name: 'HeadRef_Vance', role: 'Referee Admin', team: 'Staff' }
  ];

  const unreadCount = notifications.filter((n) => !n.read).length + invitations.filter((i) => i.status === 'PENDING').length;

  return (
    <header className="sticky top-0 z-40 bg-[#0c1017]/95 backdrop-blur-md border-b border-[#1e2638]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentTab('home')}>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 border border-amber-400/40">
              <Swords className="w-5 h-5 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-xl tracking-wider text-white">MARATHON</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono border border-amber-500/30">
                  CRYO CUP
                </span>
              </div>
              <p className="text-[10px] text-slate-400 tracking-widest uppercase font-mono">Competitive Score Race</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setCurrentTab('home')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                currentTab === 'home'
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => setCurrentTab('tournaments')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'tournaments' || currentTab === 'tournament-detail'
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Trophy className="w-4 h-4" />
              Tournaments
            </button>
            <button
              onClick={() => setCurrentTab('match-room')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'match-room'
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Swords className="w-4 h-4 text-emerald-400" />
              <span>Live Match Room</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </button>
            <button
              onClick={() => setCurrentTab('teams')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'teams'
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Users className="w-4 h-4" />
              Teams
            </button>
            <button
              onClick={() => setCurrentTab('rules')}
              className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                currentTab === 'rules'
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Rules
            </button>
            {(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') && (
              <button
                onClick={() => setCurrentTab('admin')}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  currentTab === 'admin'
                    ? 'bg-red-500/10 text-red-300 border border-red-500/30'
                    : 'text-red-400 hover:text-red-300 hover:bg-red-950/40'
                }`}
              >
                <Shield className="w-4 h-4" />
                Admin HQ
              </button>
            )}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Live Engine Indicator */}
            <div
              className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded bg-[#131926] border border-[#232f48] text-xs font-mono"
              title="Real-time Server Event Stream"
            >
              <Radio className={`w-3.5 h-3.5 ${connected ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
              <span className={connected ? 'text-emerald-400' : 'text-slate-400'}>
                {connected ? 'LIVE ENGINE' : 'CONNECTING...'}
              </span>
            </div>

            {/* Persona Switcher for Quick Scenario Testing */}
            <div className="relative">
              <button
                onClick={() => setShowPersonaMenu(!showPersonaMenu)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#141b2b] border border-amber-500/30 text-xs text-amber-300 hover:bg-[#1a2338] transition-colors"
                title="Switch persona to test captain vs admin perspectives"
              >
                <span className="font-mono text-[11px] text-slate-400">TEST AS:</span>
                <span className="font-semibold">{user?.displayName || 'Select Persona'}</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {showPersonaMenu && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#0f1523] border border-[#243048] shadow-2xl p-2 z-50">
                  <div className="text-[11px] uppercase tracking-wider font-mono text-slate-400 px-2 py-1 border-b border-[#1f2a40] mb-1">
                    Quick Persona Switcher
                  </div>
                  <div className="space-y-1">
                    {demoPersonas.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          switchDemoUser(p.id);
                          setShowPersonaMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-center justify-between ${
                          user?.id === p.id
                            ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                            : 'text-slate-300 hover:bg-[#182238]'
                        }`}
                      >
                        <div>
                          <div className="font-semibold">{p.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {p.role} • {p.team}
                          </div>
                        </div>
                        {user?.id === p.id && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Notifications Popover */}
            {user && (
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 rounded-lg bg-[#141b2b] border border-[#232f48] text-slate-300 hover:text-white hover:border-slate-500 transition-colors relative"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 rounded-xl bg-[#0f1523] border border-[#243048] shadow-2xl p-3 z-50 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between pb-2 border-b border-[#1f2a40] mb-2">
                      <span className="text-xs font-semibold text-white uppercase font-mono tracking-wider">
                        Notifications ({notifications.length})
                      </span>
                    </div>

                    {invitations.length > 0 && (
                      <div className="mb-3">
                        <div className="text-[11px] font-semibold text-amber-400 mb-1">Team Invitations</div>
                        {invitations.map((inv) => (
                          <div key={inv.id} className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-xs mb-1">
                            <p className="font-medium text-white">{inv.teamName}</p>
                            <p className="text-[11px] text-slate-300">Invited by {inv.captainName}</p>
                            <button
                              onClick={() => {
                                setCurrentTab('teams');
                                setShowNotifications(false);
                              }}
                              className="mt-1.5 px-2 py-0.5 text-[10px] bg-amber-500 text-black font-semibold rounded"
                            >
                              Review in Teams Tab
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {notifications.length === 0 && invitations.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No new notifications</p>
                    ) : (
                      <div className="space-y-2">
                        {notifications.slice(0, 6).map((n) => (
                          <div key={n.id} className="p-2 rounded bg-[#161f33] border border-[#222e49] text-xs">
                            <div className="font-medium text-slate-200">{n.title}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">{n.content}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Profile or Login */}
            {user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentTab('profile')}
                  className="flex items-center gap-2 p-1.5 rounded-lg bg-[#141b2b] border border-[#232f48] hover:border-amber-500/50 transition-colors"
                  title="View Profile"
                >
                  <img
                    src={user.avatarUrl}
                    alt={user.username}
                    className="w-7 h-7 rounded-md object-cover border border-amber-500/40"
                  />
                  <div className="hidden sm:block text-left pr-1">
                    <div className="text-xs font-semibold text-white leading-none">{user.displayName}</div>
                    <div className="text-[10px] text-amber-400 font-mono leading-none mt-1">{user.bungieId}</div>
                  </div>
                </button>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg bg-[#141b2b] border border-[#232f48] text-slate-400 hover:text-red-400 hover:border-red-500/40 transition-colors"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={openAuthModal}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-xs font-bold uppercase tracking-wider hover:from-amber-400 hover:to-amber-500 transition-all shadow-md shadow-amber-500/20"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
