import React, { useState, useMemo } from 'react';
import { X, Calculator, ShieldAlert, CheckCircle2, Crosshair, DollarSign, Users, Award, ExternalLink } from 'lucide-react';

interface ScoreCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitScore: (data: {
    runNumber: 1 | 2;
    runnerKills: number;
    extractedCredits: number;
    playersExtracted: 0 | 1 | 2 | 3;
    objectiveCompleted: boolean;
    evidenceUrl?: string;
  }) => Promise<{ success: boolean; error?: string } | void>;
  defaultRunNumber?: 1 | 2;
  featuredObjectiveTitle?: string;
  featuredObjectivePoints?: number;
  teamName?: string;
}

export const ScoreCalculatorModal: React.FC<ScoreCalculatorModalProps> = ({
  isOpen,
  onClose,
  onSubmitScore,
  defaultRunNumber = 1,
  featuredObjectiveTitle = 'Core Data Terminal Extraction',
  featuredObjectivePoints = 5,
  teamName = 'Your Team'
}) => {
  const [runNumber, setRunNumber] = useState<1 | 2>(defaultRunNumber);
  const [runnerKills, setRunnerKills] = useState<number>(5);
  const [extractedCredits, setExtractedCredits] = useState<number>(45000);
  const [playersExtracted, setPlayersExtracted] = useState<0 | 1 | 2 | 3>(3);
  const [objectiveCompleted, setObjectiveCompleted] = useState<boolean>(true);
  const [evidenceUrl, setEvidenceUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Synchronized Live Calculation
  const calculation = useMemo(() => {
    const kills = Math.max(0, Number(runnerKills) || 0);
    const loot = Math.max(0, Number(extractedCredits) || 0);
    const killPts = kills * 5;
    const lootPts = Number((loot / 3000).toFixed(2));
    const objPts = objectiveCompleted ? featuredObjectivePoints : 0;
    const base = Number((killPts + lootPts + objPts).toFixed(2));

    let mult = 1.0;
    let finalScore = 0;

    if (playersExtracted === 3) {
      mult = 1.2;
      finalScore = Number((base * 1.2).toFixed(2));
    } else if (playersExtracted === 1 || playersExtracted === 2) {
      mult = 1.0;
      finalScore = Number(base.toFixed(2));
    } else {
      mult = 0.0;
      finalScore = 0.0;
    }

    const commandString = `/score run${runNumber} kills:${kills} loot:${loot} survived:${playersExtracted} objective:${objectiveCompleted ? 'yes' : 'no'}`;

    return {
      killPts,
      lootPts,
      objPts,
      base,
      mult,
      finalScore,
      commandString
    };
  }, [runnerKills, extractedCredits, playersExtracted, objectiveCompleted, featuredObjectivePoints, runNumber]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await onSubmitScore({
        runNumber,
        runnerKills,
        extractedCredits,
        playersExtracted,
        objectiveCompleted,
        evidenceUrl: evidenceUrl.trim() || undefined
      });
      if (res && res.success === false) {
        setError(res.error || 'Failed to submit score.');
        return;
      }
      onClose();
    } catch (err: any) {
      console.error('Score submission error:', err);
      setError(err?.message || 'Failed to submit score.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0d1320] border border-[#24334f] rounded-2xl shadow-2xl p-6 my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#1c273d] mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-display font-bold text-white uppercase tracking-wider">
                Official Score Submission & Calculator
              </h3>
              <p className="text-xs text-slate-400">
                Reporting official score for <span className="text-amber-300 font-semibold">{teamName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Run Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
              Select Official Run
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRunNumber(1)}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 border ${
                  runNumber === 1
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-[#141d2f] text-slate-300 border-[#24334f] hover:bg-[#1a253b]'
                }`}
              >
                <span>Cryo Archive Run 1</span>
              </button>
              <button
                type="button"
                onClick={() => setRunNumber(2)}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 border ${
                  runNumber === 2
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                    : 'bg-[#141d2f] text-slate-300 border-[#24334f] hover:bg-[#1a253b]'
                }`}
              >
                <span>Cryo Archive Run 2</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Runner Eliminations */}
            <div className="p-4 rounded-xl bg-[#121929] border border-[#1f2b44]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Crosshair className="w-4 h-4 text-red-400" />
                  Enemy Runner Eliminations
                </label>
                <span className="text-[11px] font-mono text-amber-400">5 pts each</span>
              </div>
              <input
                type="number"
                min="0"
                max="30"
                value={runnerKills}
                onChange={(e) => setRunnerKills(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-lg bg-[#182238] border border-[#2b3b5c] text-white font-mono text-base focus:outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-slate-400 mt-1.5">
                Confirmed enemy player Runner eliminations only. AI/PvE kills award 0 pts.
              </p>
            </div>

            {/* Extracted Credits */}
            <div className="p-4 rounded-xl bg-[#121929] border border-[#1f2b44]">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  Extracted Credit Value
                </label>
                <span className="text-[11px] font-mono text-emerald-400">1 pt / 3,000 credits</span>
              </div>
              <input
                type="number"
                min="0"
                step="500"
                value={extractedCredits}
                onChange={(e) => setExtractedCredits(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg bg-[#182238] border border-[#2b3b5c] text-white font-mono text-base focus:outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-slate-400 mt-1.5">
                Uncapped loot scoring. E.g. 45,000 credits = {Number((extractedCredits / 3000).toFixed(2))} loot points.
              </p>
            </div>
          </div>

          {/* Survival / Extraction Multiplier Selector */}
          <div className="p-4 rounded-xl bg-[#121929] border border-[#1f2b44]">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-cyan-400" />
                Team Extraction & Survival Multiplier
              </label>
              <span className="text-[11px] font-mono text-cyan-400">
                {playersExtracted === 3 ? '1.20× Full Squad Bonus' : playersExtracted === 0 ? '0.00× Wipe Rule' : '1.00× Partial Extraction'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { count: 3, label: '3/3 Extracted', sub: '×1.20 Multiplier', color: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' },
                { count: 2, label: '2/3 Extracted', sub: '×1.00 Multiplier', color: 'border-slate-600 bg-slate-800/40 text-slate-300' },
                { count: 1, label: '1/3 Extracted', sub: '×1.00 Multiplier', color: 'border-slate-600 bg-slate-800/40 text-slate-300' },
                { count: 0, label: '0/3 Squad Wipe', sub: '0 pts (Zero Run)', color: 'border-red-500/50 bg-red-500/10 text-red-400' }
              ].map((opt) => (
                <button
                  key={opt.count}
                  type="button"
                  onClick={() => setPlayersExtracted(opt.count as 0 | 1 | 2 | 3)}
                  className={`p-2.5 rounded-lg border text-center transition-all ${
                    playersExtracted === opt.count
                      ? `${opt.color} ring-2 ring-amber-400 font-bold shadow-md`
                      : 'bg-[#151e31] border-[#222e46] text-slate-400 hover:bg-[#1a253d]'
                  }`}
                >
                  <div className="text-xs font-bold">{opt.label}</div>
                  <div className="text-[10px] opacity-80 mt-0.5">{opt.sub}</div>
                </button>
              ))}
            </div>
            {playersExtracted === 0 && (
              <div className="mt-2.5 p-2 rounded bg-red-950/40 border border-red-500/30 text-[11px] text-red-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                <span>
                  <strong>Full Squad Wipe Rule:</strong> In extraction shooters, dying in the zone yields zero tournament equity. All kill and loot points for this run become 0.
                </span>
              </div>
            )}
          </div>

          {/* Featured Objective Checkbox */}
          <div className="p-3.5 rounded-xl bg-[#121929] border border-[#1f2b44] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Award className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-white">{featuredObjectiveTitle}</div>
                <div className="text-[10px] text-slate-400">Featured Round Objective (+{featuredObjectivePoints} pts)</div>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={objectiveCompleted}
                onChange={(e) => setObjectiveCompleted(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
            </label>
          </div>

          {/* Evidence / VOD Link */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Evidence Link / Twitch VOD / Screenshot URL (Required for verification)
            </label>
            <div className="relative">
              <ExternalLink className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="url"
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://twitch.tv/videos/... or https://youtube.com/watch?v=..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#141c2c] border border-[#23304a] text-xs text-white focus:outline-none focus:border-amber-400 placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Real-time Calculation Breakdown Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#162138] to-[#0e1626] border border-amber-500/40 shadow-inner">
            <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400 mb-2 flex items-center justify-between">
              <span>Transparent Score Calculation</span>
              <span>RUN {runNumber}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono mb-3">
              <div className="p-2 rounded bg-[#0b101c] border border-[#1d2942]">
                <div className="text-[10px] text-slate-400">Kill Points</div>
                <div className="text-sm font-bold text-white">{calculation.killPts} pts</div>
              </div>
              <div className="p-2 rounded bg-[#0b101c] border border-[#1d2942]">
                <div className="text-[10px] text-slate-400">Loot Points</div>
                <div className="text-sm font-bold text-white">{calculation.lootPts} pts</div>
              </div>
              <div className="p-2 rounded bg-[#0b101c] border border-[#1d2942]">
                <div className="text-[10px] text-slate-400">Objective</div>
                <div className="text-sm font-bold text-white">{calculation.objPts} pts</div>
              </div>
              <div className="p-2 rounded bg-[#0b101c] border border-[#1d2942]">
                <div className="text-[10px] text-slate-400">Multiplier</div>
                <div className={`text-sm font-bold ${calculation.mult === 1.2 ? 'text-emerald-400' : calculation.mult === 0 ? 'text-red-400' : 'text-slate-200'}`}>
                  {calculation.mult.toFixed(2)}×
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#1f2c46]">
              <div>
                <span className="text-xs text-slate-400">Base Score: {calculation.base.toFixed(2)} × {calculation.mult.toFixed(2)} =</span>
                <div className="text-xl font-display font-bold text-amber-300">
                  FINAL RUN {runNumber} SCORE: {calculation.finalScore.toFixed(2)}
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-display font-bold uppercase tracking-wider text-xs shadow-lg shadow-amber-500/25 transition-all disabled:opacity-50"
              >
                {submitting ? 'Locking Score...' : `Submit Run ${runNumber} Score`}
              </button>
            </div>

            <div className="mt-2 text-[10px] text-slate-500 font-mono">
              Equivalent Chat Command: <code className="text-amber-300/80">{calculation.commandString}</code>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
