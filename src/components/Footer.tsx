import React from 'react';
import { ShieldCheck, Swords, AlertTriangle } from 'lucide-react';

interface FooterProps {
  setCurrentTab: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentTab }) => {
  return (
    <footer className="bg-[#080b11] border-t border-[#1a2233] mt-20 text-slate-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <Swords className="w-4 h-4" />
              </div>
              <span className="font-display font-bold text-white text-base tracking-wider">MARATHON CRYO CUP</span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed max-w-md">
              The premier automated head-to-head score racing tournament platform for Marathon. Two teams. Two Cryo Archive runs. Independent public matchmaking. Highest combined score advances.
            </p>
            <div className="mt-4 flex items-center gap-2 p-2.5 rounded-lg bg-[#0e1422] border border-[#1e2a42] text-[11px] text-slate-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong>Unofficial Community Platform:</strong> This tournament platform is an independent esports organizer and is not affiliated with, authorized, or endorsed by Bungie, Inc.
              </span>
            </div>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider mb-3">
              Tournament Engine
            </h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => setCurrentTab('tournaments')} className="hover:text-amber-300 transition-colors">
                  Live Tournaments
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('rules')} className="hover:text-amber-300 transition-colors">
                  Scoring & Multipliers
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('rules')} className="hover:text-amber-300 transition-colors">
                  Tiebreaker Hierarchy
                </button>
              </li>
              <li>
                <button onClick={() => setCurrentTab('rules')} className="hover:text-amber-300 transition-colors">
                  Competitive Integrity
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-display font-semibold text-white uppercase text-xs tracking-wider mb-3">
              Compliance & Rules
            </h4>
            <ul className="space-y-2 text-[11px]">
              <li>
                <span className="text-slate-300">Format:</span> 3-Player Public Score Race
              </li>
              <li>
                <span className="text-slate-300">Runs per Matchup:</span> 2 Runs
              </li>
              <li>
                <span className="text-slate-300">Timer:</span> 10m Ready / 75m Match
              </li>
              <li>
                <span className="text-slate-300">Dispute Review:</span> 10m Auto-Finalization
              </li>
              <li className="pt-2">
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Roster Bungie ID Snapshot Locked
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-[#171f30] flex flex-col sm:flex-row items-center justify-between text-slate-500 text-[11px]">
          <p>© {new Date().getFullYear()} Marathon Tournament System. All rights reserved.</p>
          <div className="flex gap-4 mt-2 sm:mt-0 font-mono">
            <span>Automate normal matches. Escalate exceptions.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
