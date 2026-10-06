import React, { useState, useEffect, useRef } from 'react';
import {
  Swords,
  Timer,
  CheckCircle2,
  AlertTriangle,
  Send,
  HelpCircle,
  Flag,
  Crosshair,
  DollarSign,
  Users,
  Shield,
  Clock,
  Eye,
  EyeOff,
  Calculator,
  Lock,
  MessageSquare,
  Sparkles,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Match, MatchMessage, MatchDispute, User } from '../types';
import { ScoreCalculatorModal } from '../components/ScoreCalculatorModal';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';

interface MatchRoomPageProps {
  initialMatchId?: string;
  onBackToTournament?: (tournamentId: string) => void;
}

export const MatchRoomPage: React.FC<MatchRoomPageProps> = ({
  initialMatchId,
  onBackToTournament
}) => {
  const { user, token, primaryTeam, userTeams } = useAuth();
  const { subscribe } = useRealtime();

  const [matchId, setMatchId] = useState<string>(initialMatchId || 'match-1');
  const [match, setMatch] = useState<Match | null>(null);
  const [messages, setMessages] = useState<MatchMessage[]>([]);
  const [disputes, setDisputes] = useState<MatchDispute[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  // Chat input
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Score Calculator Modal
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [activeScoreRunNum, setActiveScoreRunNum] = useState<1 | 2>(1);

  // Flag Dispute Modal
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState('');
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);

  // Request Admin Modal
  const [showAdminTicketModal, setShowAdminTicketModal] = useState(false);
  const [ticketCategory, setTicketCategory] = useState<'SCORE_DISCREPANCY' | 'RULE_VIOLATION' | 'OPPONENT_NO_SHOW' | 'TECHNICAL_DISCONNECTION' | 'OTHER'>('SCORE_DISCREPANCY');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  // Admin Override Modal
  const [showAdminOverrideModal, setShowAdminOverrideModal] = useState(false);
  const [overrideTeamId, setOverrideTeamId] = useState('');
  const [overrideRunNum, setOverrideRunNum] = useState<1 | 2>(1);
  const [overrideKills, setOverrideKills] = useState<number>(0);
  const [overrideLoot, setOverrideLoot] = useState<number>(0);
  const [overrideSurvivors, setOverrideSurvivors] = useState<0 | 1 | 2 | 3>(3);
  const [overrideObj, setOverrideObj] = useState<boolean>(true);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideSubmitting, setOverrideSubmitting] = useState<boolean>(false);

  // In-app notifications & Declare Winner Modal State
  const [roomNotification, setRoomNotification] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [declareWinnerModal, setDeclareWinnerModal] = useState<{
    show: boolean;
    teamId: string;
    teamName: string;
    reason: string;
    submitting: boolean;
  } | null>(null);

  const showBanner = (message: string, type: 'error' | 'success' = 'error') => {
    setRoomNotification({ type, message });
    setTimeout(() => {
      setRoomNotification((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  // Synchronized Timers State
  const [timeLeftStr, setTimeLeftStr] = useState<string>('');
  const [disputeTimeLeftStr, setDisputeTimeLeftStr] = useState<string>('');

  const fetchMatchData = async (targetId: string) => {
    try {
      const res = await fetch(`/api/matches/${targetId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setMatch(data.match);
        setMessages(data.messages || []);
        setDisputes(data.disputes || []);
      }
    } catch (err) {
      console.error('Error fetching match:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllMatches = async () => {
    try {
      const res = await fetch('/api/matches', {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setAllMatches(data.matches || []);
      }
    } catch (err) {
      console.error('Error fetching match list:', err);
    }
  };

  useEffect(() => {
    fetchAllMatches();
  }, []);

  useEffect(() => {
    if (matchId) {
      fetchMatchData(matchId);
    }
    const unsub = subscribe('*', () => {
      if (matchId) fetchMatchData(matchId);
    });
    return unsub;
  }, [matchId]);

  // Auto-scroll chat on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Authoritative countdown timer loop
  useEffect(() => {
    const interval = setInterval(() => {
      if (!match) return;

      // 0. Intermission Timer
      if (match.matchStatus === 'WAITING_FOR_ROUND' && match.intermissionDeadlineAt) {
        const diff = new Date(match.intermissionDeadlineAt).getTime() - Date.now();
        if (diff <= 0) {
          setTimeLeftStr('00:00 (Intermission Ending)');
        } else {
          const m = Math.floor(diff / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          setTimeLeftStr(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        }
      }

      // 1. Ready Check Timer
      else if (match.matchStatus === 'READY_CHECK' && match.readyDeadlineAt) {
        const diff = new Date(match.readyDeadlineAt).getTime() - Date.now();
        if (diff <= 0) {
          setTimeLeftStr('00:00 (EXPIRED)');
        } else {
          const m = Math.floor(diff / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          setTimeLeftStr(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        }
      }

      // 2. Active Match Window Timer (75 min)
      else if (
        (match.matchStatus === 'ACTIVE' || match.matchStatus === 'RUN_1_PARTIAL' || match.matchStatus === 'RUN_1_COMPLETE') &&
        match.matchDeadlineAt
      ) {
        const diff = new Date(match.matchDeadlineAt).getTime() - Date.now();
        if (diff <= 0) {
          setTimeLeftStr('00:00 (EXPIRED)');
        } else {
          const m = Math.floor(diff / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          setTimeLeftStr(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        }
      } else {
        setTimeLeftStr('');
      }

      // 3. Dispute Window Timer (10 min)
      if (match.matchStatus === 'RESULT_PENDING' && match.disputeDeadlineAt) {
        const diff = new Date(match.disputeDeadlineAt).getTime() - Date.now();
        if (diff <= 0) {
          setDisputeTimeLeftStr('00:00 (Finalizing)');
        } else {
          const m = Math.floor(diff / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          setDisputeTimeLeftStr(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        }
      } else {
        setDisputeTimeLeftStr('');
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [match]);

  if (loading || !match) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-mono text-slate-400">Loading Tactical Match Room...</p>
        </div>
      </div>
    );
  }

  // Permissions & User Context
  const isCaptainA = match.teamACaptainId === user?.id || userTeams.some((t) => t.id === match.teamAId && t.captainUserId === user?.id);
  const isCaptainB = match.teamBCaptainId === user?.id || userTeams.some((t) => t.id === match.teamBId && t.captainUserId === user?.id);
  const isTeamA = isCaptainA || userTeams.some((t) => t.id === match.teamAId);
  const isTeamB = isCaptainB || userTeams.some((t) => t.id === match.teamBId);
  const isCaptain = isCaptainA || isCaptainB;
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  const userTeamId = isTeamA ? match.teamAId : isTeamB ? match.teamBId : null;

  // Run Visibility Logic (Hidden Run 1 opponent score until both teams submit)
  const isRun1Complete = Boolean(match.teamARun1 && match.teamBRun1);

  // Lead / Deficit Calculations heading into Run 2
  const run1ScoreA = match.teamARun1?.finalRunScore || 0;
  const run1ScoreB = match.teamBRun1?.finalRunScore || 0;
  const run1Diff = Number((run1ScoreA - run1ScoreB).toFixed(2));

  // Ready Check Handler
  const handleReadyCheck = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/matches/${match.id}/ready`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json();
        showBanner(data.error || 'Failed to check in for Ready Check.');
      } else {
        showBanner('Ready Check successful!', 'success');
        fetchMatchData(match.id);
      }
    } catch (err: any) {
      console.error('Ready check error:', err);
      showBanner(err.message || 'Network error during Ready Check.');
    }
  };

  // Chat Message & Chat Command Sender
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !token) return;

    setChatSending(true);
    const content = chatInput;
    setChatInput('');

    try {
      const res = await fetch(`/api/matches/${match.id}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: content })
      });
      if (!res.ok) {
        const data = await res.json();
        showBanner(data.error || 'Failed to send message.');
      } else {
        fetchMatchData(match.id);
      }
    } catch (err: any) {
      console.error('Send message error:', err);
      showBanner(err.message || 'Network error sending chat.');
    } finally {
      setChatSending(false);
    }
  };

  // Submit Score via Modal
  const handleScoreSubmit = async (scoreData: {
    runNumber: 1 | 2;
    runnerKills: number;
    extractedCredits: number;
    playersExtracted: 0 | 1 | 2 | 3;
    objectiveCompleted: boolean;
    evidenceUrl?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!token) {
      const err = 'Authentication required to submit official score.';
      showBanner(err);
      return { success: false, error: err };
    }
    try {
      const res = await fetch(`/api/matches/${match.id}/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(scoreData)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = data.error || 'Failed to submit score.';
        showBanner(err);
        return { success: false, error: err };
      } else {
        setShowScoreModal(false);
        showBanner(`Run ${scoreData.runNumber} score submitted successfully!`, 'success');
        fetchMatchData(match.id);
        return { success: true };
      }
    } catch (err: any) {
      console.error('Score submission error:', err);
      const errMsg = err?.message || 'Network error submitting score.';
      showBanner(errMsg);
      return { success: false, error: errMsg };
    }
  };

  // Submit Dispute
  const handleDisputeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeReason.trim() || !token) return;
    setDisputeSubmitting(true);
    try {
      const res = await fetch(`/api/matches/${match.id}/dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: disputeReason, description: disputeReason, evidenceUrl: disputeEvidence })
      });
      if (!res.ok) {
        const data = await res.json();
        showBanner(data.error || 'Failed to submit dispute.');
      } else {
        setShowDisputeModal(false);
        setDisputeReason('');
        setDisputeEvidence('');
        showBanner('Dispute flagged. Match frozen for Referee review.', 'success');
        fetchMatchData(match.id);
      }
    } catch (err: any) {
      console.error('Dispute submission error:', err);
      showBanner(err.message || 'Network error submitting dispute.');
    } finally {
      setDisputeSubmitting(false);
    }
  };

  // Request Admin Ticket
  const handleAdminTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketDescription.trim() || !token) return;
    setTicketSubmitting(true);
    try {
      const res = await fetch(`/api/matches/${match.id}/request-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ category: ticketCategory, description: ticketDescription })
      });
      if (!res.ok) {
        const data = await res.json();
        showBanner(data.error || 'Failed to request referee.');
      } else {
        setShowAdminTicketModal(false);
        setTicketDescription('');
        showBanner('Referee ticket dispatched.', 'success');
        fetchMatchData(match.id);
      }
    } catch (err: any) {
      console.error('Ticket submission error:', err);
      showBanner(err.message || 'Network error submitting ticket.');
    } finally {
      setTicketSubmitting(false);
    }
  };

  // Admin Controls
  const handleAdminTimerControl = async (action: 'EXTEND_15_MIN' | 'RESTART_READY_CHECK' | 'REVERSE_FORFEIT') => {
    if (!token) return;
    const res = await fetch(`/api/admin/matches/${match.id}/control-timer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ action, reason: 'Administrative command' })
    });
    const data = await res.json();
    if (!res.ok) {
      showBanner(data.error || 'Admin timer control failed.');
    } else {
      showBanner('Timer control executed successfully.', 'success');
      fetchMatchData(match.id);
    }
  };

  const handleAdminScoreOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !overrideReason.trim()) return;
    setOverrideSubmitting(true);
    try {
      const res = await fetch(`/api/admin/matches/${match.id}/override-score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          teamId: overrideTeamId,
          runNumber: overrideRunNum,
          runnerKills: overrideKills,
          extractedCredits: overrideLoot,
          playersExtracted: overrideSurvivors,
          objectiveCompleted: overrideObj,
          reason: overrideReason
        })
      });
      const data = await res.json();
      if (!res.ok) {
        showBanner(data.error || 'Score override failed.');
      } else {
        setShowAdminOverrideModal(false);
        showBanner('Score override applied and audited.', 'success');
        fetchMatchData(match.id);
      }
    } catch (err: any) {
      console.error('Override error:', err);
      showBanner(err.message || 'Network error during override.');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleOpenDeclareWinner = (winnerTeamId: string) => {
    const teamName = winnerTeamId === match.teamAId ? (match.teamAName || 'Team A') : (match.teamBName || 'Team B');
    setDeclareWinnerModal({
      show: true,
      teamId: winnerTeamId,
      teamName,
      reason: '',
      submitting: false
    });
  };

  const handleConfirmDeclareWinner = async () => {
    if (!declareWinnerModal || !declareWinnerModal.reason.trim() || !token) return;
    setDeclareWinnerModal((prev) => (prev ? { ...prev, submitting: true } : null));
    try {
      const res = await fetch(`/api/admin/matches/${match.id}/override-winner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ winnerTeamId: declareWinnerModal.teamId, reason: declareWinnerModal.reason.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        showBanner(data.error || 'Failed to declare winner.');
      } else {
        showBanner(`Winner declared: ${declareWinnerModal.teamName}`, 'success');
        setDeclareWinnerModal(null);
        fetchMatchData(match.id);
      }
    } catch (err: any) {
      showBanner(err.message || 'Network error declaring winner.');
    } finally {
      setDeclareWinnerModal((prev) => (prev ? { ...prev, submitting: false } : null));
    }
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Status / Alert Banner */}
      {roomNotification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
            roomNotification.type === 'error'
              ? 'bg-red-500/15 border-red-500/40 text-red-300'
              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            {roomNotification.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            )}
            <span>{roomNotification.message}</span>
          </div>
          <button
            onClick={() => setRoomNotification(null)}
            className="text-xs font-mono opacity-70 hover:opacity-100 px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Match Bar & Quick Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1f2b42]">
        <div className="flex items-center gap-3">
          {onBackToTournament && (
            <button
              onClick={() => onBackToTournament(match.tournamentId)}
              className="px-3 py-1.5 rounded-lg bg-[#121929] border border-[#1f2b42] text-xs text-slate-300 hover:text-white transition-colors"
            >
              ← Bracket
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-amber-400 font-bold uppercase">
                {match.tournamentName}
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs font-mono text-slate-300">
                Round {match.round} • Match #{match.matchNumber}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-white uppercase tracking-wider">
              {match.teamAName} <span className="text-amber-400">VS</span> {match.teamBName}
            </h1>
          </div>
        </div>

        {/* Match Select Dropdown */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Switch Match:</span>
          <select
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-[#121929] border border-[#202d46] text-xs font-mono text-white focus:outline-none focus:border-amber-400"
          >
            {allMatches.map((m) => (
              <option key={m.id} value={m.id}>
                M#{m.matchNumber}: {m.teamAName} vs {m.teamBName} ({m.matchStatus})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Synchronized Match Status Banner & Clock Header */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#111827] via-[#0d1320] to-[#111827] border border-[#22304d] shadow-2xl relative overflow-hidden">
        {/* Glowing background accent */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-24 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Team A Box */}
          <div className={`flex items-center gap-4 flex-1 ${match.winnerTeamId === match.teamAId ? 'text-amber-400 font-bold' : ''}`}>
            {match.teamALogo ? (
              <img src={match.teamALogo} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-amber-500/40 shadow-lg" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-slate-800 border-2 border-amber-500/40 flex items-center justify-center font-display font-bold text-xl text-amber-400">
                A
              </div>
            )}
            <div>
              <div className="text-xs font-mono text-slate-400">TEAM ALPHA</div>
              <h2 className="text-lg font-display font-bold text-white">{match.teamAName}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded font-mono ${match.teamAReady ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'}`}>
                  {match.teamAReady ? '✓ READY' : 'NOT READY'}
                </span>
                {match.finalScoreA !== null && (
                  <span className="text-sm font-mono font-bold text-amber-300">
                    {match.finalScoreA.toFixed(2)} pts
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Central Authoritative Timer & Status Center */}
          <div className="flex flex-col items-center justify-center text-center px-6 py-3 rounded-2xl bg-[#090d16]/90 border border-[#1e2a42] min-w-[260px] shadow-inner">
            <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-1 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{match.matchStatus.replace(/_/g, ' ')}</span>
            </div>

            {timeLeftStr ? (
              <div className="text-3xl font-display font-black text-white tracking-widest font-mono-numbers">
                {timeLeftStr}
              </div>
            ) : disputeTimeLeftStr ? (
              <div className="text-2xl font-display font-black text-cyan-300 tracking-widest font-mono-numbers animate-pulse">
                {disputeTimeLeftStr}
              </div>
            ) : (
              <div className="text-lg font-display font-bold text-slate-300">
                {match.matchStatus === 'FINAL' ? 'MATCH FINAL' : 'STATUS LOCKED'}
              </div>
            )}

            <div className="text-[10px] text-slate-400 font-mono mt-1">
              {match.matchStatus === 'WAITING_FOR_ROUND' && match.intermissionDeadlineAt
                ? 'Round Intermission — Ready Check Pending'
                : match.matchStatus === 'READY_CHECK'
                ? '10-Min Captain Check-In Window'
                : match.matchStatus === 'RESULT_PENDING'
                ? '10-Min Dispute Review Window'
                : '75-Minute Official Match Window'}
            </div>
          </div>

          {/* Team B Box */}
          <div className={`flex items-center gap-4 flex-1 justify-end text-right ${match.winnerTeamId === match.teamBId ? 'text-amber-400 font-bold' : ''}`}>
            <div>
              <div className="text-xs font-mono text-slate-400">TEAM BRAVO</div>
              <h2 className="text-lg font-display font-bold text-white">{match.teamBName}</h2>
              <div className="flex items-center gap-2 mt-1 justify-end">
                {match.finalScoreB !== null && (
                  <span className="text-sm font-mono font-bold text-amber-300">
                    {match.finalScoreB.toFixed(2)} pts
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded font-mono ${match.teamBReady ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'}`}>
                  {match.teamBReady ? '✓ READY' : 'NOT READY'}
                </span>
              </div>
            </div>
            {match.teamBLogo ? (
              <img src={match.teamBLogo} alt="" className="w-14 h-14 rounded-xl object-cover border-2 border-amber-500/40 shadow-lg" />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-slate-800 border-2 border-amber-500/40 flex items-center justify-center font-display font-bold text-xl text-amber-400">
                B
              </div>
            )}
          </div>
        </div>

        {/* Ready Check Action Button Strip for Captains */}
        {match.matchStatus === 'READY_CHECK' && isCaptain && (
          <div className="mt-6 pt-4 border-t border-[#1a253a] flex items-center justify-center">
            {((isTeamA && !match.teamAReady) || (isTeamB && !match.teamBReady)) ? (
              <button
                onClick={handleReadyCheck}
                className="px-8 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-display font-bold text-sm uppercase tracking-wider shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2 animate-bounce"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>Captain Ready Check-In</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>You are checked in! Waiting for opponent captain...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Grid: Live Score Racing & Match Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Official Run Racing Dashboard */}
        <div className="lg:col-span-7 space-y-6">
          {/* Quick Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveScoreRunNum(1);
                  setShowScoreModal(true);
                }}
                disabled={!isCaptain || match.matchStatus === 'READY_CHECK' || match.matchStatus === 'FINAL'}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 flex items-center gap-1.5"
              >
                <Calculator className="w-4 h-4" />
                <span>Submit Run Score</span>
              </button>

              <button
                onClick={() => setShowDisputeModal(true)}
                disabled={match.matchStatus !== 'RESULT_PENDING' && match.matchStatus !== 'ACTIVE'}
                className="px-3 py-2 rounded-xl bg-[#182235] hover:bg-red-950/40 text-red-300 border border-red-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Flag Result / Dispute</span>
              </button>
            </div>

            <button
              onClick={() => setShowAdminTicketModal(true)}
              className="px-3 py-2 rounded-xl bg-[#141c2c] hover:bg-[#1a2538] text-slate-300 border border-[#24334c] text-xs font-semibold transition-colors flex items-center gap-1.5"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Request Admin</span>
            </button>
          </div>

          {/* Run 1 Head-to-Head Card */}
          <div className="p-5 rounded-2xl bg-[#0f1624] border border-[#1f2b42] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1a253a]">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold text-xs flex items-center justify-center">
                  1
                </span>
                <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
                  Cryo Archive Run 1
                </h3>
              </div>

              {!isRun1Complete && (
                <div className="flex items-center gap-1 text-[11px] text-amber-400 font-mono">
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Hidden until both lock</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Team A Run 1 */}
              <div className="p-4 rounded-xl bg-[#131b2c] border border-[#1e2a42] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-white">{match.teamAName}</span>
                  {match.teamARun1 ? (
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Locked
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-slate-500">Awaiting Submission</span>
                  )}
                </div>

                {match.teamARun1 ? (
                  // If both locked OR user is Team A, show details
                  (isRun1Complete || isTeamA || isAdmin) ? (
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between text-slate-300">
                        <span>Runner Kills:</span>
                        <span className="text-white font-bold">{match.teamARun1.runnerKills} (×5 pts)</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Extracted Credits:</span>
                        <span className="text-white font-bold">{match.teamARun1.extractedCredits.toLocaleString()} cr</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Survival Status:</span>
                        <span className={`font-bold ${match.teamARun1.playersExtracted === 3 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {match.teamARun1.playersExtracted}/3 Extracted ({match.teamARun1.survivalMultiplier}×)
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Objective:</span>
                        <span className="text-white font-bold">{match.teamARun1.objectiveCompleted ? '✓ Yes' : '✗ No'}</span>
                      </div>
                      <div className="pt-2 border-t border-[#202e48] flex justify-between text-sm font-bold text-amber-300">
                        <span>Run 1 Score:</span>
                        <span>{match.teamARun1.finalRunScore.toFixed(2)} pts</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs font-mono text-slate-400 flex flex-col items-center gap-2">
                      <EyeOff className="w-6 h-6 text-amber-500/60 animate-pulse" />
                      <span>Opponent score encrypted until your team submits Run 1</span>
                    </div>
                  )
                ) : (
                  <div className="py-6 text-center text-xs font-mono text-slate-500">
                    No score submitted yet
                  </div>
                )}
              </div>

              {/* Team B Run 1 */}
              <div className="p-4 rounded-xl bg-[#131b2c] border border-[#1e2a42] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-white">{match.teamBName}</span>
                  {match.teamBRun1 ? (
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Locked
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-slate-500">Awaiting Submission</span>
                  )}
                </div>

                {match.teamBRun1 ? (
                  (isRun1Complete || isTeamB || isAdmin) ? (
                    <div className="space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between text-slate-300">
                        <span>Runner Kills:</span>
                        <span className="text-white font-bold">{match.teamBRun1.runnerKills} (×5 pts)</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Extracted Credits:</span>
                        <span className="text-white font-bold">{match.teamBRun1.extractedCredits.toLocaleString()} cr</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Survival Status:</span>
                        <span className={`font-bold ${match.teamBRun1.playersExtracted === 3 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {match.teamBRun1.playersExtracted}/3 Extracted ({match.teamBRun1.survivalMultiplier}×)
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>Objective:</span>
                        <span className="text-white font-bold">{match.teamBRun1.objectiveCompleted ? '✓ Yes' : '✗ No'}</span>
                      </div>
                      <div className="pt-2 border-t border-[#202e48] flex justify-between text-sm font-bold text-amber-300">
                        <span>Run 1 Score:</span>
                        <span>{match.teamBRun1.finalRunScore.toFixed(2)} pts</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs font-mono text-slate-400 flex flex-col items-center gap-2">
                      <EyeOff className="w-6 h-6 text-amber-500/60 animate-pulse" />
                      <span>Opponent score encrypted until your team submits Run 1</span>
                    </div>
                  )
                ) : (
                  <div className="py-6 text-center text-xs font-mono text-slate-500">
                    No score submitted yet
                  </div>
                )}
              </div>
            </div>

            {/* Run 1 Reveal & Analytics Banner */}
            {isRun1Complete && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-300">
                  <Sparkles className="w-4 h-4" />
                  <span>
                    <strong>Run 1 Revealed:</strong>{' '}
                    {run1Diff === 0
                      ? 'Tied heading into Run 2!'
                      : run1Diff > 0
                      ? `${match.teamAName} leads by +${run1Diff} pts`
                      : `${match.teamBName} leads by +${Math.abs(run1Diff)} pts`}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400">Queue Run 2 to close match</span>
              </div>
            )}
          </div>

          {/* Run 2 Head-to-Head Card */}
          <div className="p-5 rounded-2xl bg-[#0f1624] border border-[#1f2b42] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1a253a]">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono font-bold text-xs flex items-center justify-center">
                  2
                </span>
                <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
                  Cryo Archive Run 2 (Final Run)
                </h3>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Team A Run 2 */}
              <div className="p-4 rounded-xl bg-[#131b2c] border border-[#1e2a42] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-white">{match.teamAName}</span>
                  {match.teamARun2 ? (
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Locked
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-slate-500">Awaiting Submission</span>
                  )}
                </div>

                {match.teamARun2 ? (
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-slate-300">
                      <span>Runner Kills:</span>
                      <span className="text-white font-bold">{match.teamARun2.runnerKills} (×5 pts)</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Extracted Credits:</span>
                      <span className="text-white font-bold">{match.teamARun2.extractedCredits.toLocaleString()} cr</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Survival Status:</span>
                      <span className={`font-bold ${match.teamARun2.playersExtracted === 3 ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {match.teamARun2.playersExtracted}/3 Extracted ({match.teamARun2.survivalMultiplier}×)
                      </span>
                    </div>
                    <div className="pt-2 border-t border-[#202e48] flex justify-between text-sm font-bold text-amber-300">
                      <span>Run 2 Score:</span>
                      <span>{match.teamARun2.finalRunScore.toFixed(2)} pts</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs font-mono text-slate-500">
                    No score submitted yet
                  </div>
                )}
              </div>

              {/* Team B Run 2 */}
              <div className="p-4 rounded-xl bg-[#131b2c] border border-[#1e2a42] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-white">{match.teamBName}</span>
                  {match.teamBRun2 ? (
                    <span className="text-xs font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Locked
                    </span>
                  ) : (
                    <span className="text-xs font-mono text-slate-500">Awaiting Submission</span>
                  )}
                </div>

                {match.teamBRun2 ? (
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between text-slate-300">
                      <span>Runner Kills:</span>
                      <span className="text-white font-bold">{match.teamBRun2.runnerKills} (×5 pts)</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Extracted Credits:</span>
                      <span className="text-white font-bold">{match.teamBRun2.extractedCredits.toLocaleString()} cr</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>Survival Status:</span>
                      <span className={`font-bold ${match.teamBRun2.playersExtracted === 3 ? 'text-emerald-400' : 'text-slate-300'}`}>
                        {match.teamBRun2.playersExtracted}/3 Extracted ({match.teamBRun2.survivalMultiplier}×)
                      </span>
                    </div>
                    <div className="pt-2 border-t border-[#202e48] flex justify-between text-sm font-bold text-amber-300">
                      <span>Run 2 Score:</span>
                      <span>{match.teamBRun2.finalRunScore.toFixed(2)} pts</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 text-center text-xs font-mono text-slate-500">
                    No score submitted yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Admin Operations Toolbar */}
          {isAdmin && (
            <div className="p-5 rounded-2xl bg-[#16121f] border border-red-500/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-400 font-display font-bold uppercase text-xs tracking-wider">
                  <Shield className="w-4 h-4" />
                  <span>Referee & Admin Authoritative Actions</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">All actions logged to immutable audit trail</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleAdminTimerControl('EXTEND_15_MIN')}
                  className="px-3 py-1.5 rounded-lg bg-[#241a33] hover:bg-[#322347] border border-red-500/30 text-xs text-red-200 font-semibold"
                >
                  +15 Min Clock Extension
                </button>
                <button
                  onClick={() => handleAdminTimerControl('RESTART_READY_CHECK')}
                  className="px-3 py-1.5 rounded-lg bg-[#241a33] hover:bg-[#322347] border border-red-500/30 text-xs text-red-200 font-semibold"
                >
                  Reset Ready Check (10m)
                </button>
                <button
                  onClick={() => handleAdminTimerControl('REVERSE_FORFEIT')}
                  className="px-3 py-1.5 rounded-lg bg-[#241a33] hover:bg-[#322347] border border-red-500/30 text-xs text-red-200 font-semibold"
                >
                  Reverse Forfeit
                </button>
                <button
                  onClick={() => {
                    setOverrideTeamId(match.teamAId || '');
                    setShowAdminOverrideModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-xs text-red-300 font-bold"
                >
                  Override Team Score...
                </button>
              </div>

              <div className="pt-2 border-t border-[#291e3b] flex items-center gap-2">
                <span className="text-xs text-slate-400">Declare Authoritative Winner:</span>
                <button
                  onClick={() => match.teamAId && handleOpenDeclareWinner(match.teamAId)}
                  className="px-2.5 py-1 rounded bg-[#20162e] border border-red-500/40 text-xs text-amber-300 font-bold hover:bg-amber-500/20"
                >
                  Adv. {match.teamAName}
                </button>
                <button
                  onClick={() => match.teamBId && handleOpenDeclareWinner(match.teamBId)}
                  className="px-2.5 py-1 rounded bg-[#20162e] border border-red-500/40 text-xs text-amber-300 font-bold hover:bg-amber-500/20"
                >
                  Adv. {match.teamBName}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (5 cols): Live Match Chat & Chat Command Terminal */}
        <div className="lg:col-span-5 flex flex-col h-[650px] rounded-3xl bg-[#0d1320] border border-[#1f2b42] overflow-hidden shadow-2xl">
          {/* Chat Header */}
          <div className="px-4 py-3 bg-[#0a0e17] border-b border-[#1b263b] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-400" />
              <span className="font-display font-bold text-xs uppercase tracking-wider text-white">
                Match Room Channel
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Supports /score commands</span>
          </div>

          {/* Messages Stream */}
          <div ref={chatScrollRef} className="flex-1 p-4 space-y-3 overflow-y-auto font-mono text-xs">
            {messages.map((msg) => {
              if (msg.type === 'SYSTEM') {
                return (
                  <div key={msg.id} className="p-2.5 rounded-lg bg-[#121929] border border-[#1f2b44] text-[11px] text-amber-300/90 leading-relaxed">
                    <span className="text-amber-500 font-bold">[SYSTEM]</span> {msg.message}
                  </div>
                );
              }
              if (msg.type === 'ADMIN') {
                return (
                  <div key={msg.id} className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/40 text-[11px] text-red-200 leading-relaxed">
                    <span className="text-red-400 font-bold">[ADMIN - {msg.userName}]</span> {msg.message}
                  </div>
                );
              }
              if (msg.type === 'COMMAND_ECHO') {
                return (
                  <div key={msg.id} className="p-2 rounded bg-[#0b101c] border border-cyan-500/30 text-[11px] text-cyan-300">
                    <span className="text-cyan-400 font-bold">&gt; {msg.userName}:</span> {msg.message}
                  </div>
                );
              }
              // Normal Player Chat
              const isMe = msg.userId === user?.id;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mb-0.5">
                    <span className={msg.userRole === 'CAPTAIN' ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                      {msg.userName} {msg.userRole === 'CAPTAIN' ? '(Captain)' : ''}
                    </span>
                    <span>• {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className={`px-3 py-2 rounded-xl max-w-[85%] text-xs ${isMe ? 'bg-amber-500/20 text-white border border-amber-500/40' : 'bg-[#151e31] text-slate-200 border border-[#222f49]'}`}>
                    {msg.message}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Command Suggestions */}
          <div className="px-3 py-2 bg-[#090d16] border-t border-[#1a253a] flex items-center gap-1.5 overflow-x-auto text-[10px] font-mono text-slate-400">
            <span className="text-amber-400 font-bold shrink-0">Command:</span>
            <button
              onClick={() => setChatInput('/score run1 kills:5 loot:45000 survived:3 objective:yes')}
              className="px-2 py-0.5 rounded bg-[#131b2c] hover:bg-[#1a253a] text-slate-300 whitespace-nowrap border border-[#1f2c44]"
            >
              /score run1 ...
            </button>
            <button
              onClick={() => setChatInput('/score run2 kills:7 loot:60000 survived:3 objective:yes')}
              className="px-2 py-0.5 rounded bg-[#131b2c] hover:bg-[#1a253a] text-slate-300 whitespace-nowrap border border-[#1f2c44]"
            >
              /score run2 ...
            </button>
          </div>

          {/* Chat Form */}
          <form onSubmit={handleSendMessage} className="p-3 bg-[#0a0e17] border-t border-[#1b263b] flex items-center gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Send message or type /score run1..."
              className="flex-1 px-3 py-2 rounded-xl bg-[#121929] border border-[#202d46] text-xs text-white focus:outline-none focus:border-amber-400 placeholder:text-slate-500 font-mono"
            />
            <button
              type="submit"
              disabled={chatSending || !chatInput.trim()}
              className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Score Calculator Modal */}
      <ScoreCalculatorModal
        isOpen={showScoreModal}
        onClose={() => setShowScoreModal(false)}
        onSubmitScore={handleScoreSubmit}
        defaultRunNumber={activeScoreRunNum}
        featuredObjectiveTitle={match.tournamentName}
        teamName={userTeamId === match.teamAId ? match.teamAName : match.teamBName}
      />

      {/* Flag Result / Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0d1320] border border-red-500/40 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c273d] mb-4">
              <div className="flex items-center gap-2 text-red-400 font-display font-bold uppercase text-base">
                <Flag className="w-5 h-5" />
                <span>Flag Match Result / File Dispute</span>
              </div>
              <button onClick={() => setShowDisputeModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleDisputeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Reason for Dispute <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Explain why opponent score is inaccurate or rule was broken..."
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-red-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Evidence URL / VOD Timestamp (Optional)
                </label>
                <input
                  type="url"
                  value={disputeEvidence}
                  onChange={(e) => setDisputeEvidence(e.target.value)}
                  placeholder="https://twitch.tv/videos/..."
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-red-400"
                />
              </div>

              <div className="p-3 rounded-lg bg-red-950/30 border border-red-500/30 text-[11px] text-red-300">
                Filing a dispute freezes match advancement and immediately summons a tournament referee into this room.
              </div>

              <button
                type="submit"
                disabled={disputeSubmitting || !disputeReason.trim()}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {disputeSubmitting ? 'Freezing Match...' : 'Submit Official Dispute'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Request Admin Ticket Modal */}
      {showAdminTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0d1320] border border-[#24334f] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c273d] mb-4">
              <div className="flex items-center gap-2 text-amber-400 font-display font-bold uppercase text-base">
                <HelpCircle className="w-5 h-5" />
                <span>Request Tournament Official</span>
              </div>
              <button onClick={() => setShowAdminTicketModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleAdminTicketSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Issue Category</label>
                <select
                  value={ticketCategory}
                  onChange={(e) => setTicketCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="SCORE_DISCREPANCY">Score Discrepancy</option>
                  <option value="OPPONENT_NO_SHOW">Opponent Captain No-Show</option>
                  <option value="RULE_VIOLATION">Rule Violation / Exploiting</option>
                  <option value="TECHNICAL_DISCONNECTION">Technical Disconnection</option>
                  <option value="OTHER">Other Assistance</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Description of Issue <span className="text-amber-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  placeholder="Describe your question or emergency..."
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="submit"
                disabled={ticketSubmitting || !ticketDescription.trim()}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {ticketSubmitting ? 'Summoning Staff...' : 'Submit Support Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Admin Score Override Modal */}
      {showAdminOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-[#0d1320] border border-red-500/50 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c273d] mb-4">
              <div className="flex items-center gap-2 text-red-400 font-display font-bold uppercase text-base">
                <Shield className="w-5 h-5" />
                <span>Authoritative Score Override</span>
              </div>
              <button onClick={() => setShowAdminOverrideModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleAdminScoreOverride} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Target Team</label>
                  <select
                    value={overrideTeamId}
                    onChange={(e) => setOverrideTeamId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-red-400"
                  >
                    <option value={match.teamAId || ''}>{match.teamAName}</option>
                    <option value={match.teamBId || ''}>{match.teamBName}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Run Number</label>
                  <select
                    value={overrideRunNum}
                    onChange={(e) => setOverrideRunNum(Number(e.target.value) as 1 | 2)}
                    className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-red-400"
                  >
                    <option value={1}>Run 1</option>
                    <option value={2}>Run 2</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Runner Kills</label>
                  <input
                    type="number"
                    min="0"
                    value={overrideKills}
                    onChange={(e) => setOverrideKills(parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Extracted Credits</label>
                  <input
                    type="number"
                    min="0"
                    value={overrideLoot}
                    onChange={(e) => setOverrideLoot(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Extracted Players</label>
                <select
                  value={overrideSurvivors}
                  onChange={(e) => setOverrideSurvivors(Number(e.target.value) as 0 | 1 | 2 | 3)}
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white"
                >
                  <option value={3}>3/3 Extracted (1.20×)</option>
                  <option value={2}>2/3 Extracted (1.00×)</option>
                  <option value={1}>1/3 Extracted (1.00×)</option>
                  <option value={0}>0/3 Squad Wipe (0 pts)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mandatory Written Reason for Audit Log <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Official explanation for modifying recorded match stats..."
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-red-400"
                />
              </div>

              <button
                type="submit"
                disabled={overrideSubmitting || !overrideReason.trim()}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {overrideSubmitting ? 'Overriding & Logging...' : 'Commit Authoritative Override'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Admin Declare Winner Modal */}
      {declareWinnerModal?.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0d1320] border border-red-500/40 rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#1c273d] mb-4">
              <div>
                <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
                  Declare Match Winner
                </h3>
                <p className="text-xs text-amber-400 mt-0.5">
                  Advance: {declareWinnerModal.teamName}
                </p>
              </div>
              <button
                onClick={() => setDeclareWinnerModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmDeclareWinner();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mandatory Written Reason for Audit Log <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={declareWinnerModal.reason}
                  onChange={(e) =>
                    setDeclareWinnerModal((prev) => (prev ? { ...prev, reason: e.target.value } : null))
                  }
                  placeholder="Official referee ruling explaining manual winner declaration..."
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-red-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c273d]">
                <button
                  type="button"
                  onClick={() => setDeclareWinnerModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={declareWinnerModal.submitting || !declareWinnerModal.reason.trim()}
                  className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {declareWinnerModal.submitting ? 'Declaring...' : 'Confirm Winner Declaration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
