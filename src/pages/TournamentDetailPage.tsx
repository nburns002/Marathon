import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Users,
  Calendar,
  DollarSign,
  MapPin,
  Clock,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Lock,
  ArrowLeft,
  AlertTriangle,
  Play,
  Shuffle,
  CreditCard
} from 'lucide-react';
import { Tournament, Bracket, Match, TournamentRegistration, TournamentRegistrationDTO, Team } from '../types';
import { BracketView } from '../components/BracketView';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';

interface TournamentDetailPageProps {
  tournamentId: string;
  onBack: () => void;
  onSelectMatch: (matchId: string) => void;
}

export const TournamentDetailPage: React.FC<TournamentDetailPageProps> = ({
  tournamentId,
  onBack,
  onSelectMatch
}) => {
  const { user, token, primaryTeam, userTeams } = useAuth();
  const { subscribe } = useRealtime();

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [registrations, setRegistrations] = useState<TournamentRegistrationDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'bracket' | 'teams' | 'overview' | 'rules' | 'admin'>('bracket');

  // Registration Modal State
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [refundPolicyAccepted, setRefundPolicyAccepted] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');

  // Admin Actions State
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMsg, setAdminMsg] = useState('');

  const fetchTournamentData = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`/api/tournaments/${tournamentId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTournament(data.tournament);
        setBracket(data.bracket);
        setRegistrations(data.registrations);
        if (!selectedTeamId && primaryTeam) {
          setSelectedTeamId(primaryTeam.id);
        }
      }
    } catch (err) {
      console.error('Error fetching tournament:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTournamentData();
    const unsub = subscribe('*', () => {
      fetchTournamentData();
    });
    return unsub;
  }, [tournamentId, token, user]);

  if (loading || !tournament) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-mono text-slate-400">Loading Tournament Cryo Archive...</p>
        </div>
      </div>
    );
  }

  const isUserRegistered = registrations.some(
    (r) => r.status === 'REGISTERED' && userTeams.some((ut) => ut.id === r.teamId)
  );

  const handleRegisterTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setRegistering(true);
    setRegisterError('');
    setRegisterSuccess('');

    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          teamId: selectedTeamId,
          termsAccepted,
          refundPolicyAccepted
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setRegisterError(data.error || 'Failed to register team');
      } else {
        setRegisterSuccess('Team registered successfully! Roster snapshot locked.');
        setTimeout(() => {
          setShowRegisterModal(false);
          fetchTournamentData();
        }, 1200);
      }
    } catch (err: any) {
      setRegisterError(err.message || 'Network error');
    } finally {
      setRegistering(false);
    }
  };

  const handleAdminLockAndGenerate = async () => {
    if (!token) return;
    setAdminLoading(true);
    setAdminMsg('');
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/generate-bracket`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ shuffleSeeds: true })
      });
      const data = await res.json();
      if (res.ok) {
        setAdminMsg('Bracket successfully generated! Tournament is now LIVE.');
        fetchTournamentData();
      } else {
        setAdminMsg(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setAdminMsg(`Error: ${err.message}`);
    } finally {
      setAdminLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Breadcrumb / Back */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tournament Directory</span>
        </button>

        {tournament.championTeamName && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>CHAMPION: {tournament.championTeamName}</span>
          </div>
        )}
      </div>

      {/* Hero Banner Header */}
      <div className="relative rounded-3xl overflow-hidden bg-[#0d1320] border border-[#202d46] shadow-2xl">
        <div className="h-48 sm:h-64 relative">
          <img src={tournament.bannerUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d1320] via-[#0d1320]/60 to-transparent"></div>

          <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold">
                  {tournament.status.replace(/_/g, ' ')}
                </span>
                <span className="text-xs font-mono text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  {tournament.mapName}
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-display font-extrabold text-white uppercase tracking-wider">
                {tournament.name}
              </h1>
              <p className="text-xs text-slate-300 mt-1 max-w-xl">{tournament.description}</p>
            </div>

            {/* Registration CTA */}
            {tournament.status === 'REGISTRATION_OPEN' && (
              <div>
                {isUserRegistered ? (
                  <div className="px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>YOUR TEAM IS REGISTERED</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRegisterModal(true)}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-display font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all flex items-center gap-2"
                  >
                    <Trophy className="w-4 h-4" />
                    <span>Register 3-Man Team (${tournament.entryFeeUsd === 0 ? 'Free' : tournament.entryFeeUsd})</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 sm:p-6 bg-[#0b101c] border-t border-[#1a253a] font-mono text-xs">
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Prize Pool</div>
            <div className="text-base font-bold text-amber-400">${tournament.prizePoolUsd.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Team Slots</div>
            <div className="text-base font-bold text-white">
              {tournament.currentTeamCount} / {tournament.maxTeams} Registered
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Match Window</div>
            <div className="text-base font-bold text-slate-200">{tournament.matchWindowMinutes} Minutes</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Ready Check</div>
            <div className="text-base font-bold text-slate-200">{tournament.readyCheckMinutes} Minutes</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-[#1f2b42] pb-2 overflow-x-auto">
        <div className="flex items-center gap-2">
          {[
            { id: 'bracket', label: 'Tournament Bracket' },
            { id: 'teams', label: `Registered Teams (${registrations.length})` },
            { id: 'overview', label: 'Overview & Map' },
            { id: 'rules', label: 'Rules & Scoring' },
            ...(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN' ? [{ id: 'admin', label: 'Admin Controller' }] : [])
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeTab === tab.id
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab 1: Bracket */}
      {activeTab === 'bracket' && (
        <div className="p-6 rounded-3xl bg-[#0d1320] border border-[#1f2b42] shadow-xl">
          {bracket && bracket.matches.length > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-lg text-white uppercase tracking-wider">
                    Official Elimination Bracket
                  </h3>
                  <p className="text-xs text-slate-400">
                    Click any matchup to open its live score racing match room.
                  </p>
                </div>
              </div>
              <BracketView bracket={bracket} onSelectMatch={onSelectMatch} />
            </div>
          ) : (
            <div className="text-center py-16 space-y-3">
              <Trophy className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-display font-bold text-white uppercase">Bracket Not Yet Generated</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Registration is currently open. When the tournament starts, seeds will be randomized and the bracket will go live.
              </p>
              {(user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') && (
                <button
                  onClick={handleAdminLockAndGenerate}
                  disabled={adminLoading}
                  className="mt-4 px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-display font-bold text-xs uppercase tracking-wider hover:bg-amber-400 transition-colors"
                >
                  {adminLoading ? 'Generating...' : 'Lock Registration & Generate Bracket Now'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Registered Teams (Public Registry) */}
      {activeTab === 'teams' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-bold text-lg text-white uppercase tracking-wider">
                Public Team Registry & Snapshotted Rosters
              </h3>
              <p className="text-xs text-slate-400">
                Verified Bungie IDs locked at tournament registration for competitive integrity.
              </p>
            </div>
            <span className="text-xs font-mono text-amber-400">
              {registrations.length} / {tournament.maxTeams} Teams Seeded
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {registrations.map((reg) => (
              <div
                key={reg.id}
                className="p-5 rounded-2xl bg-[#0f1624] border border-[#1f2b42] shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-[#192438] mb-3">
                    <div className="flex items-center gap-2.5">
                      {reg.teamLogo ? (
                        <img src={reg.teamLogo} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-700" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-bold text-xs text-amber-400">
                          {reg.teamName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-display font-bold text-sm text-white">{reg.teamName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">Captain: {reg.captainName || 'Team Captain'}</div>
                      </div>
                    </div>
                    {reg.seed && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono text-xs font-bold border border-amber-500/30">
                        Seed #{reg.seed}
                      </span>
                    )}
                  </div>

                  {/* Roster Snapshots */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                      Snapshotted Competitors (3-Player Squad)
                    </div>
                    {reg.rosterSnapshot.map((member, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 rounded-lg bg-[#141d2e] border border-[#1c273d] text-xs font-mono"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-slate-500">#{i + 1}</span>
                          <span className="text-slate-200 font-semibold truncate">
                            {member.displayNameSnapshot || (member as any).displayName || member.usernameSnapshot || 'Competitor'}
                          </span>
                        </div>
                        <span className="text-[11px] text-amber-300/90 font-bold shrink-0">
                          {member.bungieIdSnapshot || (member as any).bungieId || 'Bungie ID Locked'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-[#182338] flex items-center justify-between text-[11px] text-slate-400">
                  <span>Registered {new Date(reg.registeredAt).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" /> Paid & Verified
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
              <h3 className="font-display font-bold text-base text-white uppercase tracking-wider mb-3">
                Tournament Architecture & Map Setup
              </h3>
              <p className="text-slate-300 text-xs leading-relaxed mb-4">
                The {tournament.name} takes place on <strong>{tournament.mapName}</strong>. Teams queue independently into standard public matchmaking during their active 75-minute match window. Both teams complete 2 full Cryo Archive runs, with scores autorun through the authoritative scoring engine.
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 rounded-xl bg-[#141d2e] border border-[#1f2b42]">
                  <div className="text-slate-400 text-[10px]">Round Format</div>
                  <div className="text-white font-bold mt-0.5">Best-of-2 Runs Score Total</div>
                </div>
                <div className="p-3 rounded-xl bg-[#141d2e] border border-[#1f2b42]">
                  <div className="text-slate-400 text-[10px]">Intermission Buffer</div>
                  <div className="text-white font-bold mt-0.5">{tournament.roundIntermissionMinutes} Minutes Between Rounds</div>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
              <h3 className="font-display font-bold text-base text-white uppercase tracking-wider mb-3">
                Featured Round Objective
              </h3>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white">{tournament.featuredObjectiveTitle}</div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    Extract core terminal encrypted data drive from the central cryo vaults.
                  </div>
                </div>
                <div className="text-base font-mono font-bold text-amber-400 shrink-0">
                  +{tournament.featuredObjectivePoints} PTS
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
              <h4 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400 mb-3">
                Prize Distribution
              </h4>
              <div className="space-y-2 font-mono text-xs">
                <div className="flex justify-between p-2 rounded bg-[#141d2e] border border-[#1f2b42]">
                  <span className="text-amber-300 font-bold">1st Place Champion</span>
                  <span className="text-white font-bold">${(tournament.prizePoolUsd * 0.6).toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-[#141d2e] border border-[#1f2b42]">
                  <span className="text-slate-300">2nd Place Runner-Up</span>
                  <span className="text-white font-bold">${(tournament.prizePoolUsd * 0.25).toLocaleString()}</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-[#141d2e] border border-[#1f2b42]">
                  <span className="text-slate-300">3rd / 4th Semifinalists</span>
                  <span className="text-white font-bold">${(tournament.prizePoolUsd * 0.075).toLocaleString()} ea</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Rules */}
      {activeTab === 'rules' && (
        <div className="p-6 rounded-2xl bg-[#0f1624] border border-[#1f2b42] space-y-6">
          <div>
            <h3 className="font-display font-bold text-lg text-white uppercase tracking-wider">
              Authoritative Score Calculation Formula
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Deterministic, transparent scoring engine enforced across all matchups.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#0b101c] border border-amber-500/30 font-mono text-xs space-y-2 text-slate-200">
            <div className="text-amber-400 font-bold">
              Base Score = (Runner Kills × 5) + (Extracted Credits / 3000) + (Featured Objective)
            </div>
            <div className="text-emerald-400 font-bold">
              Final Run Score = Base Score × Survival Multiplier
            </div>
            <div className="text-slate-400 text-[11px] pt-2 border-t border-[#1a253a]">
              • 3 Players Extracted: ×1.20 Multiplier (+20% Squad Synergy Bonus)
              <br />• 1 or 2 Players Extracted: ×1.00 Multiplier
              <br />• 0 Players Extracted (Squad Wipe): ×0.00 Multiplier (0 pts awarded)
            </div>
          </div>

          <div>
            <h4 className="font-display font-bold text-sm text-white uppercase tracking-wider mb-2">
              Authoritative Tiebreaker Hierarchy
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-300 font-mono">
              <li>Highest number of Full-Squad 3-Player Extractions</li>
              <li>Highest Total Runner Eliminations across both runs</li>
              <li>Highest Total Extracted Credit Value across both runs</li>
              <li>Highest Single-Run Score</li>
              <li>Total Featured Round Objectives completed</li>
            </ol>
          </div>
        </div>
      )}

      {/* Tab 5: Admin Controller */}
      {activeTab === 'admin' && (
        <div className="p-6 rounded-2xl bg-[#0f1624] border border-red-500/30 space-y-4">
          <div className="flex items-center gap-2 text-red-400 font-display font-bold uppercase tracking-wider text-sm">
            <Lock className="w-4 h-4" />
            <span>Tournament Director Administration</span>
          </div>

          <p className="text-xs text-slate-300">
            Manage registration locks, randomize seed allocations, and generate authoritative tournament brackets.
          </p>

          {adminMsg && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
              {adminMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={handleAdminLockAndGenerate}
              disabled={adminLoading}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Shuffle className="w-4 h-4" />
              <span>{adminLoading ? 'Generating...' : 'Lock & Regenerate Bracket'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Register 3-Man Team Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-[#0d1320] border border-[#24334f] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#1c273d] mb-4">
              <div>
                <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
                  Register 3-Player Team
                </h3>
                <p className="text-xs text-slate-400">
                  Lock roster snapshot for {tournament.name}
                </p>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {registerError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {registerError}
              </div>
            )}

            {registerSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                {registerSuccess}
              </div>
            )}

            <form onSubmit={handleRegisterTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Select Your Team (Captain Role Required)
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-sm text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="">-- Choose Eligible Team --</option>
                  {userTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.members.length} members)
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Must have exactly 3 roster members with verified Bungie IDs.
                </p>
              </div>

              {tournament.entryFeeUsd > 0 && (
                <div className="p-3 rounded-xl bg-[#121929] border border-[#1f2b44] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-amber-400" /> Entry Fee
                    </span>
                    <span className="font-mono font-bold text-amber-400">${tournament.entryFeeUsd}.00 USD</span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Payment is handled securely via Stripe Checkout (Simulated Instant Clearance).
                  </p>
                </div>
              )}

              <div className="space-y-2 pt-1 border-t border-[#1c273d]">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-400"
                  />
                  <span className="text-[11px] text-slate-300">
                    I agree to the Official Marathon Cryo Archive Tournament Rules & Terms of Service.
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={refundPolicyAccepted}
                    onChange={(e) => setRefundPolicyAccepted(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-400"
                  />
                  <span className="text-[11px] text-slate-300">
                    I understand rosters lock upon registration and agree to the No-Refund Policy once brackets generate.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={registering || !selectedTeamId || !termsAccepted || !refundPolicyAccepted}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-display font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50"
              >
                {registering ? 'Snapshotting Roster...' : 'Confirm Registration & Snapshot Roster'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
