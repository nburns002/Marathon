import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'marathon_test_suite_secure_jwt_secret_32_characters';

import fs from 'fs';
import path from 'path';
import express, { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../server/db';
import { generateToken } from '../server/middleware';
import matchRoutes from '../server/routes/matches';
import adminRoutes from '../server/routes/admin';
import tournamentRoutes from '../server/routes/tournaments';
import teamRoutes from '../server/routes/teams';
import authRoutes from '../server/routes/auth';
import { Match, Tournament, Team, UserRecord, TournamentRegistration } from '../src/types';

const DB_FILE = path.join(process.cwd(), 'marathon_db.json');
let initialDbBackup: string = '';
let app: Express;
let server: any;
let baseUrl = '';

let adminUser: UserRecord;
let captainA: UserRecord;
let memberA2: UserRecord;
let memberA3: UserRecord;
let captainB: UserRecord;
let memberB2: UserRecord;
let memberB3: UserRecord;
let outsiderUser: UserRecord;

let teamA: Team;
let teamB: Team;
let tournament: Tournament;

let adminToken: string;
let captainAToken: string;
let captainBToken: string;
let outsiderToken: string;

before(async () => {
  if (fs.existsSync(DB_FILE)) {
    initialDbBackup = fs.readFileSync(DB_FILE, 'utf-8');
  }

  app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/matches', matchRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/teams', teamRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  if (server) server.close();
  if (initialDbBackup) {
    fs.writeFileSync(DB_FILE, initialDbBackup, 'utf-8');
  }
});

beforeEach(() => {
  const now = new Date().toISOString();

  adminUser = {
    id: 'usr-admin-req',
    email: 'admin.req@marathon.test',
    username: 'adminReq',
    displayName: 'Ref Admin',
    bungieId: 'Admin#9999',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'ADMIN',
    accountStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    passwordHash: 'hash'
  };

  captainA = {
    id: 'usr-cap-a',
    email: 'cap.a@marathon.test',
    username: 'capA',
    displayName: 'Captain Alpha',
    bungieId: 'AlphaCap#1111',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'CAPTAIN',
    accountStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    passwordHash: 'hash'
  };

  memberA2 = {
    id: 'usr-mem-a2',
    email: 'mem.a2@marathon.test',
    username: 'memA2',
    displayName: 'Member A2',
    bungieId: 'AlphaTwo#1112',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    passwordHash: 'hash'
  };

  memberA3 = {
    id: 'usr-mem-a3',
    email: 'mem.a3@marathon.test',
    username: 'memA3',
    displayName: 'Member A3',
    bungieId: 'AlphaThree#1113',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    passwordHash: 'hash'
  };

  captainB = {
    id: 'usr-cap-b',
    email: 'cap.b@marathon.test',
    username: 'capB',
    displayName: 'Captain Beta',
    bungieId: 'BetaCap#2221',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'CAPTAIN',
    accountStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    passwordHash: 'hash'
  };

  memberB2 = {
    id: 'usr-mem-b2',
    email: 'mem.b2@marathon.test',
    username: 'memB2',
    displayName: 'Member B2',
    bungieId: 'BetaTwo#2222',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    passwordHash: 'hash'
  };

  memberB3 = {
    id: 'usr-mem-b3',
    email: 'mem.b3@marathon.test',
    username: 'memB3',
    displayName: 'Member B3',
    bungieId: 'BetaThree#2223',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    passwordHash: 'hash'
  };

  outsiderUser = {
    id: 'usr-outsider',
    email: 'outsider@marathon.test',
    username: 'outsider',
    displayName: 'Random Outsider',
    bungieId: 'Outsider#5555',
    avatarUrl: 'https://example.com/avatar.png',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    passwordHash: 'hash'
  };

  teamA = {
    id: 'team-a-req',
    name: 'Team Alpha',
    tag: 'ALP',
    logoUrl: 'https://example.com/alpha.png',
    captainUserId: captainA.id,
    createdAt: now
  };

  teamB = {
    id: 'team-b-req',
    name: 'Team Beta',
    tag: 'BET',
    logoUrl: 'https://example.com/beta.png',
    captainUserId: captainB.id,
    createdAt: now
  };

  tournament = {
    id: 'tourn-req',
    title: 'Marathon Invitational',
    description: 'Premier Marathon Invitational',
    map: 'Outpost',
    format: '3-player Score Race',
    runsPerMatch: 2,
    entryFee: 0,
    prizePool: 1000,
    maxTeams: 8,
    featuredObjectiveTitle: 'Core Extraction',
    featuredObjectiveDescription: 'Extract core terminal encrypted data drive',
    featuredObjectivePoints: 5,
    registrationOpenAt: now,
    registrationCloseAt: new Date(Date.now() + 86400000).toISOString(),
    tournamentStartAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    readyWindowMinutes: 10,
    matchWindowMinutes: 75,
    disputeWindowMinutes: 10,
    roundIntermissionMinutes: 10,
    status: 'REGISTRATION_OPEN',
    currentRound: 1,
    createdAt: now,
    updatedAt: now
  };

  db.data.users = [adminUser, captainA, memberA2, memberA3, captainB, memberB2, memberB3, outsiderUser];
  db.data.teams = [teamA, teamB];
  db.data.teamMembers = [
    { id: 'tm-1', teamId: teamA.id, userId: captainA.id, role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: now },
    { id: 'tm-2', teamId: teamA.id, userId: memberA2.id, role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: now },
    { id: 'tm-3', teamId: teamA.id, userId: memberA3.id, role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: now },
    { id: 'tm-4', teamId: teamB.id, userId: captainB.id, role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: now },
    { id: 'tm-5', teamId: teamB.id, userId: memberB2.id, role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: now },
    { id: 'tm-6', teamId: teamB.id, userId: memberB3.id, role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: now }
  ];
  db.data.tournaments = [tournament];
  db.data.tournamentRegistrations = [];
  db.data.matches = [];
  db.data.brackets = [];
  db.data.runSubmissions = [];
  db.data.matchMessages = [];
  db.data.matchEvidence = [];
  db.data.matchDisputes = [];
  db.data.adminTickets = [];
  db.data.adminActions = [];
  db.data.auditLogs = [];

  adminToken = generateToken(adminUser);
  captainAToken = generateToken(captainA);
  captainBToken = generateToken(captainB);
  outsiderToken = generateToken(outsiderUser);
});

describe('User Requests & Defect Resolution Suite', () => {
  test('1. Admin registers team on its behalf -> registration.captainUserId is the actual captain, who remains authoritative', async () => {
    // Admin registers teamA on its behalf
    const regRes = await fetch(`${baseUrl}/api/tournaments/${tournament.id}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        teamId: teamA.id,
        termsAccepted: true,
        refundPolicyAccepted: true
      })
    });

    assert.equal(regRes.status, 200, 'Admin registration should succeed');
    const regData = await regRes.json();
    assert.equal(regData.success, true);
    assert.equal(regData.registration.captainUserId, teamA.captainUserId, 'captainUserId must be the team actual captain, NOT admin');

    // Create active match with teamA
    const match: Match = {
      id: 'match-cap-test',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'READY_CHECK',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.data.matches.push(match);

    // Captain A can ready check
    const readyRes = await fetch(`${baseUrl}/api/matches/${match.id}/ready`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      }
    });
    assert.equal(readyRes.status, 200, 'Actual captain must be authoritative for ready check');
    const readyData = await readyRes.json();
    assert.equal(readyData.match.teamAReady, true);
  });

  test('2. Tournament detail registry returns enriched fields: teamLogo, captainName, seed, and snapshotted Bungie IDs', async () => {
    // Register Team A and Team B
    const now = new Date().toISOString();
    const regA: TournamentRegistration = {
      id: 'reg-a',
      tournamentId: tournament.id,
      teamId: teamA.id,
      teamName: teamA.name,
      captainUserId: captainA.id,
      status: 'REGISTERED',
      paymentStatus: 'PAID',
      rosterSnapshot: [
        { userId: captainA.id, usernameSnapshot: captainA.username, displayNameSnapshot: captainA.displayName, bungieIdSnapshot: captainA.bungieId },
        { userId: memberA2.id, usernameSnapshot: memberA2.username, displayNameSnapshot: memberA2.displayName, bungieIdSnapshot: memberA2.bungieId },
        { userId: memberA3.id, usernameSnapshot: memberA3.username, displayNameSnapshot: memberA3.displayName, bungieIdSnapshot: memberA3.bungieId }
      ],
      registeredAt: now,
      termsAcceptedAt: now,
      refundPolicyAcceptedAt: now
    };
    db.data.tournamentRegistrations.push(regA);

    // Fetch tournament detail
    const res = await fetch(`${baseUrl}/api/tournaments/${tournament.id}`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.registrations.length, 1);
    const reg = data.registrations[0];
    assert.equal(reg.teamLogo, teamA.logoUrl);
    assert.equal(reg.captainName, captainA.displayName);
    assert.equal(reg.rosterSnapshot.length, 3);
    assert.equal(reg.rosterSnapshot[0].displayNameSnapshot, captainA.displayName);
    assert.equal(reg.rosterSnapshot[0].bungieIdSnapshot, captainA.bungieId);
  });

  test('3. /api/auth/me returns TeamSummary with captainUserId, team.captain, and member.user details', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${captainAToken}` }
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(data.teams);
    const teamSummary = data.teams.find((t: any) => t.id === teamA.id);
    assert.ok(teamSummary, 'Team Alpha must be in user teams');
    assert.equal(teamSummary.captainUserId, captainA.id);
    assert.equal(teamSummary.captain.displayName, captainA.displayName);
    assert.ok(teamSummary.members.length >= 1);
    assert.equal(teamSummary.members[0].user.displayName, captainA.displayName);
    assert.equal(teamSummary.members[0].user.bungieId, captainA.bungieId);
  });

  test('4. Run 1 evidence leak prevention: opponent and anonymous spectator cannot retrieve Run 1 VOD URL before reveal', async () => {
    const now = new Date().toISOString();
    const regA: TournamentRegistration = {
      id: 'reg-a',
      tournamentId: tournament.id,
      teamId: teamA.id,
      teamName: teamA.name,
      captainUserId: captainA.id,
      status: 'REGISTERED',
      paymentStatus: 'PAID',
      rosterSnapshot: [
        { userId: captainA.id, usernameSnapshot: captainA.username, displayNameSnapshot: captainA.displayName, bungieIdSnapshot: captainA.bungieId },
        { userId: memberA2.id, usernameSnapshot: memberA2.username, displayNameSnapshot: memberA2.displayName, bungieIdSnapshot: memberA2.bungieId },
        { userId: memberA3.id, usernameSnapshot: memberA3.username, displayNameSnapshot: memberA3.displayName, bungieIdSnapshot: memberA3.bungieId }
      ],
      registeredAt: now,
      termsAcceptedAt: now,
      refundPolicyAcceptedAt: now
    };
    const regB: TournamentRegistration = {
      id: 'reg-b',
      tournamentId: tournament.id,
      teamId: teamB.id,
      teamName: teamB.name,
      captainUserId: captainB.id,
      status: 'REGISTERED',
      paymentStatus: 'PAID',
      rosterSnapshot: [
        { userId: captainB.id, usernameSnapshot: captainB.username, displayNameSnapshot: captainB.displayName, bungieIdSnapshot: captainB.bungieId },
        { userId: memberB2.id, usernameSnapshot: memberB2.username, displayNameSnapshot: memberB2.displayName, bungieIdSnapshot: memberB2.bungieId },
        { userId: memberB3.id, usernameSnapshot: memberB3.username, displayNameSnapshot: memberB3.displayName, bungieIdSnapshot: memberB3.bungieId }
      ],
      registeredAt: now,
      termsAcceptedAt: now,
      refundPolicyAcceptedAt: now
    };
    db.data.tournamentRegistrations.push(regA, regB);

    const match: Match = {
      id: 'match-evidence-leak-test',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'RUN_1_PARTIAL',
      run1Revealed: false,
      createdAt: now,
      updatedAt: now
    };
    db.data.matches.push(match);

    // Upload Run 1 evidence for Team A
    db.data.matchEvidence.push({
      id: 'ev-a-run1',
      matchId: match.id,
      teamId: teamA.id,
      teamName: teamA.name,
      runNumber: 1,
      type: 'VOD',
      url: 'https://twitch.tv/videos/alpha-secret-run1-vod',
      description: 'Alpha Run 1 Full VOD Stream',
      uploadedBy: captainA.id,
      uploadedByName: captainA.displayName,
      createdAt: now
    });

    // 1. Team A viewer checks match -> receives Run 1 evidence
    const teamARes = await fetch(`${baseUrl}/api/matches/${match.id}`, {
      headers: { Authorization: `Bearer ${captainAToken}` }
    });
    const teamAData = await teamARes.json();
    assert.equal(teamAData.evidence.length, 1);
    assert.equal(teamAData.evidence[0].url, 'https://twitch.tv/videos/alpha-secret-run1-vod');

    // 2. Team B viewer (opponent) checks match -> MUST NOT receive Team A Run 1 evidence
    const teamBRes = await fetch(`${baseUrl}/api/matches/${match.id}`, {
      headers: { Authorization: `Bearer ${captainBToken}` }
    });
    const teamBData = await teamBRes.json();
    assert.equal(teamBData.evidence.length, 0, 'Opponent must not see Team A unrevealed Run 1 evidence');

    // 3. Anonymous spectator checks match -> MUST NOT receive Team A Run 1 evidence
    const anonRes = await fetch(`${baseUrl}/api/matches/${match.id}`);
    const anonData = await anonRes.json();
    assert.equal(anonData.evidence.length, 0, 'Anonymous spectator must not see unrevealed Run 1 evidence');

    // 4. Admin checks match -> Admin sees all evidence
    const adminRes = await fetch(`${baseUrl}/api/matches/${match.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminData = await adminRes.json();
    assert.equal(adminData.evidence.length, 1, 'Admin must see evidence');
  });

  test('5. Admin tickets visibility: anonymous spectators receive zero admin tickets', async () => {
    const match: Match = {
      id: 'match-ticket-vis-test',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
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

    db.data.adminTickets.push({
      id: 'tkt-private-1',
      matchId: match.id,
      tournamentId: tournament.id,
      requestingUserId: captainA.id,
      requestingUserName: captainA.displayName,
      requestingTeamId: teamA.id,
      requestingTeamName: teamA.name,
      category: 'Referee Assistance',
      description: 'Opponent disconnect check requested',
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Anonymous spectator
    const anonRes = await fetch(`${baseUrl}/api/matches/${match.id}`);
    const anonData = await anonRes.json();
    assert.deepEqual(anonData.adminTickets, [], 'Anonymous spectator must not receive admin tickets');

    // Admin sees full ticket
    const adminRes = await fetch(`${baseUrl}/api/matches/${match.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminData = await adminRes.json();
    assert.equal(adminData.adminTickets.length, 1);
  });

  test('6. Dispute description fallback: request providing only reason creates dispute and ticket without exception', async () => {
    const match: Match = {
      id: 'match-dispute-reason-test',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'RESULT_PENDING',
      disputeDeadlineAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.data.matches.push(match);

    const disputeRes = await fetch(`${baseUrl}/api/matches/${match.id}/dispute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      },
      body: JSON.stringify({
        category: 'Scoring Discrepancy',
        reason: 'Opponent extract count was recorded incorrectly'
        // description intentionally omitted to verify fallback
      })
    });

    assert.equal(disputeRes.status, 200, 'Dispute should succeed when providing only reason');
    const disputeData = await disputeRes.json();
    assert.equal(disputeData.success, true);
    assert.equal(disputeData.dispute.description, 'Opponent extract count was recorded incorrectly');

    const createdTicket = db.data.adminTickets.find((t) => t.matchId === match.id);
    assert.ok(createdTicket);
    assert.equal(createdTicket.description, 'Opponent extract count was recorded incorrectly');
  });

  test('7. POST /api/matches/:id/request-admin rejects outsider with 403 Forbidden', async () => {
    const match: Match = {
      id: 'match-request-admin-auth',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
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

    // Outsider user attempts to request referee assistance
    const outsiderRes = await fetch(`${baseUrl}/api/matches/${match.id}/request-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${outsiderToken}`
      },
      body: JSON.stringify({
        category: 'Interference',
        description: 'Random spectator trying to call referee'
      })
    });

    assert.equal(outsiderRes.status, 403, 'Outsider must receive 403 Forbidden on request-admin');

    // Participant Captain A succeeds
    const capRes = await fetch(`${baseUrl}/api/matches/${match.id}/request-admin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      },
      body: JSON.stringify({
        category: 'Lobby Issues',
        description: 'Custom match invite failed to send'
      })
    });

    assert.equal(capRes.status, 200, 'Participant must be permitted to request referee');
  });

  test('8. Captain-Only score submission: non-captain roster members and admin are rejected with 403, captain succeeds', async () => {
    const memberA2Token = generateToken(memberA2);

    const match: Match = {
      id: 'match-captain-score-auth',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
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

    // 1. Non-captain roster member GUI score submission -> 403
    const guiMemberRes = await fetch(`${baseUrl}/api/matches/${match.id}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberA2Token}`
      },
      body: JSON.stringify({
        teamId: teamA.id,
        runNumber: 1,
        runnerKills: 5,
        extractedCredits: 15000,
        playersExtracted: 3,
        objectiveCompleted: true
      })
    });
    assert.equal(guiMemberRes.status, 403, 'Non-captain roster member GUI score submission must receive 403');
    const guiMemberData = await guiMemberRes.json();
    assert.match(guiMemberData.error, /captain/i);

    // 2. Non-captain roster member /score chat command -> 403
    const chatMemberRes = await fetch(`${baseUrl}/api/matches/${match.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${memberA2Token}`
      },
      body: JSON.stringify({
        message: '/score run1 kills:5 loot:15000 survived:3 objective:yes'
      })
    });
    assert.equal(chatMemberRes.status, 403, 'Non-captain roster member /score chat command must receive 403');
    const chatMemberData = await chatMemberRes.json();
    assert.match(chatMemberData.error, /captain/i);

    // 3. Admin attempting normal player score endpoint -> 403
    const adminPlayerRes = await fetch(`${baseUrl}/api/matches/${match.id}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        teamId: teamA.id,
        runNumber: 1,
        runnerKills: 5,
        extractedCredits: 15000,
        playersExtracted: 3,
        objectiveCompleted: true
      })
    });
    assert.equal(adminPlayerRes.status, 403, 'Admin using regular player score endpoint must receive 403');
    const adminPlayerData = await adminPlayerRes.json();
    assert.match(adminPlayerData.error, /audit/i);

    // 4. Team Captain official score submission succeeds
    const captainRes = await fetch(`${baseUrl}/api/matches/${match.id}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      },
      body: JSON.stringify({
        teamId: teamA.id,
        runNumber: 1,
        runnerKills: 5,
        extractedCredits: 15000,
        playersExtracted: 3,
        objectiveCompleted: true
      })
    });
    assert.equal(captainRes.status, 200, 'Designated Captain official score submission must succeed');
    const captainData = await captainRes.json();
    assert.equal(captainData.success, true);
    assert.ok(captainData.submission);
  });

  test('9. Tournament detail endpoint: anonymous spectator receives spectator-sanitized bracket, authenticated Team A receives Team A-authorized serialized data', async () => {
    // Set up a match in the tournament with an unrevealed Team A Run 1
    const matchId = 'match-tourn-bracket-auth';
    const match: Match = {
      id: matchId,
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
      teamAId: teamA.id,
      teamBId: teamB.id,
      teamAName: teamA.name,
      teamBName: teamB.name,
      isBye: false,
      matchStatus: 'RUN_1_PARTIAL',
      teamARun1: {
        id: 'sub-a1-secret',
        matchId,
        teamId: teamA.id,
        runNumber: 1,
        runnerKills: 6,
        extractedCredits: 45000,
        playersExtracted: 3,
        objectiveCompleted: true,
        killPoints: 30,
        lootPoints: 15,
        objectivePoints: 5,
        baseScore: 50,
        survivalMultiplier: 1.2,
        finalRunScore: 54.0,
        submittedBy: captainA.id,
        submittedByName: captainA.displayName,
        submittedAt: new Date().toISOString(),
        locked: false
      },
      teamBRun1: null,
      run1Revealed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.data.matches.push(match);

    db.data.brackets.push({
      id: 'bracket-auth-test',
      tournamentId: tournament.id,
      totalRounds: 1,
      bracketSize: 2,
      generatedAt: new Date().toISOString(),
      matches: [match]
    });

    // 1. Anonymous request to /api/tournaments/:id (no Bearer token)
    const anonRes = await fetch(`${baseUrl}/api/tournaments/${tournament.id}`);
    assert.equal(anonRes.status, 200);
    const anonData = await anonRes.json();
    const anonBracketMatch = anonData.bracket?.matches?.find((m: Match) => m.id === matchId);
    assert.ok(anonBracketMatch, 'Bracket match must exist in response');
    // For anonymous spectator, teamARun1 should be sanitized indicator (locked: true, no raw stats)
    assert.equal(anonBracketMatch.teamARun1?.locked, true, 'Anonymous spectator must receive locked indicator for unrevealed Run 1');
    assert.equal(anonBracketMatch.teamARun1?.runnerKills, undefined, 'Anonymous spectator must NOT see raw runnerKills');
    assert.equal(anonBracketMatch.teamARun1?.finalRunScore, undefined, 'Anonymous spectator must NOT see finalRunScore');

    // 2. Authenticated Team A captain request to /api/tournaments/:id (with Bearer token)
    const teamARes = await fetch(`${baseUrl}/api/tournaments/${tournament.id}`, {
      headers: {
        Authorization: `Bearer ${captainAToken}`
      }
    });
    assert.equal(teamARes.status, 200);
    const teamAData = await teamARes.json();
    const teamABracketMatch = teamAData.bracket?.matches?.find((m: Match) => m.id === matchId);
    assert.ok(teamABracketMatch, 'Bracket match must exist');
    // For Team A member, teamARun1 is authorized and fully visible
    assert.equal(teamABracketMatch.teamARun1?.locked, false, 'Team A viewer should have unlocked Run 1');
    assert.equal(teamABracketMatch.teamARun1?.runnerKills, 6, 'Team A viewer must see authoritative runnerKills');
    assert.equal(teamABracketMatch.teamARun1?.finalRunScore, 54.0, 'Team A viewer must see authoritative finalRunScore');

    // 3. Authenticated Team B captain request to /api/tournaments/:id (opponent)
    const teamBRes = await fetch(`${baseUrl}/api/tournaments/${tournament.id}`, {
      headers: {
        Authorization: `Bearer ${captainBToken}`
      }
    });
    assert.equal(teamBRes.status, 200);
    const teamBData = await teamBRes.json();
    const teamBBracketMatch = teamBData.bracket?.matches?.find((m: Match) => m.id === matchId);
    assert.ok(teamBBracketMatch);
    // For Team B (opponent), Team A's Run 1 must be locked/sanitized
    assert.equal(teamBBracketMatch.teamARun1?.locked, true, 'Opponent Team B must receive locked indicator');
    assert.equal(teamBBracketMatch.teamARun1?.runnerKills, undefined, 'Opponent Team B must NOT see Team A runnerKills');
  });

  test('10. Score submission callback contract: failure returns { success: false, error }, success returns { success: true }', async () => {
    const matchId = 'match-callback-contract';
    const match: Match = {
      id: matchId,
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
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

    // Simulate handleScoreSubmit logic against real endpoint:
    async function simulateHandleScoreSubmit(
      matchTargetId: string,
      tokenVal: string | null,
      scoreData: any
    ): Promise<{ success: boolean; error?: string }> {
      if (!tokenVal) {
        return { success: false, error: 'Authentication required to submit official score.' };
      }
      try {
        const res = await fetch(`${baseUrl}/api/matches/${matchTargetId}/score`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenVal}`
          },
          body: JSON.stringify(scoreData)
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          return { success: false, error: data.error || 'Failed to submit score.' };
        }
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Network error submitting score.' };
      }
    }

    // Case 1: Rejection returns { success: false, error: <backend error> }
    const rejResult = await simulateHandleScoreSubmit(matchId, captainAToken, {
      teamId: teamA.id,
      runNumber: 1,
      runnerKills: -5, // Invalid negative kills
      extractedCredits: 1000,
      playersExtracted: 3,
      objectiveCompleted: true
    });
    assert.equal(rejResult.success, false);
    assert.ok(rejResult.error);
    assert.match(rejResult.error, /non-negative/i);

    // Case 2: Success returns { success: true }
    const succResult = await simulateHandleScoreSubmit(matchId, captainAToken, {
      teamId: teamA.id,
      runNumber: 1,
      runnerKills: 5,
      extractedCredits: 1000,
      playersExtracted: 3,
      objectiveCompleted: true
    });
    assert.equal(succResult.success, true);
    assert.equal(succResult.error, undefined);
  });
});
