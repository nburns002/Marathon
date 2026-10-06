import React from 'react';
import {
  Trophy,
  Swords,
  Shield,
  Zap,
  ArrowRight,
  Crosshair,
  DollarSign,
  Users,
  Timer,
  CheckCircle2,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Tournament, Match } from '../types';

interface HomePageProps {
  tournaments: Tournament[];
  matches: Match[];
  onSelectTournament: (id: string) => void;
  onSelectMatch: (id: string) => void;
  setCurrentTab: (tab: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  tournaments,
  matches,
  onSelectTournament,
  onSelectMatch,
  setCurrentTab
}) => {
  const liveTournaments = tournaments.filter((t) => t.status === 'LIVE');
  const openTournaments = tournaments.filter((t) => t.status === 'REGISTRATION_OPEN');
  const featured = liveTournaments[0] || openTournaments[0] || tournaments[0];

  const activeMatches = matches.filter(
    (m) => !m.isBye && (m.matchStatus === 'ACTIVE' || m.matchStatus === 'READY_CHECK' || m.matchStatus === 'RESULT_PENDING')
  );

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-b from-[#131c2e] via-[#0d1422] to-[#090e17] border border-[#23314c] p-8 sm:p-12 shadow-2xl bg-grid-pattern">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono mb-4">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>OFFICIAL MARATHON CRYO ARCHIVE SCORE RACE</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-display font-extrabold text-white tracking-tight leading-tight mb-4">
            TWO TEAMS. TWO CRYO RUNS.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-200">
              HIGHEST SCORE ADVANCES.
            </span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-8">
            The next-generation competitive esports platform for Marathon. Compete independently in public matchmaking, eliminate enemy runners, extract high-value loot, and survive with a <strong>1.20× squad extraction multiplier</strong>. Automated match rooms, synchronized timers, and instant bracket advancement.
          </p>

          <div className="flex flex-wrap items-center gap-4">
            {featured && (
              <button
                onClick={() => onSelectTournament(featured.id)}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-display font-bold text-sm uppercase tracking-wider transition-all shadow-lg shadow-amber-500/25 flex items-center gap-2"
              >
                <span>Enter {featured.status === 'LIVE' ? 'Live Tournament' : 'Tournament Hub'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={() => setCurrentTab('rules')}
              className="px-5 py-3 rounded-xl bg-[#141d2f] hover:bg-[#1a263d] text-slate-200 font-semibold text-sm border border-[#23314c] transition-colors"
            >
              Scoring Philosophy & Rules
            </button>
          </div>
        </div>

        {/* Live Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-12 pt-8 border-t border-[#1e2a42]">
          <div>
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Tournament Format</div>
            <div className="text-base sm:text-lg font-bold text-white mt-0.5">3-Player Score Race</div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Tournament Map</div>
            <div className="text-base sm:text-lg font-bold text-amber-400 mt-0.5">Cryo Archive</div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Squad Extraction Bonus</div>
            <div className="text-base sm:text-lg font-bold text-emerald-400 mt-0.5">1.20× Multiplier</div>
          </div>
          <div>
            <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Full Squad Wipe</div>
            <div className="text-base sm:text-lg font-bold text-red-400 mt-0.5">0 pts (Zero Run)</div>
          </div>
        </div>
      </section>

      {/* Live Matches Spotlight */}
      {activeMatches.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></div>
              <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">
                Live Head-to-Head Matchups
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-400">Automated Match Rooms</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeMatches.map((match) => (
              <div
                key={match.id}
                onClick={() => onSelectMatch(match.id)}
                className="p-5 rounded-2xl bg-[#0f1624] border border-[#212f49] hover:border-amber-500/60 transition-all cursor-pointer shadow-xl group"
              >
                <div className="flex items-center justify-between text-xs mb-3 pb-2 border-b border-[#1a253a]">
                  <span className="font-mono text-slate-400">Round {match.round} • Match #{match.matchNumber}</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-[10px] border border-emerald-500/30 animate-pulse">
                    {match.matchStatus.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="space-y-2.5 my-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {match.teamALogo && <img src={match.teamALogo} alt="" className="w-6 h-6 rounded object-cover" />}
                      <span className="font-bold text-sm text-white">{match.teamAName || 'TBD'}</span>
                    </div>
                    <span className="font-mono font-bold text-sm text-amber-300">
                      {match.finalScoreA !== null ? `${match.finalScoreA.toFixed(2)} pts` : 'Run 1 Pending'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {match.teamBLogo && <img src={match.teamBLogo} alt="" className="w-6 h-6 rounded object-cover" />}
                      <span className="font-bold text-sm text-white">{match.teamBName || 'TBD'}</span>
                    </div>
                    <span className="font-mono font-bold text-sm text-amber-300">
                      {match.finalScoreB !== null ? `${match.finalScoreB.toFixed(2)} pts` : 'Run 1 Pending'}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#1a253a] flex items-center justify-between text-xs text-amber-400 group-hover:text-amber-300">
                  <span>Enter Match Room & Chat</span>
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How the Score Race Works (3-Step Lifecycle) */}
      <section className="space-y-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wider">
            How The Score Race Works
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Automate normal matches. Escalate exceptions. No private lobbies needed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[#0f1624] border border-[#1f2c44]">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-display font-bold text-lg mb-4">
              01
            </div>
            <h3 className="font-display font-bold text-base text-white mb-2">10-Minute Ready Check</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Both captains enter the Match Room and click Ready. When the second team Readies, the 75-minute official match window begins. Automated forfeits trigger for no-shows.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0f1624] border border-[#1f2c44]">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-display font-bold text-lg mb-4">
              02
            </div>
            <h3 className="font-display font-bold text-base text-white mb-2">Two Independent Runs</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Teams queue independently into public Cryo Archive lobbies. Report scores via chat command (<code className="text-amber-300">/score run1 ...</code>) or form. Run 1 scores remain hidden until both teams submit!
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#0f1624] border border-[#1f2c44]">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-display font-bold text-lg mb-4">
              03
            </div>
            <h3 className="font-display font-bold text-base text-white mb-2">10-Min Review & Auto-Advance</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              After both runs complete, a 10-minute dispute review begins. If no discrepancy is flagged, the winner automatically advances into the next bracket round with zero admin delay.
            </p>
          </div>
        </div>
      </section>

      {/* Scoring Engine Breakdown Card */}
      <section className="p-8 rounded-3xl bg-gradient-to-br from-[#111929] to-[#0c121e] border border-[#23314c] shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-400 uppercase tracking-wider mb-2">
              <Zap className="w-4 h-4" />
              High-Stakes Extraction Math
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-white mb-4">
              Macro-Tactical Scoring: Fight, Loot, or Extract?
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed mb-6">
              As your team earns kills (+5 pts each) and extracts credits (+1 pt per 3k), continuing to push deeper gets increasingly dangerous. A 3-man full extraction grants a massive <strong>+20% bonus</strong>. A squad wipe sets the entire run to <strong>0 points</strong>.
            </p>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0c121e] border border-[#1d2940]">
                <span className="text-slate-300 flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-red-400" /> Runner Eliminations
                </span>
                <span className="text-amber-400 font-bold">5 Points / Kill</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0c121e] border border-[#1d2940]">
                <span className="text-slate-300 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" /> Extracted Credits (Uncapped)
                </span>
                <span className="text-amber-400 font-bold">1 Point / 3,000 Credits</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0c121e] border border-[#1d2940]">
                <span className="text-slate-300 flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" /> Full Squad Survival (3/3)
                </span>
                <span className="text-emerald-400 font-bold">×1.20 Multiplier (+20%)</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#0c121e] border border-[#1d2940]">
                <span className="text-slate-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400" /> Squad Wipe (0/3 Extracted)
                </span>
                <span className="text-red-400 font-bold">0 Points (Total Wipeout)</span>
              </div>
            </div>
          </div>

          {/* Example Calculation Box */}
          <div className="p-6 rounded-2xl bg-[#0a0f19] border border-amber-500/40 font-mono text-xs shadow-2xl">
            <div className="text-amber-400 uppercase tracking-wider font-bold mb-3 pb-2 border-b border-[#1c2942]">
              Example Official Run Calculation
            </div>
            <div className="space-y-2 text-slate-300">
              <div className="flex justify-between">
                <span>Runner Kills: 6 × 5</span>
                <span className="text-white font-bold">30.00 pts</span>
              </div>
              <div className="flex justify-between">
                <span>Extracted Credits: 48,000 / 3,000</span>
                <span className="text-white font-bold">16.00 pts</span>
              </div>
              <div className="flex justify-between">
                <span>Featured Objective: Archive Data Drive</span>
                <span className="text-white font-bold">5.00 pts</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#1a253a] text-slate-400">
                <span>Base Score</span>
                <span className="text-white font-bold">51.00 pts</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-bold">
                <span>Extraction Multiplier (3/3 Alive)</span>
                <span>×1.20</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-amber-500/40 text-sm font-bold text-amber-300">
                <span>FINAL RUN SCORE</span>
                <span>61.20 PTS</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
