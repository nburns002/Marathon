import React from 'react';
import { Trophy, Swords, ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Match, Bracket } from '../types';

interface BracketViewProps {
  bracket: Bracket;
  onSelectMatch: (matchId: string) => void;
}

export const BracketView: React.FC<BracketViewProps> = ({ bracket, onSelectMatch }) => {
  const { totalRounds, matches } = bracket;

  const getRoundName = (roundNum: number, total: number) => {
    const fromEnd = total - roundNum;
    if (fromEnd === 0) return 'Championship Finals';
    if (fromEnd === 1) return 'Semifinals';
    if (fromEnd === 2) return 'Quarterfinals';
    return `Round ${roundNum}`;
  };

  const getStatusBadge = (match: Match) => {
    if (match.isBye) {
      return <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">BYE</span>;
    }
    switch (match.matchStatus) {
      case 'READY_CHECK':
        return <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-mono animate-pulse">READY CHECK</span>;
      case 'ACTIVE':
      case 'RUN_1_PARTIAL':
      case 'RUN_1_COMPLETE':
        return <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono animate-pulse">LIVE SCORE RACE</span>;
      case 'RESULT_PENDING':
        return <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-mono">REVIEW WINDOW</span>;
      case 'DISPUTED':
        return <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-[10px] font-mono">DISPUTED</span>;
      case 'FORFEIT':
        return <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-mono">FORFEIT</span>;
      case 'FINAL':
        return <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono">COMPLETED</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-500 text-[10px] font-mono">WAITING</span>;
    }
  };

  return (
    <div className="w-full overflow-x-auto pb-6">
      <div className="flex gap-8 min-w-[900px] py-4 px-2">
        {Array.from({ length: totalRounds }, (_, i) => i + 1).map((round) => {
          const roundMatches = matches.filter((m) => m.round === round);
          const roundTitle = getRoundName(round, totalRounds);

          return (
            <div key={round} className="flex-1 min-w-[280px] max-w-[340px]">
              {/* Round Header */}
              <div className="mb-4 pb-2 border-b border-[#232f48] flex items-center justify-between">
                <div>
                  <h4 className="font-display font-bold text-sm text-white uppercase tracking-wider">
                    {roundTitle}
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {roundMatches.length} Match{roundMatches.length > 1 ? 'es' : ''}
                  </span>
                </div>
                {round === totalRounds && <Trophy className="w-5 h-5 text-amber-400" />}
              </div>

              {/* Matches list for this round */}
              <div className="space-y-4 flex flex-col justify-around h-full">
                {roundMatches.map((match) => {
                  const isFinished = match.matchStatus === 'FINAL' || match.matchStatus === 'FORFEIT';
                  const isAWinning = match.winnerTeamId && match.winnerTeamId === match.teamAId;
                  const isBWinning = match.winnerTeamId && match.winnerTeamId === match.teamBId;

                  return (
                    <div
                      key={match.id}
                      onClick={() => !match.isBye && onSelectMatch(match.id)}
                      className={`group relative rounded-xl border transition-all duration-200 overflow-hidden ${
                        match.isBye
                          ? 'bg-[#0f1420]/70 border-[#1a2336] opacity-75'
                          : 'bg-[#101726] border-[#22304d] hover:border-amber-500/60 hover:shadow-lg hover:shadow-amber-500/10 cursor-pointer'
                      }`}
                    >
                      {/* Top bar with match number and status */}
                      <div className="px-3 py-1.5 bg-[#0b101c] border-b border-[#1b263d] flex items-center justify-between">
                        <span className="text-[10px] font-mono text-slate-400">
                          M#{match.matchNumber} {match.isBye ? '• BYE MATCH' : ''}
                        </span>
                        {getStatusBadge(match)}
                      </div>

                      {/* Team A */}
                      <div
                        className={`px-3 py-2.5 flex items-center justify-between border-b border-[#182236] transition-colors ${
                          isAWinning ? 'bg-amber-500/10 font-bold' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden pr-2">
                          {match.teamALogo ? (
                            <img src={match.teamALogo} alt="" className="w-5 h-5 rounded object-cover border border-slate-700" />
                          ) : (
                            <div className="w-5 h-5 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-400">
                              A
                            </div>
                          )}
                          <span className={`text-xs truncate ${match.teamAName ? 'text-white' : 'text-slate-500 italic'}`}>
                            {match.teamAName || 'TBD'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {match.finalScoreA !== null && match.finalScoreA !== undefined && (
                            <span className="text-xs font-mono font-bold text-amber-300">
                              {match.finalScoreA.toFixed(2)}
                            </span>
                          )}
                          {isAWinning && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                      </div>

                      {/* Team B */}
                      <div
                        className={`px-3 py-2.5 flex items-center justify-between transition-colors ${
                          isBWinning ? 'bg-amber-500/10 font-bold' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden pr-2">
                          {match.teamBLogo ? (
                            <img src={match.teamBLogo} alt="" className="w-5 h-5 rounded object-cover border border-slate-700" />
                          ) : (
                            <div className="w-5 h-5 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] text-slate-400">
                              B
                            </div>
                          )}
                          <span className={`text-xs truncate ${match.teamBName ? 'text-white' : 'text-slate-500 italic'}`}>
                            {match.teamBName || (match.isBye ? 'BYE (Auto-Advance)' : 'TBD')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {match.finalScoreB !== null && match.finalScoreB !== undefined && (
                            <span className="text-xs font-mono font-bold text-amber-300">
                              {match.finalScoreB.toFixed(2)}
                            </span>
                          )}
                          {isBWinning && <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />}
                        </div>
                      </div>

                      {/* Action footer */}
                      {!match.isBye && (
                        <div className="px-3 py-1.5 bg-[#0b101c] border-t border-[#1b263d] flex items-center justify-between text-[10px] text-slate-400 group-hover:text-amber-300">
                          <span>Enter Dedicated Match Room</span>
                          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
