import { v4 as uuidv4 } from 'uuid';
import { db } from './db';
import { advanceMatchWinner, calculateTournamentCurrentRound } from './bracket';
import { determineMatchWinner, calculateRunScore } from './scoring';

export type EventBroadcaster = (eventType: string, data: any) => void;

let broadcaster: EventBroadcaster = () => {};

export function setEventBroadcaster(fn: EventBroadcaster) {
  broadcaster = fn;
}

export function broadcastEvent(eventType: string, data: any) {
  broadcaster(eventType, data);
}

/**
 * Authoritative background timer loop running every 3 seconds.
 */
export function startTimerWorker() {
  console.log('[TimerWorker] Starting authoritative match and tournament background worker...');

  setInterval(() => {
    try {
      processTimerWorkerTick();
    } catch (err) {
      console.error('[TimerWorker] Error in worker tick:', err);
    }
  }, 3000);
}

export function processTimerWorkerTick() {
  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  let hasChanges = false;

  // Build team lookup
  const teamLookup: Record<string, { name: string; logoUrl?: string }> = {};
  db.data.teams.forEach((t) => {
    teamLookup[t.id] = { name: t.name, logoUrl: t.logoUrl };
  });

  // 1. Process Tournament Registration Closes
  for (const tourn of db.data.tournaments) {
    if (tourn.status === 'REGISTRATION_OPEN') {
      const closeMs = new Date(tourn.registrationCloseAt).getTime();
      if (nowMs >= closeMs) {
        tourn.status = 'REGISTRATION_LOCKED';
        tourn.updatedAt = nowIso;
        hasChanges = true;

        db.data.auditLogs.push({
          id: uuidv4(),
          actorType: 'SYSTEM',
          actorId: 'SYSTEM',
          actorName: 'Tournament Engine',
          action: 'REGISTRATION_AUTO_LOCKED',
          entityType: 'TOURNAMENT',
          entityId: tourn.id,
          metadata: { closedAt: nowIso },
          timestamp: nowIso
        });

        broadcastEvent('TOURNAMENT_UPDATED', { tournamentId: tourn.id, status: tourn.status });
      }
    }
  }

  // 2. Process Matches
  for (const match of db.data.matches) {
    // 0. WAITING_FOR_ROUND Intermission Expiration -> Transition to READY_CHECK
    if (
      match.matchStatus === 'WAITING_FOR_ROUND' &&
      match.teamAId &&
      match.teamBId &&
      match.intermissionDeadlineAt
    ) {
      const intermissionDeadlineMs = new Date(match.intermissionDeadlineAt).getTime();
      if (nowMs >= intermissionDeadlineMs) {
        const tourn = db.data.tournaments.find((t) => t.id === match.tournamentId);
        const readyMinutes = tourn?.readyWindowMinutes || 10;
        match.matchStatus = 'READY_CHECK';
        match.readyDeadlineAt = new Date(nowMs + readyMinutes * 60 * 1000).toISOString();
        match.intermissionDeadlineAt = null;
        match.updatedAt = nowIso;
        hasChanges = true;

        db.data.matchMessages.push({
          id: uuidv4(),
          matchId: match.id,
          userId: 'SYSTEM',
          userName: 'SYSTEM',
          userRole: 'SYSTEM',
          type: 'SYSTEM',
          message: `SYSTEM — Round Intermission has concluded. ${readyMinutes}-minute Captain Ready Check is now officially open for ${match.teamAName || 'Team A'} and ${match.teamBName || 'Team B'}. Captains, please check in!`,
          createdAt: nowIso
        });

        db.data.auditLogs.push({
          id: uuidv4(),
          actorType: 'SYSTEM',
          actorId: 'SYSTEM',
          actorName: 'Tournament Engine',
          action: 'INTERMISSION_EXPIRED_READY_CHECK_OPENED',
          entityType: 'MATCH',
          entityId: match.id,
          metadata: {
            readyDeadlineAt: match.readyDeadlineAt,
            readyMinutes
          },
          timestamp: nowIso
        });

        if (tourn) {
          tourn.currentRound = calculateTournamentCurrentRound(
            db.data.matches.filter((m) => m.tournamentId === tourn.id),
            tourn.currentRound || 1
          );
        }

        broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });
      }
    }

    // A. READY_CHECK Timeout
    if (match.matchStatus === 'READY_CHECK' && match.readyDeadlineAt) {
      const deadlineMs = new Date(match.readyDeadlineAt).getTime();
      if (nowMs >= deadlineMs) {
        const teamAReady = Boolean(match.teamAReady);
        const teamBReady = Boolean(match.teamBReady);

        if (teamAReady && !teamBReady && match.teamAId && match.teamBId) {
          // Team A Wins by Forfeit
          match.matchStatus = 'FORFEIT';
          match.winnerTeamId = match.teamAId;
          match.loserTeamId = match.teamBId;
          match.forfeitReason = `${match.teamBName || 'Opponent'} failed to complete the Ready Check within 10 minutes.`;
          match.updatedAt = nowIso;
          hasChanges = true;

          const sysMsg = `SYSTEM — Team ${match.teamBName || 'Team B'} failed to complete the Ready Check within the allotted 10 minutes. ${match.teamAName} has been awarded the match by forfeit.`;
          db.data.matchMessages.push({
            id: uuidv4(),
            matchId: match.id,
            userId: 'SYSTEM',
            userName: 'SYSTEM',
            userRole: 'SYSTEM',
            type: 'FORFEIT',
            message: sysMsg,
            createdAt: nowIso
          });

          // Auto-advance Team A
          const tourn = db.data.tournaments.find((t) => t.id === match.tournamentId);
          const advanceRes = advanceMatchWinner(
            db.data.matches,
            match.id,
            match.teamAId,
            teamLookup,
            tourn?.roundIntermissionMinutes || 10,
            'Opponent Ready Check Forfeit'
          );

          if (advanceRes.auditEvent) {
            db.data.auditLogs.push({
              id: uuidv4(),
              actorType: 'SYSTEM',
              actorId: 'SYSTEM',
              actorName: 'Tournament Engine',
              action: advanceRes.auditEvent.action,
              entityType: 'MATCH',
              entityId: match.id,
              metadata: advanceRes.auditEvent,
              timestamp: advanceRes.auditEvent.timestamp
            });
          }

          if (advanceRes.isTournamentComplete && advanceRes.championTeamId) {
            if (tourn) {
              tourn.status = 'COMPLETED';
              tourn.championTeamId = advanceRes.championTeamId;
              tourn.championTeamName = teamLookup[advanceRes.championTeamId]?.name;
              tourn.updatedAt = nowIso;
            }
          }

          if (tourn) {
            tourn.currentRound = calculateTournamentCurrentRound(
              db.data.matches.filter((m) => m.tournamentId === tourn.id),
              tourn.currentRound || 1
            );
          }

          db.data.auditLogs.push({
            id: uuidv4(),
            actorType: 'SYSTEM',
            actorId: 'SYSTEM',
            actorName: 'Tournament Engine',
            action: 'AUTO_FORFEIT_ISSUED',
            entityType: 'MATCH',
            entityId: match.id,
            metadata: { winnerTeamId: match.teamAId, loserTeamId: match.teamBId, reason: match.forfeitReason },
            timestamp: nowIso
          });

          broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });
        } else if (!teamAReady && teamBReady && match.teamAId && match.teamBId) {
          // Team B Wins by Forfeit
          match.matchStatus = 'FORFEIT';
          match.winnerTeamId = match.teamBId;
          match.loserTeamId = match.teamAId;
          match.forfeitReason = `${match.teamAName || 'Opponent'} failed to complete the Ready Check within 10 minutes.`;
          match.updatedAt = nowIso;
          hasChanges = true;

          const sysMsg = `SYSTEM — Team ${match.teamAName || 'Team A'} failed to complete the Ready Check within the allotted 10 minutes. ${match.teamBName} has been awarded the match by forfeit.`;
          db.data.matchMessages.push({
            id: uuidv4(),
            matchId: match.id,
            userId: 'SYSTEM',
            userName: 'SYSTEM',
            userRole: 'SYSTEM',
            type: 'FORFEIT',
            message: sysMsg,
            createdAt: nowIso
          });

          // Auto-advance Team B
          const tourn = db.data.tournaments.find((t) => t.id === match.tournamentId);
          const advanceRes = advanceMatchWinner(
            db.data.matches,
            match.id,
            match.teamBId,
            teamLookup,
            tourn?.roundIntermissionMinutes || 10,
            'Opponent Ready Check Forfeit'
          );

          if (advanceRes.auditEvent) {
            db.data.auditLogs.push({
              id: uuidv4(),
              actorType: 'SYSTEM',
              actorId: 'SYSTEM',
              actorName: 'Tournament Engine',
              action: advanceRes.auditEvent.action,
              entityType: 'MATCH',
              entityId: match.id,
              metadata: advanceRes.auditEvent,
              timestamp: advanceRes.auditEvent.timestamp
            });
          }

          if (advanceRes.isTournamentComplete && advanceRes.championTeamId) {
            if (tourn) {
              tourn.status = 'COMPLETED';
              tourn.championTeamId = advanceRes.championTeamId;
              tourn.championTeamName = teamLookup[advanceRes.championTeamId]?.name;
              tourn.updatedAt = nowIso;
            }
          }

          if (tourn) {
            tourn.currentRound = calculateTournamentCurrentRound(
              db.data.matches.filter((m) => m.tournamentId === tourn.id),
              tourn.currentRound || 1
            );
          }

          db.data.auditLogs.push({
            id: uuidv4(),
            actorType: 'SYSTEM',
            actorId: 'SYSTEM',
            actorName: 'Tournament Engine',
            action: 'AUTO_FORFEIT_ISSUED',
            entityType: 'MATCH',
            entityId: match.id,
            metadata: { winnerTeamId: match.teamBId, loserTeamId: match.teamAId, reason: match.forfeitReason },
            timestamp: nowIso
          });

          broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });
        } else if (!teamAReady && !teamBReady) {
          // Double Forfeit / Admin Review
          match.matchStatus = 'DOUBLE_FORFEIT';
          match.forfeitReason = 'Neither team completed the Ready Check before the deadline.';
          match.updatedAt = nowIso;
          hasChanges = true;

          db.data.adminTickets.push({
            id: uuidv4(),
            matchId: match.id,
            tournamentId: match.tournamentId,
            requestingUserId: 'SYSTEM',
            requestingUserName: 'SYSTEM',
            category: 'DOUBLE NO-SHOW',
            description: `Both ${match.teamAName || 'Team A'} and ${match.teamBName || 'Team B'} failed to ready check. Admin intervention required.`,
            status: 'OPEN',
            createdAt: nowIso,
            updatedAt: nowIso
          });

          db.data.matchMessages.push({
            id: uuidv4(),
            matchId: match.id,
            userId: 'SYSTEM',
            userName: 'SYSTEM',
            userRole: 'SYSTEM',
            type: 'FORFEIT',
            message: 'SYSTEM — DOUBLE NO-SHOW: Neither team checked in. Match progression frozen for Administrator Review.',
            createdAt: nowIso
          });

          broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });
        }
      }
    }

    // B. MATCH WINDOW 75-MINUTE EXPIRATION
    if (
      (match.matchStatus === 'ACTIVE' || match.matchStatus === 'RUN_1_PARTIAL' || match.matchStatus === 'RUN_1_COMPLETE') &&
      match.matchDeadlineAt
    ) {
      const matchDeadlineMs = new Date(match.matchDeadlineAt).getTime();
      if (nowMs >= matchDeadlineMs) {
        // If Run 2 was not submitted by either team, auto-zero missing runs
        if (match.teamAId && !match.teamARun2) {
          const zeroA2 = calculateRunScore({ runnerKills: 0, extractedCredits: 0, playersExtracted: 0, objectiveCompleted: false });
          const subA2 = {
            id: uuidv4(),
            matchId: match.id,
            teamId: match.teamAId,
            runNumber: 2 as const,
            ...zeroA2,
            submittedBy: 'SYSTEM',
            submittedByName: 'SYSTEM (Deadline Expired)',
            submittedAt: nowIso,
            locked: true
          };
          db.data.runSubmissions.push(subA2);
          match.teamARun2 = subA2;
        }

        if (match.teamBId && !match.teamBRun2) {
          const zeroB2 = calculateRunScore({ runnerKills: 0, extractedCredits: 0, playersExtracted: 0, objectiveCompleted: false });
          const subB2 = {
            id: uuidv4(),
            matchId: match.id,
            teamId: match.teamBId,
            runNumber: 2 as const,
            ...zeroB2,
            submittedBy: 'SYSTEM',
            submittedByName: 'SYSTEM (Deadline Expired)',
            submittedAt: nowIso,
            locked: true
          };
          db.data.runSubmissions.push(subB2);
          match.teamBRun2 = subB2;
        }

        match.matchStatus = 'RESULT_PENDING';
        match.run1Revealed = true;
        match.disputeDeadlineAt = new Date(nowMs + 10 * 60 * 1000).toISOString();
        match.finalScoreA = Number(((match.teamARun1?.finalRunScore || 0) + (match.teamARun2?.finalRunScore || 0)).toFixed(2));
        match.finalScoreB = Number(((match.teamBRun1?.finalRunScore || 0) + (match.teamBRun2?.finalRunScore || 0)).toFixed(2));
        match.updatedAt = nowIso;
        hasChanges = true;

        db.data.matchMessages.push({
          id: uuidv4(),
          matchId: match.id,
          userId: 'SYSTEM',
          userName: 'SYSTEM',
          userRole: 'SYSTEM',
          type: 'SYSTEM',
          message: `SYSTEM — 75-Minute Match Window expired. Unsubmitted runs awarded 0 pts. Provisional Result: ${match.teamAName} (${match.finalScoreA.toFixed(2)}) vs ${match.teamBName} (${match.finalScoreB.toFixed(2)}). 10-Minute Dispute Window started.`,
          createdAt: nowIso
        });

        broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });
      }
    }

    // C. 10-MINUTE DISPUTE WINDOW EXPIRATION / AUTOMATIC FINALIZATION
    if (match.matchStatus === 'RESULT_PENDING' && match.disputeDeadlineAt) {
      const disputeDeadlineMs = new Date(match.disputeDeadlineAt).getTime();
      if (nowMs >= disputeDeadlineMs) {
        // Check if any open dispute exists
        const openDisputes = db.data.matchDisputes.filter(
          (d) => d.matchId === match.id && (d.status === 'OPEN' || d.status === 'INVESTIGATING')
        );

        if (openDisputes.length === 0 && match.teamAId && match.teamBId) {
          // Automatic finalization!
          const teamAData = {
            teamId: match.teamAId,
            run1: match.teamARun1,
            run2: match.teamARun2
          };
          const teamBData = {
            teamId: match.teamBId,
            run1: match.teamBRun1,
            run2: match.teamBRun2
          };

          const winnerResult = determineMatchWinner(teamAData, teamBData);

          if (winnerResult.isTied) {
            match.matchStatus = 'ADMIN_REVIEW';
            match.adminNotes = 'Tie detected across all tiebreakers. Admin tiebreaker run required.';
            match.updatedAt = nowIso;
            hasChanges = true;

            db.data.adminTickets.push({
              id: uuidv4(),
              matchId: match.id,
              tournamentId: match.tournamentId,
              requestingUserId: 'SYSTEM',
              requestingUserName: 'SYSTEM',
              category: 'DEAD HEAT TIE',
              description: `Match between ${match.teamAName} and ${match.teamBName} resulted in identical scores and tiebreaker metrics. Authorize tiebreaker run.`,
              status: 'OPEN',
              createdAt: nowIso,
              updatedAt: nowIso
            });

            db.data.matchMessages.push({
              id: uuidv4(),
              matchId: match.id,
              userId: 'SYSTEM',
              userName: 'SYSTEM',
              userRole: 'SYSTEM',
              type: 'SYSTEM',
              message: 'SYSTEM — Complete tie detected. Administrator summoned to authorize Tiebreaker Run.',
              createdAt: nowIso
            });
          } else {
            // Definite winner!
            match.matchStatus = 'FINAL';
            match.winnerTeamId = winnerResult.winnerTeamId;
            match.loserTeamId = winnerResult.winnerTeamId === match.teamAId ? match.teamBId : match.teamAId;
            match.updatedAt = nowIso;
            hasChanges = true;

            const winningTeamName = match.winnerTeamId === match.teamAId ? match.teamAName : match.teamBName;

            db.data.matchMessages.push({
              id: uuidv4(),
              matchId: match.id,
              userId: 'SYSTEM',
              userName: 'SYSTEM',
              userRole: 'SYSTEM',
              type: 'SYSTEM',
              message: `SYSTEM — 10-Minute Dispute Window expired without objection. Match finalized!\nWinner: ${winningTeamName} (${winnerResult.reason})\nAdvancing to next round automatically.`,
              createdAt: nowIso
            });

            const tourn = db.data.tournaments.find((t) => t.id === match.tournamentId);
            const advanceRes = advanceMatchWinner(
              db.data.matches,
              match.id,
              winnerResult.winnerTeamId,
              teamLookup,
              tourn?.roundIntermissionMinutes || 10,
              `Dispute Window Expired: ${winnerResult.reason}`
            );

            if (advanceRes.auditEvent) {
              db.data.auditLogs.push({
                id: uuidv4(),
                actorType: 'SYSTEM',
                actorId: 'SYSTEM',
                actorName: 'Tournament Engine',
                action: advanceRes.auditEvent.action,
                entityType: 'MATCH',
                entityId: match.id,
                metadata: advanceRes.auditEvent,
                timestamp: advanceRes.auditEvent.timestamp
              });
            }

            if (advanceRes.isTournamentComplete && advanceRes.championTeamId) {
              if (tourn) {
                tourn.status = 'COMPLETED';
                tourn.championTeamId = advanceRes.championTeamId;
                tourn.championTeamName = teamLookup[advanceRes.championTeamId]?.name;
                tourn.updatedAt = nowIso;

                db.data.auditLogs.push({
                  id: uuidv4(),
                  actorType: 'SYSTEM',
                  actorId: 'SYSTEM',
                  actorName: 'Tournament Engine',
                  action: 'TOURNAMENT_CHAMPION_CROWNED',
                  entityType: 'TOURNAMENT',
                  entityId: tourn.id,
                  metadata: { championTeamId: advanceRes.championTeamId, championTeamName: tourn.championTeamName },
                  timestamp: nowIso
                });
              }
            }

            if (tourn) {
              tourn.currentRound = calculateTournamentCurrentRound(
                db.data.matches.filter((m) => m.tournamentId === tourn.id),
                tourn.currentRound || 1
              );
            }

            db.data.auditLogs.push({
              id: uuidv4(),
              actorType: 'SYSTEM',
              actorId: 'SYSTEM',
              actorName: 'Tournament Engine',
              action: 'MATCH_AUTO_FINALIZED',
              entityType: 'MATCH',
              entityId: match.id,
              metadata: { winnerTeamId: winnerResult.winnerTeamId, reason: winnerResult.reason },
              timestamp: nowIso
            });
          }

          broadcastEvent('MATCH_UPDATED', { matchId: match.id, tournamentId: match.tournamentId });
        }
      }
    }
  }

  if (hasChanges) {
    db.save();
  }
}
