import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  ShieldCheck,
  UserPlus,
  Crown,
  CheckCircle2,
  XCircle,
  Mail,
  AlertCircle
} from 'lucide-react';
import { Team, TeamInvitation } from '../types';
import { useAuth } from '../context/AuthContext';

export const TeamsPage: React.FC = () => {
  const { user, token, userTeams, invitations, refreshUser } = useAuth();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamTag, setTeamTag] = useState('');
  const [teamLogo, setTeamLogo] = useState('');
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Invite member state
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);
  const [inviteIdentifier, setInviteIdentifier] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCreateError('');
    setCreateLoading(true);

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: teamName, tag: teamTag, logoUrl: teamLogo || undefined })
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || 'Failed to create team');
      } else {
        setShowCreateModal(false);
        setTeamName('');
        setTeamTag('');
        setTeamLogo('');
        refreshUser();
      }
    } catch (err: any) {
      setCreateError(err.message || 'Network error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !inviteTeamId) return;
    setInviteError('');
    setInviteSuccess('');
    setInviteLoading(true);

    try {
      const res = await fetch(`/api/teams/${inviteTeamId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ identifier: inviteIdentifier })
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteError(data.error || 'Failed to send invite');
      } else {
        setInviteSuccess('Invitation sent successfully!');
        setInviteIdentifier('');
        refreshUser();
      }
    } catch (err: any) {
      setInviteError(err.message || 'Network error');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRespondInvitation = async (invitationId: string, action: 'ACCEPT' | 'DECLINE') => {
    if (!token) return;
    try {
      await fetch(`/api/teams/invitations/${invitationId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action })
      });
      refreshUser();
    } catch (err) {
      console.error('Invite response error:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#1f2b42]">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-white uppercase tracking-wider">
            Competitive Roster Management
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Build your 3-player Marathon squad. Snapshotted on tournament registration with verified Bungie IDs.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-display font-bold text-xs uppercase tracking-wider shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Team</span>
        </button>
      </div>

      {/* Pending Invitations Banner */}
      {invitations.length > 0 && (
        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
          <div className="flex items-center gap-2 text-amber-300 font-display font-bold text-sm uppercase tracking-wider">
            <Mail className="w-4 h-4" />
            <span>You Have Pending Team Invitations ({invitations.length})</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="p-3 rounded-xl bg-[#0e1422] border border-amber-500/30 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold text-white text-xs">{inv.teamName}</div>
                  <div className="text-[11px] text-slate-400">Invited by Captain {inv.captainName}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRespondInvitation(inv.id, 'ACCEPT')}
                    className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespondInvitation(inv.id, 'DECLINE')}
                    className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Teams Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {userTeams.map((team) => {
          const isCap = (team.captainUserId || (team as any).captainId) === user?.id;
          const membersList = team.members || [];
          const isRosterFull = membersList.length >= 3;

          return (
            <div
              key={team.id}
              className="p-6 rounded-2xl bg-[#0f1624] border border-[#1f2b42] shadow-xl space-y-5 flex flex-col justify-between"
            >
              <div>
                {/* Team Top Card */}
                <div className="flex items-center justify-between pb-4 border-b border-[#182338]">
                  <div className="flex items-center gap-3">
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt="" className="w-12 h-12 rounded-xl object-cover border border-amber-500/40" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-slate-800 border border-amber-500/40 flex items-center justify-center font-display font-bold text-lg text-amber-400">
                        {team.tag || team.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-bold text-base text-white">{team.name}</h3>
                        {team.tag && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-300">
                            [{team.tag}]
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        Captain: {team.captain?.displayName || (team as any).captainName || 'Team Captain'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${isRosterFull ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'}`}>
                      {membersList.length} / 3 Roster
                    </span>
                  </div>
                </div>

                {/* Squad Members List */}
                <div className="space-y-2 mt-4">
                  <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Official Squad Members (3-Player Required)
                  </div>
                  {membersList.map((member, i) => (
                    <div
                      key={member.userId || member.id || i}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#131b2c] border border-[#1d283e] text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {member.role === 'CAPTAIN' ? (
                          <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : (
                          <span className="text-slate-500 font-mono text-xs w-4">#{i + 1}</span>
                        )}
                        <span className="font-semibold text-white">
                          {member.user?.displayName || (member as any).displayName || 'Competitor'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-amber-300 text-[11px]">
                          {member.user?.bungieId || (member as any).bungieId || ''}
                        </span>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pt-4 border-t border-[#182338]">
                {isCap && !isRosterFull ? (
                  <button
                    onClick={() => {
                      setInviteTeamId(team.id);
                      setInviteError('');
                      setInviteSuccess('');
                    }}
                    className="w-full py-2 rounded-xl bg-[#151f33] hover:bg-[#1c2944] text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Invite Competitor (+{3 - membersList.length} Slot Available)</span>
                  </button>
                ) : (
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1 text-emerald-400 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Eligible for Tournament Entry
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0d1320] border border-[#24334f] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c273d] mb-4">
              <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
                Create 3-Player Squad
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTeam} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Squad Name *</label>
                <input
                  type="text"
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Apex Predators"
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Team Tag (3-4 Chars)</label>
                <input
                  type="text"
                  maxLength={5}
                  value={teamTag}
                  onChange={(e) => setTeamTag(e.target.value.toUpperCase())}
                  placeholder="e.g. APEX"
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white uppercase font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Team Logo URL (Optional)</label>
                <input
                  type="url"
                  value={teamLogo}
                  onChange={(e) => setTeamLogo(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="p-3 rounded-xl bg-[#121929] border border-[#1f2b44] text-[11px] text-slate-400">
                You will become Team Captain. You can then invite 2 additional verified players to complete the 3-man roster.
              </div>

              <button
                type="submit"
                disabled={createLoading || !teamName.trim()}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-display font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {createLoading ? 'Founding Squad...' : 'Found Squad'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {inviteTeamId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-[#0d1320] border border-[#24334f] rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#1c273d] mb-4">
              <h3 className="font-display font-bold text-base text-white uppercase tracking-wider">
                Invite Player to Roster
              </h3>
              <button onClick={() => setInviteTeamId(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {inviteError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
                {inviteError}
              </div>
            )}

            {inviteSuccess && (
              <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
                {inviteSuccess}
              </div>
            )}

            <form onSubmit={handleInviteMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Player Username, Email, or Bungie ID
                </label>
                <input
                  type="text"
                  required
                  value={inviteIdentifier}
                  onChange={(e) => setInviteIdentifier(e.target.value)}
                  placeholder="e.g. ArachneQueen or player@outlook.com"
                  className="w-full px-3 py-2 rounded-lg bg-[#141d2e] border border-[#23314c] text-xs text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="submit"
                disabled={inviteLoading || !inviteIdentifier.trim()}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {inviteLoading ? 'Sending...' : 'Send Roster Invitation'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
