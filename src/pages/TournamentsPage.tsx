import React, { useState } from 'react';
import {
  Trophy,
  Search,
  Users,
  Calendar,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  Zap,
  MapPin,
  Clock
} from 'lucide-react';
import { Tournament } from '../types';
import { useAuth } from '../context/AuthContext';

interface TournamentsPageProps {
  tournaments: Tournament[];
  onSelectTournament: (id: string) => void;
}

export const TournamentsPage: React.FC<TournamentsPageProps> = ({ tournaments, onSelectTournament }) => {
  const { user, token } = useAuth();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  const createTournament = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setCreating(true);
    setCreateError('');
    try {
      const response = await fetch('/api/tournaments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: values.get('title'), description: values.get('description'),
          featuredObjectiveTitle: values.get('featuredObjectiveTitle'),
          featuredObjectiveDescription: values.get('featuredObjectiveDescription'),
          featuredObjectivePoints: Number(values.get('featuredObjectivePoints')),
          maxTeams: Number(values.get('maxTeams')), prizePool: Number(values.get('prizePool')),
          registrationCloseAt: new Date(String(values.get('registrationCloseAt'))).toISOString(),
          tournamentStartAt: new Date(String(values.get('tournamentStartAt'))).toISOString()
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not create the tournament.');
      onSelectTournament(result.tournament.id);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Could not create the tournament.');
    } finally {
      setCreating(false);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'REGISTRATION_OPEN' | 'COMPLETED'>('ALL');

  const filteredTournaments = tournaments.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.mapName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: Tournament['status']) => {
    switch (status) {
      case 'LIVE':
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold flex items-center gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            LIVE NOW
          </span>
        );
      case 'REGISTRATION_OPEN':
        return (
          <span className="px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            REGISTRATION OPEN
          </span>
        );
      case 'REGISTRATION_LOCKED':
        return (
          <span className="px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 text-xs font-mono font-bold">
            ROSTER LOCKED
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-mono">
            COMPLETED
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#1f2b42]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white uppercase tracking-wider">
            Competitive Marathon Tournaments
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Browse active score racing tournaments on Cryo Archive. Register your 3-player roster or spectate live bracket advancement.
          </p>
        </div>
      </div>

      {isAdmin && (
        <details className="rounded-xl border border-slate-700 bg-[#121929] p-4">
          <summary className="cursor-pointer font-semibold text-amber-300">Create free-entry tournament</summary>
          <form onSubmit={createTournament} className="mt-4 grid gap-4 sm:grid-cols-2 [&_input]:mt-1 [&_input]:block [&_input]:w-full [&_input]:rounded [&_input]:bg-slate-800 [&_input]:p-2">
            <label>Title<input name="title" required maxLength={100} /></label>
            <label>Description<input name="description" maxLength={2000} /></label>
            <label>Registration closes (local time)<input name="registrationCloseAt" type="datetime-local" required /></label>
            <label>Tournament starts (local time)<input name="tournamentStartAt" type="datetime-local" required /></label>
            <label>Maximum teams<input name="maxTeams" type="number" required min={2} max={64} defaultValue={8} /></label>
            <label>Prize pool (USD)<input name="prizePool" type="number" required min={0} max={1000000} defaultValue={0} /></label>
            <label>Featured objective<input name="featuredObjectiveTitle" required maxLength={100} /></label>
            <label>Objective instructions<input name="featuredObjectiveDescription" maxLength={1000} /></label>
            <label>Objective points<input name="featuredObjectivePoints" type="number" required min={0} max={100} defaultValue={5} /></label>
            {createError && <p role="alert" className="sm:col-span-2 text-red-300">{createError}</p>}
            <button type="submit" disabled={creating} className="sm:col-span-2 justify-self-start rounded bg-amber-400 px-4 py-2 font-semibold text-black disabled:opacity-50">{creating ? 'Creating…' : 'Open registration'}</button>
          </form>
        </details>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tournaments or map..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#121929] border border-[#202d46] text-sm text-white focus:outline-none focus:border-amber-400 placeholder:text-slate-500"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#101726] border border-[#1f2b42] rounded-xl w-full sm:w-auto overflow-x-auto">
          {(['ALL', 'LIVE', 'REGISTRATION_OPEN', 'COMPLETED'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === filter
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              {filter.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Tournaments Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTournaments.map((t) => (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectTournament(t.id);
              }
            }}
            onClick={() => onSelectTournament(t.id)}
            className="rounded-2xl bg-[#0f1624] border border-[#1f2c46] hover:border-amber-500/60 transition-all duration-200 overflow-hidden cursor-pointer flex flex-col justify-between group shadow-xl hover:shadow-amber-500/10"
          >
            {/* Banner with Map Image */}
            <div className="relative h-40 overflow-hidden">
              {t.bannerUrl && <img
                src={t.bannerUrl}
                alt={t.name}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f1624] via-[#0f1624]/40 to-transparent"></div>
              <div className="absolute top-3 right-3">{getStatusBadge(t.status)}</div>
              <div className="absolute bottom-3 left-4 flex items-center gap-1.5 text-xs text-amber-300 font-mono">
                <MapPin className="w-3.5 h-3.5" />
                <span>{t.mapName}</span>
              </div>
            </div>

            {/* Content Body */}
            <div className="p-5 space-y-4 flex-1">
              <div>
                <h3 className="font-display font-bold text-lg text-white group-hover:text-amber-300 transition-colors">
                  {t.name}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono text-xs pt-3 border-t border-[#1a253a]">
                <div className="p-2.5 rounded-lg bg-[#141d2e] border border-[#1f2b42]">
                  <div className="text-[10px] text-slate-400 uppercase">Prize Pool</div>
                  <div className="text-sm font-bold text-amber-400">${t.prizePoolUsd.toLocaleString()}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#141d2e] border border-[#1f2b42]">
                  <div className="text-[10px] text-slate-400 uppercase">Teams Registered</div>
                  <div className="text-sm font-bold text-white">
                    {t.currentTeamCount} / {t.maxTeams} Max
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-400">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" /> Starts:
                  </span>
                  <span className="text-slate-300 font-mono">{new Date(t.startsAt).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" /> Match Window:
                  </span>
                  <span className="text-slate-300 font-mono">{t.matchWindowMinutes} mins / match</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-slate-500" /> Entry Fee:
                  </span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {t.entryFeeUsd === 0 ? 'Free Entry' : `$${t.entryFeeUsd} per team`}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-[#0c121e] border-t border-[#1a253a] flex items-center justify-between text-xs font-display font-bold uppercase tracking-wider text-amber-400 group-hover:text-amber-300">
              <span>View Tournament Hub & Bracket</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
