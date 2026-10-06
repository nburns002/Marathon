import React, { useState } from 'react';
import {
  BookOpen,
  Crosshair,
  DollarSign,
  Users,
  Award,
  AlertTriangle,
  ShieldCheck,
  Clock,
  Sparkles,
  Zap
} from 'lucide-react';
import { calculateRunScore } from '../../server/scoring';

export const RulesPage: React.FC = () => {
  // Mini interactive calculator for practice on the rules page
  const [kills, setKills] = useState<number>(4);
  const [loot, setLoot] = useState<number>(36000);
  const [survivors, setSurvivors] = useState<0 | 1 | 2 | 3>(3);
  const [obj, setObj] = useState<boolean>(true);

  const calc = calculateRunScore({
    runnerKills: kills,
    extractedCredits: loot,
    playersExtracted: survivors,
    objectiveCompleted: obj,
    objectivePointsValue: 5
  });

  return (
    <div className="max-w-4xl mx-auto space-y-12">
      {/* Header */}
      <div className="pb-6 border-b border-[#1f2b42]">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono mb-3">
          <BookOpen className="w-3.5 h-3.5" />
          <span>OFFICIAL COMPETITIVE RULEBOOK & SCORING STANDARD</span>
        </div>
        <h1 className="text-3xl font-display font-extrabold text-white uppercase tracking-wider">
          Marathon Cryo Archive Score Race Rules
        </h1>
        <p className="text-slate-400 text-sm mt-2 leading-relaxed">
          Standardized competitive guidelines governing all head-to-head score racing tournaments. Designed for public matchmaking extraction shooters where teams compete independently for highest aggregate performance.
        </p>
      </div>

      {/* Section 1: Scoring Architecture */}
      <section className="p-8 rounded-3xl bg-[#0f1624] border border-[#1f2b42] space-y-6 shadow-xl">
        <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <span>1. The Scoring Engine Formula</span>
        </h2>

        <div className="p-4 rounded-xl bg-[#0a0e17] border border-amber-500/40 font-mono text-xs text-slate-200 space-y-1.5">
          <div className="text-amber-400 font-bold text-sm">
            Final Run Score = (Kill Points + Loot Points + Objective Points) × Survival Multiplier
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div className="p-4 rounded-xl bg-[#131b2c] border border-[#1e2a42]">
            <div className="text-slate-300 font-bold flex items-center gap-1.5 mb-1">
              <Crosshair className="w-4 h-4 text-red-400" /> Runner Eliminations (5 pts ea)
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Confirmed kills on enemy player Runners in the public lobby. AI bot/environment kills award 0 points.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#131b2c] border border-[#1e2a42]">
            <div className="text-slate-300 font-bold flex items-center gap-1.5 mb-1">
              <DollarSign className="w-4 h-4 text-emerald-400" /> Extracted Credits (1 pt / 3k)
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Total credit value brought back to safety. Completely uncapped. 30,000 cr = 10.00 pts, 60,000 cr = 20.00 pts.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#131b2c] border border-[#1e2a42]">
            <div className="text-slate-300 font-bold flex items-center gap-1.5 mb-1">
              <Users className="w-4 h-4 text-cyan-400" /> 1.20× Squad Extraction Bonus
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Extracting all 3 squad members grants a +20% boost to the entire run's total score. Partial extractions (1 or 2 players) receive a 1.00× multiplier.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#131b2c] border border-[#1e2a42]">
            <div className="text-red-400 font-bold flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-4 h-4" /> Full Squad Wipe = 0 pts
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              If all 3 players die before extracting, the run is worth 0 points. Greed is punished; extraction is mandatory.
            </p>
          </div>
        </div>

        {/* Interactive Practice Calculator */}
        <div className="p-5 rounded-2xl bg-[#0b101c] border border-[#1d2942] space-y-4">
          <div className="text-xs font-display font-bold text-amber-300 uppercase tracking-wider">
            Interactive Scoring Calculator Simulator
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Runner Kills</label>
              <input
                type="number"
                min="0"
                value={kills}
                onChange={(e) => setKills(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2 py-1.5 rounded bg-[#141c2c] border border-[#23314c] text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Extracted Credits</label>
              <input
                type="number"
                min="0"
                step="3000"
                value={loot}
                onChange={(e) => setLoot(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 rounded bg-[#141c2c] border border-[#23314c] text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Players Extracted</label>
              <select
                value={survivors}
                onChange={(e) => setSurvivors(Number(e.target.value) as 0 | 1 | 2 | 3)}
                className="w-full px-2 py-1.5 rounded bg-[#141c2c] border border-[#23314c] text-white"
              >
                <option value={3}>3/3 (1.20×)</option>
                <option value={2}>2/3 (1.00×)</option>
                <option value={1}>1/3 (1.00×)</option>
                <option value={0}>0/3 Wipe (0 pts)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-1">Objective (+5 pts)</label>
              <select
                value={obj ? 'yes' : 'no'}
                onChange={(e) => setObj(e.target.value === 'yes')}
                className="w-full px-2 py-1.5 rounded bg-[#141c2c] border border-[#23314c] text-white"
              >
                <option value="yes">Completed</option>
                <option value="no">Failed</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-[#1a253a] flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">Calculated Breakdown: {calc.breakdownString}</span>
            <span className="text-base font-bold text-amber-300">
              Run Score: {calc.finalRunScore.toFixed(2)} PTS
            </span>
          </div>
        </div>
      </section>

      {/* Section 2: Match Lifecycles & Timers */}
      <section className="p-8 rounded-3xl bg-[#0f1624] border border-[#1f2b42] space-y-4 shadow-xl">
        <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-5 h-5 text-amber-400" />
          <span>2. Matchroom Protocols & Authoritative Timers</span>
        </h2>

        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <div className="p-3.5 rounded-xl bg-[#131b2c] border border-[#1e2a42]">
            <strong className="text-white">10-Minute Ready Check:</strong> Once a matchup is scheduled, both captains have 10 minutes to click Ready. If Captain A is ready and Captain B fails to check in within 10 minutes, Team B is automatically forfeited. If neither team checks in, both are forfeited.
          </div>
          <div className="p-3.5 rounded-xl bg-[#131b2c] border border-[#1e2a42]">
            <strong className="text-white">75-Minute Match Window:</strong> Starts immediately upon second captain check-in. Teams must complete both Cryo Archive runs and report scores before the window expires.
          </div>
          <div className="p-3.5 rounded-xl bg-[#131b2c] border border-[#1e2a42]">
            <strong className="text-white">10-Minute Dispute Review Window:</strong> Following Run 2 submission by both teams, a 10-minute confirmation window begins. If neither team files a dispute, the match automatically finalizes and advances the winner.
          </div>
        </div>
      </section>

      {/* Section 3: Authoritative Tiebreaker Hierarchy */}
      <section className="p-8 rounded-3xl bg-[#0f1624] border border-[#1f2b42] space-y-4 shadow-xl">
        <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-400" />
          <span>3. Authoritative Tiebreaker Hierarchy</span>
        </h2>

        <p className="text-xs text-slate-400">
          In the event that both teams have identical aggregate 2-run scores, the tournament engine resolves the victor strictly using the following mathematical sequence:
        </p>

        <ol className="list-decimal list-inside space-y-2 font-mono text-xs text-slate-300">
          <li className="p-2.5 rounded-lg bg-[#121929] border border-[#1c273d]">
            <strong className="text-amber-300">1. Full Squad Extractions:</strong> Team with the highest number of 3-player extractions (2 &gt; 1 &gt; 0).
          </li>
          <li className="p-2.5 rounded-lg bg-[#121929] border border-[#1c273d]">
            <strong className="text-amber-300">2. Aggregate Runner Kills:</strong> Highest combined enemy player eliminations across both runs.
          </li>
          <li className="p-2.5 rounded-lg bg-[#121929] border border-[#1c273d]">
            <strong className="text-amber-300">3. Total Extracted Credits:</strong> Total accumulated credits extracted across both runs.
          </li>
          <li className="p-2.5 rounded-lg bg-[#121929] border border-[#1c273d]">
            <strong className="text-amber-300">4. Highest Peak Single Run:</strong> Team with the highest individual run score.
          </li>
          <li className="p-2.5 rounded-lg bg-[#121929] border border-[#1c273d]">
            <strong className="text-amber-300">5. Featured Objective Total:</strong> Highest number of completed featured objectives.
          </li>
        </ol>
      </section>

      {/* Section 4: Public Lobby Competitive Integrity */}
      <section className="p-8 rounded-3xl bg-[#0f1624] border border-[#1f2b42] space-y-4 shadow-xl">
        <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>4. Competitive Integrity & Evidence Mandate</span>
        </h2>

        <ul className="list-disc list-inside space-y-2 text-xs text-slate-300 leading-relaxed">
          <li><strong>Roster Snapshot Rule:</strong> All 3 players must play on the exact Bungie IDs snapshotted during registration. Subbing unregistered accounts is an automatic disqualification.</li>
          <li><strong>VOD / Screenshot Requirement:</strong> Captains must maintain VODs or end-screen screenshots for all submitted runs in case of dispute investigation.</li>
          <li><strong>Zero Teaming / Match Fixing:</strong> Colluding with other squads in public matchmaking is permanently logged and results in immediate tournament ban and prize forfeiture.</li>
        </ul>
      </section>
    </div>
  );
};
