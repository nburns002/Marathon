import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import express, { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, DatabaseSchema } from '../server/db';
import {
  advanceMatchWinner,
  reconcileMatchAdvancement,
  isDownstreamMatchMateriallyStarted,
  calculateTournamentCurrentRound,
  generateSingleEliminationBracket
} from '../server/bracket';
import { determineMatchWinner, calculateRunScore } from '../server/scoring';
import { processTimerWorkerTick } from '../server/timerWorker';
import { generateToken } from '../server/middleware';
import matchRoutes from '../server/routes/matches';
import adminRoutes from '../server/routes/admin';
import tournamentRoutes from '../server/routes/tournaments';
import { Match, Tournament, Team, User, TournamentRegistration } from '../src/types';

const DB_FILE = path.join(process.cwd(), 'marathon_db.json');
let initialDbBackup: string = '';
let app: Express;
let server: any;
let baseUrl = '';

// Test fixtures
let adminUser: User;
let captainA: User;
let captainB: User;
let otherUser: User;
let teamA: Team;
let teamB: Team;
let teamC: Team;
let teamD: Team;
let testTournament: Tournament;

let adminToken: string;
let captainAToken: string;
let captainBToken: string;
let otherToken: string;

before(async () => {
  // 1. Backup current database file
  if (fs.existsSync(DB_FILE)) {
    initialDbBackup = fs.readFileSync(DB_FILE, 'utf-8');
  }

  // 2. Set up test express server
  app = express();
  app.use(express.json());
  app.use('/api/matches', matchRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/tournaments', tournamentRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'string' ? 3000 : addr.port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  if (server) {
    server.close();
  }
  // Restore original database file
  if (initialDbBackup) {
    fs.writeFileSync(DB_FILE, initialDbBackup, 'utf-8');
    db.data = JSON.parse(initialDbBackup);
  }
});

function setupTestEnvironment() {
  const nowIso = new Date().toISOString();

  // Create Users
  adminUser = {
    id: `usr-admin-${uuidv4().slice(0, 6)}`,
    email: 'admin@test.gg',
    passwordHash: 'hash',
    username: 'TestAdmin',
    displayName: 'Test Admin',
    bungieId: 'Admin#1234',
    avatarUrl: '',
    role: 'ADMIN',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  captainA = {
    id: `usr-capA-${uuidv4().slice(0, 6)}`,
    email: 'capA@test.gg',
    passwordHash: 'hash',
    username: 'CaptainAlpha',
    displayName: 'Captain Alpha',
    bungieId: 'Alpha#0001',
    avatarUrl: '',
    role: 'CAPTAIN',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  captainB = {
    id: `usr-capB-${uuidv4().slice(0, 6)}`,
    email: 'capB@test.gg',
    passwordHash: 'hash',
    username: 'CaptainBravo',
    displayName: 'Captain Bravo',
    bungieId: 'Bravo#0002',
    avatarUrl: '',
    role: 'CAPTAIN',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  otherUser = {
    id: `usr-other-${uuidv4().slice(0, 6)}`,
    email: 'other@test.gg',
    passwordHash: 'hash',
    username: 'OtherPlayer',
    displayName: 'Other Player',
    bungieId: 'Other#9999',
    role: 'PLAYER',
    avatarUrl: '',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  adminToken = generateToken(adminUser);
  captainAToken = generateToken(captainA);
  captainBToken = generateToken(captainB);
  otherToken = generateToken(otherUser);

  // Create Teams
  teamA = {
    id: `team-A-${uuidv4().slice(0, 6)}`,
    name: 'Team Alpha',
    tag: 'ALP',
    logoUrl: 'https://alpha.png',
    captainUserId: captainA.id,
    createdAt: nowIso
  };

  teamB = {
    id: `team-B-${uuidv4().slice(0, 6)}`,
    name: 'Team Bravo',
    tag: 'BRV',
    logoUrl: 'https://bravo.png',
    captainUserId: captainB.id,
    createdAt: nowIso
  };

  teamC = {
    id: `team-C-${uuidv4().slice(0, 6)}`,
    name: 'Team Charlie',
    tag: 'CHL',
    logoUrl: 'https://charlie.png',
    captainUserId: otherUser.id,
    createdAt: nowIso
  };

  teamD = {
    id: `team-D-${uuidv4().slice(0, 6)}`,
    name: 'Team Delta',
    tag: 'DLT',
    logoUrl: 'https://delta.png',
    captainUserId: otherUser.id,
    createdAt: nowIso
  };

  // Create Tournament
  testTournament = {
    id: `tourn-${uuidv4().slice(0, 6)}`,
    title: 'Automated Test Championship',
    description: 'Integration test tournament',
    map: 'Perimeter',
    format: '3-player Public-Lobby Score Race',
    runsPerMatch: 2,
    entryFee: 30,
    prizePool: 1000,
    maxTeams: 4,
    featuredObjectiveTitle: 'Data Vault',
    featuredObjectiveDescription: 'Extract Vault Core',
    featuredObjectivePoints: 5,
    registrationOpenAt: nowIso,
    registrationCloseAt: nowIso,
    tournamentStartAt: nowIso,
    readyWindowMinutes: 10,
    matchWindowMinutes: 75,
    disputeWindowMinutes: 10,
    roundIntermissionMinutes: 10,
    status: 'LIVE',
    currentRound: 1,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  // Populate db.data
  db.data.users.push(adminUser, captainA, captainB, otherUser);
  db.data.teams.push(teamA, teamB, teamC, teamD);
  db.data.tournaments.push(testTournament);
}

describe('Authoritative Match Advancement & Integrity Suite', () => {
  beforeEach(() => {
    // Reset collections
    db.data.users = [];
    db.data.teams = [];
    db.data.tournaments = [];
    db.data.matches = [];
    db.data.matchDisputes = [];
    db.data.matchMessages = [];
    db.data.adminTickets = [];
    db.data.adminActions = [];
    db.data.auditLogs = [];
    setupTestEnvironment();
  });

  // Test 1: Normal match automatic advancement
  test('1. Normal match automatic advancement transitions to WAITING_FOR_ROUND intermission, then TimerWorker opens READY_CHECK', async () => {
    const nowMs = Date.now();
    const pastMs = nowMs - 15 * 60 * 1000; // 15 mins ago

    const finalMatch: Match = {
      id: 'm-round2-final',
      tournamentId: testTournament.id,
      round: 2,
      matchNumber: 3,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: null,
      teamBId: null,
      teamAName: null,
      teamBName: null,
      isBye: false,
      matchStatus: 'WAITING_FOR_ROUND',
      readyDeadlineAt: null,
      intermissionDeadlineAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const semi1: Match = {
      id: 'm-round1-semi1',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: finalMatch.id,
      nextMatchSlot: 'A',
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'RESULT_PENDING',
      disputeDeadlineAt: new Date(pastMs).toISOString(), // expired
      teamARun1: {
        id: 'r1',
        matchId: 'm-round1-semi1',
        teamId: teamA.id,
        runNumber: 1,
        runnerKills: 5,
        extractedCredits: 2000,
        playersExtracted: 3,
        objectiveCompleted: true,
        killPoints: 10,
        lootPoints: 20,
        objectivePoints: 5,
        baseScore: 35,
        survivalMultiplier: 1.5,
        finalRunScore: 52.5,
        submittedBy: captainA.id,
        submittedByName: captainA.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      teamBRun1: {
        id: 'r2',
        matchId: 'm-round1-semi1',
        teamId: teamB.id,
        runNumber: 1,
        runnerKills: 1,
        extractedCredits: 500,
        playersExtracted: 1,
        objectiveCompleted: false,
        killPoints: 2,
        lootPoints: 5,
        objectivePoints: 0,
        baseScore: 7,
        survivalMultiplier: 1.1,
        finalRunScore: 7.7,
        submittedBy: captainB.id,
        submittedByName: captainB.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      finalScoreA: 52.5,
      finalScoreB: 7.7,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.matches.push(semi1, finalMatch);

    // Run authoritative tick
    processTimerWorkerTick();

    // Verify Semi 1 finalized and Team A advanced into finalMatch slot A
    assert.strictEqual(semi1.matchStatus, 'FINAL');
    assert.strictEqual(semi1.winnerTeamId, teamA.id);
    assert.strictEqual(finalMatch.teamAId, teamA.id);
    assert.strictEqual(finalMatch.teamAName, teamA.name);
    // Since slot B is still empty, finalMatch remains in WAITING_FOR_ROUND without intermission
    assert.strictEqual(finalMatch.matchStatus, 'WAITING_FOR_ROUND');
    assert.strictEqual(finalMatch.readyDeadlineAt, null);

    // Now populate slot B with Team C
    const semi2: Match = {
      id: 'm-round1-semi2',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 2,
      bracketPosition: 1,
      nextMatchId: finalMatch.id,
      nextMatchSlot: 'B',
      teamAId: teamC.id,
      teamBId: teamD.id,
      teamAName: teamC.name,
      teamBName: teamD.name,
      isBye: false,
      matchStatus: 'FINAL',
      winnerTeamId: teamC.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.data.matches.push(semi2);

    const teamLookup = {
      [teamA.id]: { name: teamA.name, logoUrl: teamA.logoUrl },
      [teamB.id]: { name: teamB.name, logoUrl: teamB.logoUrl },
      [teamC.id]: { name: teamC.name, logoUrl: teamC.logoUrl },
      [teamD.id]: { name: teamD.name, logoUrl: teamD.logoUrl }
    };

    // Advance semi 2 winner
    advanceMatchWinner(db.data.matches, semi2.id, teamC.id, teamLookup, 10);

    // Both team slots of finalMatch are now populated!
    assert.strictEqual(finalMatch.teamAId, teamA.id);
    assert.strictEqual(finalMatch.teamBId, teamC.id);
    assert.strictEqual(finalMatch.matchStatus, 'WAITING_FOR_ROUND');
    assert.ok(finalMatch.intermissionDeadlineAt !== null);
    assert.strictEqual(finalMatch.readyDeadlineAt, null); // CRITICAL: readyDeadlineAt NOT set during intermission

    // Test that captain CANNOT ready up while in WAITING_FOR_ROUND intermission
    const readyRes = await fetch(`${baseUrl}/api/matches/${finalMatch.id}/ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      }
    });
    assert.strictEqual(readyRes.status, 400);
    const readyBody = await readyRes.json();
    assert.match(readyBody.error, /intermission/i);

    // Fast forward past intermissionDeadlineAt
    finalMatch.intermissionDeadlineAt = new Date(Date.now() - 1000).toISOString();
    processTimerWorkerTick();

    // Now authoritative TimerWorker should transition finalMatch to READY_CHECK!
    assert.strictEqual(finalMatch.matchStatus, 'READY_CHECK');
    assert.ok(finalMatch.readyDeadlineAt !== null);
    assert.strictEqual(finalMatch.intermissionDeadlineAt, null);
  });

  // Test 2: Tiebreaker winner advancement
  test('2. Tiebreaker winner advancement resolves dead-heat on secondary metrics', async () => {
    const semi: Match = {
      id: 'm-tiebreaker-test',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'RESULT_PENDING',
      disputeDeadlineAt: new Date(Date.now() - 1000).toISOString(),
      // Identical final scores of 50.00 pts, but Team A has 10 kills vs Team B 5 kills
      teamARun1: {
        id: 'rA1',
        matchId: 'm-tiebreaker-test',
        teamId: teamA.id,
        runNumber: 1,
        runnerKills: 10,
        extractedCredits: 1000,
        playersExtracted: 3,
        objectiveCompleted: false,
        killPoints: 20,
        lootPoints: 10,
        objectivePoints: 0,
        baseScore: 30,
        survivalMultiplier: 1.5,
        finalRunScore: 50.0,
        submittedBy: captainA.id,
        submittedByName: captainA.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      teamBRun1: {
        id: 'rB1',
        matchId: 'm-tiebreaker-test',
        teamId: teamB.id,
        runNumber: 1,
        runnerKills: 5,
        extractedCredits: 1000,
        playersExtracted: 3,
        objectiveCompleted: false,
        killPoints: 10,
        lootPoints: 10,
        objectivePoints: 0,
        baseScore: 30,
        survivalMultiplier: 1.5,
        finalRunScore: 50.0,
        submittedBy: captainB.id,
        submittedByName: captainB.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      finalScoreA: 50.0,
      finalScoreB: 50.0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.matches.push(semi);

    processTimerWorkerTick();

    assert.strictEqual(semi.matchStatus, 'FINAL');
    assert.strictEqual(semi.winnerTeamId, teamA.id); // Team A won by runner kills tiebreaker
  });

  // Test 3: Dispute freezes advancement
  test('3. Dispute freezes advancement until resolution', async () => {
    const match: Match = {
      id: 'm-dispute-freeze',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'RESULT_PENDING',
      disputeDeadlineAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min in future
      teamARun1: {
        id: 'r1',
        matchId: 'm-dispute-freeze',
        teamId: teamA.id,
        runNumber: 1,
        runnerKills: 5,
        extractedCredits: 1000,
        playersExtracted: 3,
        objectiveCompleted: false,
        killPoints: 10,
        lootPoints: 10,
        objectivePoints: 0,
        baseScore: 20,
        survivalMultiplier: 1.5,
        finalRunScore: 30.0,
        submittedBy: captainA.id,
        submittedByName: captainA.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      teamBRun1: {
        id: 'r2',
        matchId: 'm-dispute-freeze',
        teamId: teamB.id,
        runNumber: 1,
        runnerKills: 2,
        extractedCredits: 500,
        playersExtracted: 2,
        objectiveCompleted: false,
        killPoints: 4,
        lootPoints: 5,
        objectivePoints: 0,
        baseScore: 9,
        survivalMultiplier: 1.25,
        finalRunScore: 11.25,
        submittedBy: captainB.id,
        submittedByName: captainB.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      finalScoreA: 30.0,
      finalScoreB: 11.25,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.matches.push(match);

    // Captain B flags the result
    const flagRes = await fetch(`${baseUrl}/api/matches/${match.id}/flag-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainBToken}`
      },
      body: JSON.stringify({
        runNumber: 1,
        category: 'Kill Count Discrepancy',
        description: 'Opponent reported kills outside the recorded zone'
      })
    });

    assert.strictEqual(flagRes.status, 200);
    assert.strictEqual(match.matchStatus, 'DISPUTED');

    // Simulate time passing past original dispute deadline
    match.disputeDeadlineAt = new Date(Date.now() - 1000).toISOString();
    processTimerWorkerTick();

    // Match remains frozen in DISPUTED, no winner declared
    assert.strictEqual(match.matchStatus, 'DISPUTED');
    assert.strictEqual(match.winnerTeamId, undefined);
  });

  // Test 4: Resolved dispute enters 5-minute confirmation and then advances
  test('4. Resolved dispute enters 5-minute confirmation and then advances', async () => {
    const match: Match = {
      id: 'm-resolve-dispute',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'DISPUTED',
      teamARun1: {
        id: 'r1',
        matchId: 'm-resolve-dispute',
        teamId: teamA.id,
        runNumber: 1,
        runnerKills: 5,
        extractedCredits: 1000,
        playersExtracted: 3,
        objectiveCompleted: false,
        killPoints: 10,
        lootPoints: 10,
        objectivePoints: 0,
        baseScore: 20,
        survivalMultiplier: 1.5,
        finalRunScore: 30.0,
        submittedBy: captainA.id,
        submittedByName: captainA.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      teamBRun1: {
        id: 'r2',
        matchId: 'm-resolve-dispute',
        teamId: teamB.id,
        runNumber: 1,
        runnerKills: 1,
        extractedCredits: 500,
        playersExtracted: 1,
        objectiveCompleted: false,
        killPoints: 2,
        lootPoints: 5,
        objectivePoints: 0,
        baseScore: 7,
        survivalMultiplier: 1.1,
        finalRunScore: 7.7,
        submittedBy: captainB.id,
        submittedByName: captainB.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      finalScoreA: 30.0,
      finalScoreB: 7.7,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const dispute = {
      id: 'disp-test-1',
      matchId: match.id,
      requestingTeamId: teamB.id,
      requestingTeamName: teamB.name,
      disputedTeamId: teamA.id,
      disputedTeamName: teamA.name,
      category: 'Review',
      description: 'Check VOD timestamp',
      evidenceUrls: [],
      status: 'OPEN' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.matches.push(match);
    db.data.matchDisputes.push(dispute);

    // Admin resolves the dispute
    const resolveRes = await fetch(`${baseUrl}/api/admin/disputes/${dispute.id}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        resolution: 'Ruling confirmed. Kills verified on referee stream.',
        ruling: 'CONFIRMED',
        reason: 'Stream audit matches submitted telemetry'
      })
    });

    assert.strictEqual(resolveRes.status, 200);
    assert.strictEqual(match.matchStatus, 'RESULT_PENDING');
    assert.ok(match.disputeDeadlineAt !== null);

    // Run tick while still within 5 min -> does NOT advance
    processTimerWorkerTick();
    assert.strictEqual(match.matchStatus, 'RESULT_PENDING');

    // Simulate 5 min expiring
    match.disputeDeadlineAt = new Date(Date.now() - 1000).toISOString();
    processTimerWorkerTick();

    // Now auto-finalizes and declares winner
    assert.strictEqual(match.matchStatus, 'FINAL');
    assert.strictEqual(match.winnerTeamId, teamA.id);
  });

  // Test 5: Ready-check forfeit advancement
  test('5. Ready-check forfeit advancement awards forfeit and advances ready team', async () => {
    const nextMatch: Match = {
      id: 'm-downstream-forfeit',
      tournamentId: testTournament.id,
      round: 2,
      matchNumber: 2,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: null,
      teamBId: null,
      isBye: false,
      matchStatus: 'WAITING_FOR_ROUND',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const match: Match = {
      id: 'm-rc-forfeit',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: nextMatch.id,
      nextMatchSlot: 'A',
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'READY_CHECK',
      teamAReady: true,
      teamBReady: false,
      readyDeadlineAt: new Date(Date.now() - 1000).toISOString(), // expired
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.matches.push(match, nextMatch);

    processTimerWorkerTick();

    assert.strictEqual(match.matchStatus, 'FORFEIT');
    assert.strictEqual(match.winnerTeamId, teamA.id);
    assert.strictEqual(match.loserTeamId, teamB.id);
    assert.strictEqual(nextMatch.teamAId, teamA.id);
  });

  // Test 6: Reverse forfeit removes the old downstream participant
  test('6. Reverse forfeit removes the old downstream participant and resets downstream status', async () => {
    const downstream: Match = {
      id: 'm-downstream-rf',
      tournamentId: testTournament.id,
      round: 2,
      matchNumber: 2,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: null,
      isBye: false,
      matchStatus: 'WAITING_FOR_ROUND',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const source: Match = {
      id: 'm-source-rf',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: downstream.id,
      nextMatchSlot: 'A',
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      winnerTeamId: teamA.id,
      loserTeamId: teamB.id,
      isBye: false,
      matchStatus: 'FORFEIT',
      forfeitReason: 'No show',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.matches.push(source, downstream);

    // Call REVERSE_FORFEIT via API
    const rfRes = await fetch(`${baseUrl}/api/admin/matches/${source.id}/control-timer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        action: 'REVERSE_FORFEIT',
        reason: 'Captain experienced verified ISP connectivity outage'
      })
    });

    assert.strictEqual(rfRes.status, 200);
    assert.strictEqual(source.matchStatus, 'ACTIVE');
    assert.strictEqual(source.winnerTeamId, null);

    // Authoritative check: Team A must be cleanly removed from downstream match!
    assert.strictEqual(downstream.teamAId, null);
    assert.strictEqual(downstream.teamAName, null);
    assert.strictEqual(downstream.matchStatus, 'WAITING_FOR_ROUND');
  });

  // Test 7: BYE advancement
  test('7. BYE advancement populates downstream match and initiates intermission when both entrants present', () => {
    const teamLookup = {
      [teamA.id]: { name: teamA.name, logoUrl: teamA.logoUrl },
      [teamB.id]: { name: teamB.name, logoUrl: teamB.logoUrl },
      [teamC.id]: { name: teamC.name, logoUrl: teamC.logoUrl }
    };

    const regs: TournamentRegistration[] = [
      {
        id: 'reg-1',
        tournamentId: testTournament.id,
        teamId: teamA.id,
        teamName: teamA.name,
        captainUserId: captainA.id,
        status: 'REGISTERED',
        paymentStatus: 'PAID',
        rosterSnapshot: [],
        registeredAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
        refundPolicyAcceptedAt: new Date().toISOString()
      },
      {
        id: 'reg-2',
        tournamentId: testTournament.id,
        teamId: teamB.id,
        teamName: teamB.name,
        captainUserId: captainB.id,
        status: 'REGISTERED',
        paymentStatus: 'PAID',
        rosterSnapshot: [],
        registeredAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
        refundPolicyAcceptedAt: new Date().toISOString()
      },
      {
        id: 'reg-3',
        tournamentId: testTournament.id,
        teamId: teamC.id,
        teamName: teamC.name,
        captainUserId: otherUser.id,
        status: 'REGISTERED',
        paymentStatus: 'PAID',
        rosterSnapshot: [],
        registeredAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
        refundPolicyAcceptedAt: new Date().toISOString()
      }
    ];

    const { matches } = generateSingleEliminationBracket(testTournament.id, regs, teamLookup, 10);

    // In a 3-team bracket (size 4), there is 1 BYE match in Round 1
    const byeMatch = matches.find((m) => m.round === 1 && m.isBye);
    assert.ok(byeMatch, 'A BYE match must exist in a 3-team bracket');
    assert.strictEqual(byeMatch.matchStatus, 'FINAL');
    assert.ok(byeMatch.winnerTeamId !== null);

    // Check that the winning team from the BYE match advanced into Round 2 (the Final)
    const finalMatch = matches.find((m) => m.round === 2);
    assert.ok(finalMatch, 'Round 2 Final match must exist');
    const slotOccupant = byeMatch.nextMatchSlot === 'A' ? finalMatch.teamAId : finalMatch.teamBId;
    assert.strictEqual(slotOccupant, byeMatch.winnerTeamId);
  });

  // Test 8: Semifinal winner enters correct Final slot
  test('8. Semifinal winner enters correct Final slot (Slot A vs Slot B)', () => {
    const teamLookup = {
      [teamA.id]: { name: teamA.name },
      [teamB.id]: { name: teamB.name },
      [teamC.id]: { name: teamC.name },
      [teamD.id]: { name: teamD.name }
    };

    const finalMatch: Match = {
      id: 'm-finals',
      tournamentId: testTournament.id,
      round: 2,
      matchNumber: 3,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: null,
      teamBId: null,
      isBye: false,
      matchStatus: 'WAITING_FOR_ROUND',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const semi1: Match = {
      id: 'm-semi-1',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: finalMatch.id,
      nextMatchSlot: 'A',
      teamAId: teamA.id,
      teamBId: teamB.id,
      isBye: false,
      matchStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const semi2: Match = {
      id: 'm-semi-2',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 2,
      bracketPosition: 1,
      nextMatchId: finalMatch.id,
      nextMatchSlot: 'B',
      teamAId: teamC.id,
      teamBId: teamD.id,
      isBye: false,
      matchStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const allMatches = [semi1, semi2, finalMatch];

    advanceMatchWinner(allMatches, semi1.id, teamA.id, teamLookup, 10);
    assert.strictEqual(finalMatch.teamAId, teamA.id);
    assert.strictEqual(finalMatch.teamBId, null);

    advanceMatchWinner(allMatches, semi2.id, teamD.id, teamLookup, 10);
    assert.strictEqual(finalMatch.teamAId, teamA.id);
    assert.strictEqual(finalMatch.teamBId, teamD.id);
  });

  // Test 9: Final winner sets tournament champion and COMPLETED status
  test('9. Final winner sets tournament champion and COMPLETED status', () => {
    const teamLookup = {
      [teamA.id]: { name: teamA.name }
    };

    const finalMatch: Match = {
      id: 'm-championship-match',
      tournamentId: testTournament.id,
      round: 2,
      matchNumber: 3,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: teamA.id,
      teamBId: teamB.id,
      isBye: false,
      matchStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const res = advanceMatchWinner([finalMatch], finalMatch.id, teamA.id, teamLookup, 10);

    assert.strictEqual(res.isTournamentComplete, true);
    assert.strictEqual(res.championTeamId, teamA.id);
    assert.strictEqual(finalMatch.matchStatus, 'FINAL');
    assert.strictEqual(finalMatch.winnerTeamId, teamA.id);
  });

  // Test 10: Repeated advancement is idempotent
  test('10. Repeated advancement is idempotent and conflicts trigger bracket integrity errors', () => {
    const teamLookup = {
      [teamA.id]: { name: teamA.name },
      [teamB.id]: { name: teamB.name },
      [teamC.id]: { name: teamC.name }
    };

    const finalMatch: Match = {
      id: 'm-idemp-final',
      tournamentId: testTournament.id,
      round: 2,
      matchNumber: 2,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: null,
      teamBId: null,
      isBye: false,
      matchStatus: 'WAITING_FOR_ROUND',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const semi: Match = {
      id: 'm-idemp-semi',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: finalMatch.id,
      nextMatchSlot: 'A',
      teamAId: teamA.id,
      teamBId: teamB.id,
      isBye: false,
      matchStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const matches = [semi, finalMatch];

    // First advancement
    const res1 = advanceMatchWinner(matches, semi.id, teamA.id, teamLookup, 10);
    assert.strictEqual(res1.success, true);
    assert.strictEqual(finalMatch.teamAId, teamA.id);

    // Second advancement with same winner (idempotent no-op)
    const res2 = advanceMatchWinner(matches, semi.id, teamA.id, teamLookup, 10);
    assert.strictEqual(res2.success, true);
    assert.strictEqual(finalMatch.teamAId, teamA.id);

    // If downstream slot contains a different team (integrity conflict)
    finalMatch.teamAId = teamC.id;
    const resConflict = advanceMatchWinner(matches, semi.id, teamA.id, teamLookup, 10);
    assert.strictEqual(resConflict.success, false);
    assert.match(resConflict.error || '', /integrity conflict/i);
  });

  // Test 11: Late dispute is rejected
  test('11. Late dispute is rejected after dispute deadline or when match is FINAL', async () => {
    const match: Match = {
      id: 'm-late-dispute',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'FINAL',
      winnerTeamId: teamA.id,
      disputeDeadlineAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.matches.push(match);

    const disputeRes = await fetch(`${baseUrl}/api/matches/${match.id}/flag-result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainBToken}`
      },
      body: JSON.stringify({
        description: 'Late dispute attempt'
      })
    });

    assert.strictEqual(disputeRes.status, 400);
    const body = await disputeRes.json();
    assert.match(body.error, /finalized/i);
  });

  // Test 12: Invalid admin winnerTeamId is rejected
  test('12. Invalid admin winnerTeamId is rejected with 400 Bad Request', async () => {
    const match: Match = {
      id: 'm-invalid-winner-override',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.matches.push(match);

    const overrideRes = await fetch(`${baseUrl}/api/admin/matches/${match.id}/override-winner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        winnerTeamId: 'bogus-random-team-id',
        reason: 'Illegal override attempt'
      })
    });

    assert.strictEqual(overrideRes.status, 400);
    const body = await overrideRes.json();
    assert.match(body.error, /invalid winner team id/i);
  });

  // Test 13: Changing an upstream winner while downstream match is active is blocked
  test('13. Changing an upstream winner while downstream match is active is blocked', async () => {
    const downstream: Match = {
      id: 'm-active-downstream',
      tournamentId: testTournament.id,
      round: 2,
      matchNumber: 2,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamC.id,
      teamBName: teamC.name,
      isBye: false,
      matchStatus: 'ACTIVE', // In progress!
      matchStartedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const upstream: Match = {
      id: 'm-upstream-match',
      tournamentId: testTournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: downstream.id,
      nextMatchSlot: 'A',
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      winnerTeamId: teamA.id,
      loserTeamId: teamB.id,
      isBye: false,
      matchStatus: 'FINAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.data.matches.push(upstream, downstream);

    // Admin tries to change winner of upstream to Team B
    const overrideRes = await fetch(`${baseUrl}/api/admin/matches/${upstream.id}/override-winner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        winnerTeamId: teamB.id,
        reason: 'Attempted retroactive winner flip'
      })
    });

    assert.strictEqual(overrideRes.status, 400);
    const body = await overrideRes.json();
    assert.match(body.error, /already in progress/i);
  });

  // Test 14: Persisted RESULT_PENDING state finalizes correctly after server restart
  test('14. Persisted RESULT_PENDING state finalizes correctly after server restart', () => {
    const restartTournId = `tourn-restart-${uuidv4().slice(0, 6)}`;
    const restartMatchId = `match-restart-${uuidv4().slice(0, 6)}`;

    const match: Match = {
      id: restartMatchId,
      tournamentId: restartTournId,
      round: 1,
      matchNumber: 1,
      bracketPosition: 0,
      nextMatchId: null,
      nextMatchSlot: null,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'RESULT_PENDING',
      disputeDeadlineAt: new Date(Date.now() - 5000).toISOString(), // expired
      teamARun1: {
        id: 'rA',
        matchId: restartMatchId,
        teamId: teamA.id,
        runNumber: 1,
        runnerKills: 8,
        extractedCredits: 1200,
        playersExtracted: 3,
        objectiveCompleted: true,
        killPoints: 16,
        lootPoints: 12,
        objectivePoints: 5,
        baseScore: 33,
        survivalMultiplier: 1.5,
        finalRunScore: 49.5,
        submittedBy: captainA.id,
        submittedByName: captainA.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      teamBRun1: {
        id: 'rB',
        matchId: restartMatchId,
        teamId: teamB.id,
        runNumber: 1,
        runnerKills: 2,
        extractedCredits: 400,
        playersExtracted: 1,
        objectiveCompleted: false,
        killPoints: 4,
        lootPoints: 4,
        objectivePoints: 0,
        baseScore: 8,
        survivalMultiplier: 1.1,
        finalRunScore: 8.8,
        submittedBy: captainB.id,
        submittedByName: captainB.username,
        submittedAt: new Date().toISOString(),
        locked: true
      },
      finalScoreA: 49.5,
      finalScoreB: 8.8,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const restartTourn: Tournament = {
      ...testTournament,
      id: restartTournId
    };

    db.data.tournaments.push(restartTourn);
    db.data.matches.push(match);

    // Save to disk immediately
    db.saveImmediate();

    // Re-read file from disk into a fresh schema object (simulating server restart)
    const diskJson = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as DatabaseSchema;
    db.data = diskJson;

    // Run authoritative tick
    processTimerWorkerTick();

    const finalizedMatch = db.data.matches.find((m) => m.id === restartMatchId);
    assert.ok(finalizedMatch);
    assert.strictEqual(finalizedMatch.matchStatus, 'FINAL');
    assert.strictEqual(finalizedMatch.winnerTeamId, teamA.id);
  });
});
