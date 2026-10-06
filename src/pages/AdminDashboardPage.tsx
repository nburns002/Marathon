import React, { useState, useEffect } from 'react';
import {
  Shield,
  AlertTriangle,
  HelpCircle,
  Clock,
  CheckCircle2,
  Search,
  ExternalLink,
  Users,
  Trophy,
  Swords,
  History,
  Lock,
  ArrowRight
} from 'lucide-react';
import { MatchDispute, AdminTicket, AdminAction, AuditLog, Match } from '../types';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';

interface AdminDashboardPageProps {
  onSelectMatch: (matchId: string) => void;
}

export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ onSelectMatch }) => {
  const { user, token } = useAuth();
  const { subscribe } = useRealtime();

  const [activeTab, setActiveTab] = useState<'disputes' | 'tickets' | 'matches' | 'audit'>('disputes');
  const [metrics, setMetrics] = useState<any>(null);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [auditLogs, setAuditLogs] = useState<{ adminActions: AdminAction[]; systemAuditLogs: AuditLog[] }>({
    adminActions: [],
    systemAuditLogs: []
  });
  const [loading, setLoading] = useState(true);

  // Dispute Resolution Form State
  const [resolvingDisputeId, setResolvingDisputeId] = useState<string | null>(null);
  const [resolutionRuling, setResolutionRuling] = useState<'SCORE_UPHELD' | 'SCORE_OVERRIDDEN'>('SCORE_OVERRIDDEN');
  const [resolutionText, setResolutionText] = useState('');
  const [resolutionReason, setResolutionReason] = useState('');
  const [resolving, setResolving] = useState(false);

  // Score Adjustment fields during dispute resolution
  const [modifyScore, setModifyScore] = useState(false);
  const [adjTeamId, setAdjTeamId] = useState('');
  const [adjRunNum, setAdjRunNum] = useState<1 | 2>(1);
  const [adjKills, setAdjKills] = useState<number>(0);
  const [adjLoot, setAdjLoot] = useState<number>(0);
  const [adjSurvivors, setAdjSurvivors] = useState<0 | 1 | 2 | 3>(3);
  const [adjObj, setAdjObj] = useState<boolean>(true);

  const fetchAdminData = async () => {
    if (!token) return;
    try {
      const [dashRes, dispRes, tickRes, matchRes, auditRes] = await Promise.all([
        fetch('/api/admin/dashboard', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/disputes', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/tickets', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/matches', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/audit-logs', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (dashRes.ok) {
        const dashData = await dashRes.json();
        setMetrics(dashData.metrics);
      }
      if (dispRes.ok) {
        const dispData = await dispRes.json();
        setDisputes(dispData.disputes || []);
      }
      if (tickRes.ok) {
        const tickData = await tickRes.json();
        setTickets(tickData.tickets || []);
      }
      if (matchRes.ok) {
        const matchData = await matchRes.json();
        setMatches(matchData.matches || []);
      }
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAuditLogs(auditData);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
    const unsub = subscribe('*', () => {
      fetchAdminData();
    });
    return unsub;
  }, [token]);

  const handleResolveDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !resolvingDisputeId || !resolutionText.trim() || !resolutionReason.trim()) return;

    setResolving(true);
    try {
      const payload: any = {
        ruling: resolutionRuling,
        resolution: resolutionText,
        reason: resolutionReason
      };

      if (modifyScore) {
        payload.newScoreData = {
          teamId: adjTeamId,
          runNumber: adjRunNum,
          runnerKills: adjKills,
          extractedCredits: adjLoot,
          playersExtracted: adjSurvivors,
          objectiveCompleted: adjObj
        };
      }

      const res = await fetch(`/api/admin/disputes/${resolvingDisputeId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setResolvingDisputeId(null);
        setResolutionText('');
        setResolutionReason('');
        setModifyScore(false);
        fetchAdminData();
      }
    } catch (err) {
      console.error('Dispute resolution error:', err);
    } finally {
      setResolving(false);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, status: string, notes?: string) => {
    if (!token) return;
    try {
      await fetch(`/api/admin/tickets/${ticketId}/update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status, resolutionNotes: notes })
      });
      fetchAdminData();
    } catch (err) {
      console.error('Ticket status update error:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-mono text-slate-400">Loading Admin Operations Center...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#181220] via-[#120f1c] to-[#0f1422] border border-red-500/40 shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/50 flex items-center justify-center text-red-400 shadow-lg shadow-red-500/20">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 font-bold">
                SUPERADMIN HQ
              </span>
              <span className="text-xs text-slate-400 font-mono">Logged in as {user?.displayName}</span>
            </div>
            <h1 className="text-2xl font-display font-bold text-white uppercase tracking-wider mt-1">
              Tournament Operations Center
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-[#0e0a14] border border-red-500/30 text-red-300">
            Escalate exceptions • Preserve integrity
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
          <div className="p-4 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
            <div className="text-[10px] text-slate-400 uppercase">Live Tournaments</div>
            <div className="text-xl font-bold text-white mt-1">{metrics.liveTournaments}</div>
          </div>
          <div className="p-4 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
            <div className="text-[10px] text-slate-400 uppercase">Active Matches</div>
            <div className="text-xl font-bold text-amber-400 mt-1">{metrics.activeMatches}</div>
          </div>
          <div className="p-4 rounded-2xl bg-[#0f1624] border border-red-500/30 bg-red-950/10">
            <div className="text-[10px] text-red-400 uppercase font-bold">Open Disputes</div>
            <div className="text-xl font-bold text-red-300 mt-1">{metrics.openDisputesCount}</div>
          </div>
          <div className="p-4 rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
            <div className="text-[10px] text-slate-400 uppercase">Assistance Tickets</div>
            <div className="text-xl font-bold text-cyan-400 mt-1">{metrics.openTicketsCount}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#1f2b42] pb-2 overflow-x-auto">
        {[
          { id: 'disputes', label: `Dispute Queue (${disputes.filter((d) => d.status === 'OPEN').length})`, icon: AlertTriangle },
          { id: 'tickets', label: `Assistance Tickets (${tickets.filter((t) => t.status === 'OPEN').length})`, icon: HelpCircle },
          { id: 'matches', label: `Active Matches (${matches.filter((m) => m.matchStatus === 'ACTIVE' || m.matchStatus === 'READY_CHECK' || m.matchStatus === 'RESULT_PENDING').length})`, icon: Swords },
          { id: 'audit', label: 'Immutable Audit Trail', icon: History }
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Dispute Queue */}
      {activeTab === 'disputes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
              Dispute Investigation & Resolution Queue
            </h3>
            <span className="text-xs font-mono text-slate-400">
              Matches freeze automatically until referee ruling
            </span>
          </div>

          {disputes.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs font-mono rounded-2xl bg-[#0f1624] border border-[#1f2b42]">
              No active or historical disputes recorded.
            </div>
          ) : (
            <div className="space-y-4">
              {disputes.map((d) => (
                <div
                  key={d.id}
                  className="p-6 rounded-2xl bg-[#0f1624] border border-red-500/30 shadow-xl space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#1a253a]">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${d.status === 'OPEN' ? 'bg-red-500/20 text-red-300 border border-red-500/40 animate-pulse' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'}`}>
                        {d.status}
                      </span>
                      <span className="text-xs text-white font-bold font-mono">
                        Dispute ID: {d.id}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {d.matchId && (
                        <button
                          onClick={() => onSelectMatch(d.matchId)}
                          className="px-3 py-1.5 rounded-lg bg-[#141d2e] hover:bg-[#1a263d] text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1"
                        >
                          <span>Open Match Room</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-[#131b2c] border border-[#1e2a42]">
                      <div className="text-[10px] text-slate-400 uppercase">Dispute Filed By</div>
                      <div className="text-white font-bold mt-0.5">
                        {d.requestingTeamName || d.initiatorTeamName || 'Disputing Team'}
                        {d.disputedTeamName ? ` vs ${d.disputedTeamName}` : ''}
                      </div>
                      <div className="text-slate-400 mt-2 text-[11px]">
                        <strong>Explanation:</strong> "{d.description || d.reason || 'No explanation provided'}"
                      </div>
                      {((d.evidenceUrls && d.evidenceUrls.length > 0) || d.evidenceUrl) && (
                        <div className="mt-2 space-y-1">
                          {(d.evidenceUrls || [d.evidenceUrl]).filter(Boolean).map((url: string, idx: number) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-amber-400 hover:underline flex items-center gap-1 text-[11px]"
                            >
                              <ExternalLink className="w-3 h-3" /> View Submitted Evidence #{idx + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="p-3 rounded-xl bg-[#131b2c] border border-[#1e2a42]">
                      <div className="text-[10px] text-slate-400 uppercase">Resolution Status</div>
                      {d.resolution ? (
                        <div className="mt-1 space-y-1">
                          <div className="text-emerald-300 font-bold">{d.resolution}</div>
                          <div className="text-slate-400 text-[10px]">
                            Resolved by Admin {d.assignedAdminName || 'Staff'} on {new Date(d.updatedAt).toLocaleString()}
                          </div>
                        </div>
                      ) : (
                        <div className="text-amber-400 mt-1">Pending Referee Ruling</div>
                      )}
                    </div>
                  </div>

                  {d.status === 'OPEN' && (
                    <div className="pt-2">
                      <button
                        onClick={() => {
                          setResolvingDisputeId(d.id);
                          if (d.match) {
                            setAdjTeamId(d.match.teamAId || '');
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs uppercase tracking-wider transition-colors"
                      >
                        Investigate & Issue Authoritative Ruling
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Assistance Tickets */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
              Player Assistance & Ref Calls
            </h3>
          </div>

          <div className="space-y-3">
            {tickets.map((t) => (
              <div
                key={t.id}
                className="p-5 rounded-2xl bg-[#0f1624] border border-[#1f2b42] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[10px] border border-cyan-500/30">
                      {t.category}
                    </span>
                    <span className="text-xs font-mono font-bold text-white">
                      From {t.requestingUserName || (t as any).creatorName || 'User'}
                      {t.requestingTeamName ? ` (${t.requestingTeamName})` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{t.description}</p>
                  <div className="text-[10px] font-mono text-slate-500">
                    Created {new Date(t.createdAt).toLocaleTimeString()}
                    {t.matchId ? ` • Match ID: ${t.matchId}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {t.matchId && (
                    <button
                      onClick={() => onSelectMatch(t.matchId!)}
                      className="px-3 py-1.5 rounded-lg bg-[#141d2e] hover:bg-[#1a263d] text-amber-300 border border-amber-500/30 text-xs font-semibold"
                    >
                      Open Match Room
                    </button>
                  )}

                  {t.status === 'OPEN' && (
                    <button
                      onClick={() => handleUpdateTicketStatus(t.id, 'RESOLVED', 'Resolved by Referee in Match Chat')}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold font-display uppercase tracking-wider"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Active Matches Controller */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
              All Tournament Matches
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matches.map((m) => (
              <div
                key={m.id}
                onClick={() => onSelectMatch(m.id)}
                className="p-5 rounded-2xl bg-[#0f1624] border border-[#1f2b42] hover:border-amber-500/60 transition-all cursor-pointer space-y-3"
              >
                <div className="flex items-center justify-between text-xs pb-2 border-b border-[#1a253a]">
                  <span className="font-mono text-slate-400">Match #{m.matchNumber} (Round {m.round})</span>
                  <span className="font-mono text-amber-400 font-bold">{m.matchStatus}</span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold text-white">
                    <span>{m.teamAName}</span>
                    <span className="font-mono text-amber-300">{m.finalScoreA !== null ? `${m.finalScoreA} pts` : '—'}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-white">
                    <span>{m.teamBName}</span>
                    <span className="font-mono text-amber-300">{m.finalScoreB !== null ? `${m.finalScoreB} pts` : '—'}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1a253a] flex items-center justify-between text-xs text-amber-400">
                  <span>Enter Match Room</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Immutable Audit Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
              Immutable Admin Actions & System Audit Log
            </h3>
            <span className="text-xs font-mono text-slate-400">All overrides permanently recorded</span>
          </div>

          <div className="space-y-2 font-mono text-xs">
            {auditLogs.adminActions.map((act) => (
              <div
                key={act.id}
                className="p-3.5 rounded-xl bg-[#0c111c] border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 font-bold">[{act.action}]</span>
                    <span className="text-white">Admin: {act.adminName}</span>
                    <span className="text-slate-500">• Match ID: {act.matchId}</span>
                  </div>
                  <div className="text-slate-300 text-[11px] mt-1">
                    <strong>Reason:</strong> "{act.reason}"
                  </div>
                  {act.newValue && (
                    <div className="text-emerald-400 text-[11px] mt-0.5">
                      <strong>New Value:</strong> {act.newValue}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 shrink-0">
                  {new Date(act.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispute Resolution Modal */}
      {resolvingDisputeId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl bg-[#0d1320] border border-red-500/50 rounded-2xl shadow-2xl p-6 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c273d] mb-4">
              <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
                Official Dispute Ruling & Settlement
              </h3>
              <button onClick={() => setResolvingDisputeId(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleResolveDispute} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Official Ruling</label>
                <select
                  value={resolutionRuling}
                  onChange={(e) => setResolutionRuling(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-red-400"
                >
                  <option value="SCORE_OVERRIDDEN">Score Overridden & Corrected</option>
                  <option value="SCORE_UPHELD">Score Upheld (Dispute Rejected)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Ruling Summary (Published to Match Chat) *
                </label>
                <input
                  type="text"
                  required
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  placeholder="e.g. VOD review confirms 6 runner kills. Run 1 score updated to 48.00."
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-red-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Internal Administrative Reason *
                </label>
                <textarea
                  rows={2}
                  required
                  value={resolutionReason}
                  onChange={(e) => setResolutionReason(e.target.value)}
                  placeholder="Official explanation stored in permanent audit log..."
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-red-400"
                />
              </div>

              {/* Optional Score Adjustment Strip */}
              <div className="p-4 rounded-xl bg-[#121929] border border-[#1f2b44] space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-white">Apply Statistical Score Correction</label>
                  <input
                    type="checkbox"
                    checked={modifyScore}
                    onChange={(e) => setModifyScore(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 focus:ring-0"
                  />
                </div>

                {modifyScore && (
                  <div className="space-y-3 pt-2 border-t border-[#1a253a]">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Target Run</label>
                        <select
                          value={adjRunNum}
                          onChange={(e) => setAdjRunNum(Number(e.target.value) as 1 | 2)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#182238] border border-[#263552] text-xs text-white"
                        >
                          <option value={1}>Run 1</option>
                          <option value={2}>Run 2</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Corrected Kills</label>
                        <input
                          type="number"
                          min="0"
                          value={adjKills}
                          onChange={(e) => setAdjKills(parseInt(e.target.value, 10) || 0)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#182238] border border-[#263552] text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Corrected Loot Credits</label>
                        <input
                          type="number"
                          min="0"
                          value={adjLoot}
                          onChange={(e) => setAdjLoot(parseFloat(e.target.value) || 0)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#182238] border border-[#263552] text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Survivors Extracted</label>
                        <select
                          value={adjSurvivors}
                          onChange={(e) => setAdjSurvivors(Number(e.target.value) as 0 | 1 | 2 | 3)}
                          className="w-full px-2.5 py-1.5 rounded bg-[#182238] border border-[#263552] text-xs text-white"
                        >
                          <option value={3}>3/3 (1.20×)</option>
                          <option value={2}>2/3 (1.00×)</option>
                          <option value={1}>1/3 (1.00×)</option>
                          <option value={0}>0/3 Squad Wipe (0 pts)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={resolving || !resolutionText.trim() || !resolutionReason.trim()}
                className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {resolving ? 'Issuing Ruling & Unfreezing Match...' : 'Commit Ruling & Unfreeze Match'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
