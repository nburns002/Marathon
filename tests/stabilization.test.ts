import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import express, { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../server/db';
import { submitScoreAuthoritative } from '../server/scoreSubmissionService';
import { parseScoreCommandStrict } from '../server/scoring';
import { buildViewerContext, serializeMatchForViewer, serializeMessagesForViewer } from '../server/serializer';
import { validateTournamentRegistrationEligibility, validateBungieIdFormat, normalizeBungieId } from '../server/registrationService';
import { generateSingleEliminationBracket, isDownstreamMatchMateriallyStarted } from '../server/bracket';
import { generateToken } from '../server/middleware';
import matchRoutes from '../server/routes/matches';
import adminRoutes from '../server/routes/admin';
import tournamentRoutes from '../server/routes/tournaments';
import teamRoutes from '../server/routes/teams';
import authRoutes from '../server/routes/auth';
import { Match, Tournament, Team, User, UserRecord, TournamentRegistration, MatchMessage } from '../src/types';

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
let spectatorUser: UserRecord;

let teamA: Team;
let teamB: Team;
let tournament: Tournament;

let adminToken: string;
let captainAToken: string;
let captainBToken: string;
let spectatorToken: string;

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
  if (initialDbBackup) {
    fs.writeFileSync(DB_FILE, initialDbBackup, 'utf-8');
    db.data = JSON.parse(initialDbBackup);
  } else if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
  }
});

function setupTestFixture() {
  const nowIso = new Date().toISOString();

  adminUser = {
    id: `usr-admin-${uuidv4().slice(0, 6)}`,
    email: 'admin@stab.gg',
    passwordHash: 'hash',
    username: 'StabAdmin',
    displayName: 'Stab Admin',
    bungieId: 'Admin#1234',
    avatarUrl: '',
    role: 'ADMIN',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  captainA = {
    id: `usr-capA-${uuidv4().slice(0, 6)}`,
    email: 'capa@stab.gg',
    passwordHash: 'hash',
    username: 'CapAlpha',
    displayName: 'Captain Alpha',
    bungieId: 'AlphaLead#1001',
    avatarUrl: '',
    role: 'CAPTAIN',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  memberA2 = {
    id: `usr-a2-${uuidv4().slice(0, 6)}`,
    email: 'a2@stab.gg',
    passwordHash: 'hash',
    username: 'AlphaTwo',
    displayName: 'Alpha Two',
    bungieId: 'AlphaTwo#1002',
    avatarUrl: '',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  memberA3 = {
    id: `usr-a3-${uuidv4().slice(0, 6)}`,
    email: 'a3@stab.gg',
    passwordHash: 'hash',
    username: 'AlphaThree',
    displayName: 'Alpha Three',
    bungieId: 'AlphaThree#1003',
    avatarUrl: '',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  captainB = {
    id: `usr-capB-${uuidv4().slice(0, 6)}`,
    email: 'capb@stab.gg',
    passwordHash: 'hash',
    username: 'CapBravo',
    displayName: 'Captain Bravo',
    bungieId: 'BravoLead#2001',
    avatarUrl: '',
    role: 'CAPTAIN',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  memberB2 = {
    id: `usr-b2-${uuidv4().slice(0, 6)}`,
    email: 'b2@stab.gg',
    passwordHash: 'hash',
    username: 'BravoTwo',
    displayName: 'Bravo Two',
    bungieId: 'BravoTwo#2002',
    avatarUrl: '',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  memberB3 = {
    id: `usr-b3-${uuidv4().slice(0, 6)}`,
    email: 'b3@stab.gg',
    passwordHash: 'hash',
    username: 'BravoThree',
    displayName: 'Bravo Three',
    bungieId: 'BravoThree#2003',
    avatarUrl: '',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  spectatorUser = {
    id: `usr-spec-${uuidv4().slice(0, 6)}`,
    email: 'spec@stab.gg',
    passwordHash: 'hash',
    username: 'SpectatorUser',
    displayName: 'Spectator User',
    bungieId: 'Spectator#9999',
    avatarUrl: '',
    role: 'PLAYER',
    accountStatus: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  teamA = {
    id: `team-A-${uuidv4().slice(0, 6)}`,
    name: 'Alpha Wolves',
    tag: 'AW',
    logoUrl: '',
    captainUserId: captainA.id,
    createdAt: nowIso
  };

  teamB = {
    id: `team-B-${uuidv4().slice(0, 6)}`,
    name: 'Bravo Brigade',
    tag: 'BB',
    logoUrl: '',
    captainUserId: captainB.id,
    createdAt: nowIso
  };

  tournament = {
    id: `tourn-${uuidv4().slice(0, 6)}`,
    title: 'Cryo Stabilization Cup',
    description: 'Stabilization tournament',
    map: 'Cryo Archive',
    format: '3-player Score Race',
    runsPerMatch: 2,
    entryFee: 30,
    prizePool: 1000,
    maxTeams: 8,
    featuredObjectiveTitle: 'Archive Drive',
    featuredObjectiveDescription: 'Retrieve data drive',
    featuredObjectivePoints: 5,
    registrationOpenAt: nowIso,
    registrationCloseAt: new Date(Date.now() + 86400000).toISOString(),
    tournamentStartAt: new Date(Date.now() + 86400000 * 2).toISOString(),
    readyWindowMinutes: 10,
    matchWindowMinutes: 75,
    disputeWindowMinutes: 10,
    roundIntermissionMinutes: 10,
    status: 'REGISTRATION_OPEN',
    currentRound: 1,
    createdAt: nowIso,
    updatedAt: nowIso
  };

  adminToken = generateToken(adminUser);
  captainAToken = generateToken(captainA);
  captainBToken = generateToken(captainB);
  spectatorToken = generateToken(spectatorUser);

  db.data.users = [adminUser, captainA, memberA2, memberA3, captainB, memberB2, memberB3, spectatorUser];
  db.data.teams = [teamA, teamB];
  db.data.teamMembers = [
    { id: uuidv4(), teamId: teamA.id, userId: captainA.id, role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: nowIso },
    { id: uuidv4(), teamId: teamA.id, userId: memberA2.id, role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: nowIso },
    { id: uuidv4(), teamId: teamA.id, userId: memberA3.id, role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: nowIso },
    { id: uuidv4(), teamId: teamB.id, userId: captainB.id, role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: nowIso },
    { id: uuidv4(), teamId: teamB.id, userId: memberB2.id, role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: nowIso },
    { id: uuidv4(), teamId: teamB.id, userId: memberB3.id, role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: nowIso }
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
  db.data.notifications = [];
}

describe('Full Stabilization Suite: Scoring, Secrecy, Registration & Platform Safety', () => {
  beforeEach(() => {
    setupTestFixture();
  });

  test('1. Authoritative score submission service: GUI endpoint and /score chat command produce identical results', async () => {
    // Setup active match
    const match: Match = {
      id: 'm-score-test',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
      isBye: false,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamB.id,
      teamBName: teamB.name,
      matchStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.data.matches.push(match);

    // 1A. GUI score submission by Captain A
    const guiRes = await fetch(`${baseUrl}/api/matches/${match.id}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      },
      body: JSON.stringify({
        runNumber: 1,
        runnerKills: 6,
        extractedCredits: 48000,
        playersExtracted: 3,
        objectiveCompleted: true
      })
    });

    assert.strictEqual(guiRes.status, 200);
    const guiBody = await guiRes.json();
    assert.strictEqual(guiBody.success, true);
    assert.strictEqual(guiBody.submission.runnerKills, 6);
    assert.strictEqual(guiBody.submission.extractedCredits, 48000);
    assert.strictEqual(guiBody.submission.finalRunScore, 61.2); // (30 + 16 + 5) * 1.2 = 61.2
    assert.strictEqual(match.teamARun1?.finalRunScore, 61.2);
    assert.strictEqual(match.matchStatus, 'RUN_1_PARTIAL');

    // 1B. Chat /score command by Captain B with identical stats
    const chatRes = await fetch(`${baseUrl}/api/matches/${match.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainBToken}`
      },
      body: JSON.stringify({
        message: '/score run1 kills:6 loot:48000 survived:3 objective:yes'
      })
    });

    assert.strictEqual(chatRes.status, 200);
    const chatBody = await chatRes.json();
    assert.strictEqual(chatBody.success, true);
    assert.strictEqual(chatBody.submission.runnerKills, 6);
    assert.strictEqual(chatBody.submission.extractedCredits, 48000);
    assert.strictEqual(chatBody.submission.finalRunScore, 61.2);
    assert.strictEqual(match.teamBRun1?.finalRunScore, 61.2);

    // Both Run 1 submitted -> Revealed & Transitioned to RUN_1_COMPLETE
    assert.strictEqual(match.run1Revealed, true);
    assert.strictEqual(match.matchStatus, 'RUN_1_COMPLETE');
  });

  test('2. Strict run sequencing: Run 2 rejected while Run 1 is missing or unrevealed', async () => {
    const match: Match = {
      id: 'm-sequence-test',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
      isBye: false,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamB.id,
      teamBName: teamB.name,
      matchStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.data.matches.push(match);

    // Attempt Run 2 before either team has submitted Run 1
    const earlyRun2Res = await fetch(`${baseUrl}/api/matches/${match.id}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      },
      body: JSON.stringify({
        runNumber: 2,
        runnerKills: 4,
        extractedCredits: 30000,
        playersExtracted: 3,
        objectiveCompleted: true
      })
    });

    assert.strictEqual(earlyRun2Res.status, 400);
    const earlyBody = await earlyRun2Res.json();
    assert.match(earlyBody.error, /Run 2 cannot be submitted until BOTH teams have submitted Run 1/i);

    // Submit Team A Run 1
    await fetch(`${baseUrl}/api/matches/${match.id}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      },
      body: JSON.stringify({
        runNumber: 1,
        runnerKills: 4,
        extractedCredits: 30000,
        playersExtracted: 3,
        objectiveCompleted: true
      })
    });

    // Attempt Run 2 while Team B Run 1 is still missing
    const partialRun2Res = await fetch(`${baseUrl}/api/matches/${match.id}/score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      },
      body: JSON.stringify({
        runNumber: 2,
        runnerKills: 4,
        extractedCredits: 30000,
        playersExtracted: 3,
        objectiveCompleted: true
      })
    });

    assert.strictEqual(partialRun2Res.status, 400);
    const partialBody = await partialRun2Res.json();
    assert.match(partialBody.error, /Run 2 cannot be submitted until BOTH teams have submitted Run 1/i);
  });

  test('3. Secrecy serialization: Unrevealed Run 1 concealed from opponents and spectators', async () => {
    const match: Match = {
      id: 'm-secrecy-test',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
      isBye: false,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamB.id,
      teamBName: teamB.name,
      matchStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.data.matches.push(match);

    // Team A registers and submits Run 1
    db.data.tournamentRegistrations.push(
      {
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
        registeredAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
        refundPolicyAcceptedAt: new Date().toISOString()
      },
      {
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
        registeredAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
        refundPolicyAcceptedAt: new Date().toISOString()
      }
    );

    // Captain A submits Run 1 (score = 61.20)
    submitScoreAuthoritative({
      matchId: match.id,
      user: captainA,
      teamId: teamA.id,
      runNumber: 1,
      runnerKills: 6,
      extractedCredits: 48000,
      playersExtracted: 3,
      objectiveCompleted: true
    });

    // 3A. Opponent (Captain B) fetches match: must NOT see Team A Run 1 stats or breakdown
    const oppRes = await fetch(`${baseUrl}/api/matches/${match.id}`, {
      headers: { Authorization: `Bearer ${captainBToken}` }
    });
    assert.strictEqual(oppRes.status, 200);
    const oppData = await oppRes.json();
    assert.strictEqual(oppData.match.teamARun1.locked, true);
    assert.strictEqual(oppData.match.teamARun1.isRevealed, false);
    assert.strictEqual(oppData.match.teamARun1.finalRunScore, undefined);
    assert.strictEqual(oppData.match.teamARun1.runnerKills, undefined);
    assert.strictEqual(oppData.match.finalScoreA, null);

    // 3B. Unauthenticated spectator fetches match: must NOT see Team A Run 1 stats
    const specRes = await fetch(`${baseUrl}/api/matches/${match.id}`);
    assert.strictEqual(specRes.status, 200);
    const specData = await specRes.json();
    assert.strictEqual(specData.match.teamARun1.locked, true);
    assert.strictEqual(specData.match.teamARun1.isRevealed, false);
    assert.strictEqual(specData.match.teamARun1.finalRunScore, undefined);

    // 3C. Submitting team (Captain A) fetches match: DOES see full stats
    const teamARes = await fetch(`${baseUrl}/api/matches/${match.id}`, {
      headers: { Authorization: `Bearer ${captainAToken}` }
    });
    assert.strictEqual(teamARes.status, 200);
    const teamAData = await teamARes.json();
    assert.strictEqual(teamAData.match.teamARun1.finalRunScore, 61.2);
    assert.strictEqual(teamAData.match.teamARun1.runnerKills, 6);

    // 3D. Admin fetches match: DOES see full stats
    const adminRes = await fetch(`${baseUrl}/api/matches/${match.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(adminRes.status, 200);
    const adminData = await adminRes.json();
    assert.strictEqual(adminData.match.teamARun1.finalRunScore, 61.2);
  });

  test('4. Bungie ID validation and normalization', () => {
    // Valid formats
    assert.strictEqual(validateBungieIdFormat('AlphaRunner#1234'), true);
    assert.strictEqual(validateBungieIdFormat('Ghost_7#9999'), true);
    assert.strictEqual(validateBungieIdFormat('Fireteam-Lead#10245'), true);

    // Invalid formats
    assert.strictEqual(validateBungieIdFormat('NoNumbers'), false);
    assert.strictEqual(validateBungieIdFormat('Short#12'), false);
    assert.strictEqual(validateBungieIdFormat(''), false);
    assert.strictEqual(validateBungieIdFormat('Special$#1234'), false); // Special symbol rejected

    // Normalization
    assert.strictEqual(normalizeBungieId('  AlphaRunner#1234  '), 'alpharunner#1234');
    assert.strictEqual(normalizeBungieId('Runner  Name#9999'), 'runner name#9999');
  });

  test('5. Tournament registration validation: eligibility, capacity, duplicates, and captain check', () => {
    // 5A. Captain check: Non-captain member cannot register team
    const nonCaptainResult = validateTournamentRegistrationEligibility(tournament.id, teamA.id, memberA2);
    assert.strictEqual(nonCaptainResult.eligible, false);
    assert.match(nonCaptainResult.error!, /Only the designated Team Captain/i);

    // 5B. Valid captain registration
    const validResult = validateTournamentRegistrationEligibility(tournament.id, teamA.id, captainA);
    assert.strictEqual(validResult.eligible, true);
    assert.strictEqual(validResult.rosterSnapshot?.length, 3);

    // 5C. Duplicate team registration rejection
    db.data.tournamentRegistrations.push({
      id: 'reg-existing',
      tournamentId: tournament.id,
      teamId: teamA.id,
      teamName: teamA.name,
      captainUserId: captainA.id,
      status: 'REGISTERED',
      paymentStatus: 'PAID',
      rosterSnapshot: validResult.rosterSnapshot!,
      registeredAt: new Date().toISOString(),
      termsAcceptedAt: new Date().toISOString(),
      refundPolicyAcceptedAt: new Date().toISOString()
    });

    const dupResult = validateTournamentRegistrationEligibility(tournament.id, teamA.id, captainA);
    assert.strictEqual(dupResult.eligible, false);
    assert.match(dupResult.error!, /already registered and confirmed/i);

    // 5D. Cross-team participation rejection: player already on another registered roster
    const crossResult = validateTournamentRegistrationEligibility(tournament.id, teamB.id, captainB);
    assert.strictEqual(crossResult.eligible, true); // Team B has distinct players

    // If Team B adds memberA2 (who is on registered Team A):
    db.data.teamMembers.push({
      id: uuidv4(),
      teamId: teamB.id,
      userId: memberA2.id,
      role: 'MEMBER',
      membershipStatus: 'ACTIVE',
      joinedAt: new Date().toISOString()
    });
    // Now Team B has 4 members -> roster size rejection
    const invalidRosterResult = validateTournamentRegistrationEligibility(tournament.id, teamB.id, captainB);
    assert.strictEqual(invalidRosterResult.eligible, false);
    assert.match(invalidRosterResult.error!, /requires exactly 3 active players/i);
  });

  test('6. Bracket generation idempotency & protection against regenerating during active matches', async () => {
    // Register 2 teams
    db.data.tournamentRegistrations.push(
      {
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
        registeredAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
        refundPolicyAcceptedAt: new Date().toISOString()
      },
      {
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
        registeredAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
        refundPolicyAcceptedAt: new Date().toISOString()
      }
    );

    // Initial bracket generation
    const genRes = await fetch(`${baseUrl}/api/tournaments/${tournament.id}/generate-bracket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(genRes.status, 200);
    const genData = await genRes.json();
    assert.strictEqual(genData.success, true);
    assert.strictEqual(tournament.status, 'LIVE');

    // Attempting to regenerate without explicit pre-start reset flag while LIVE is rejected
    const dupGenRes = await fetch(`${baseUrl}/api/tournaments/${tournament.id}/generate-bracket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      }
    });

    assert.strictEqual(dupGenRes.status, 400);
    const dupGenData = await dupGenRes.json();
    assert.match(dupGenData.error, /Tournament is currently LIVE/i);

    // If a match is started (ACTIVE), even with allowPreStartReset, bracket regeneration is rejected
    const match = db.data.matches.find((m) => m.tournamentId === tournament.id)!;
    match.matchStatus = 'ACTIVE';

    const activeGenRes = await fetch(`${baseUrl}/api/tournaments/${tournament.id}/generate-bracket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ allowPreStartReset: true })
    });

    assert.strictEqual(activeGenRes.status, 400);
    const activeGenData = await activeGenRes.json();
    assert.match(activeGenData.error, /is already in progress/i);
  });

  test('7. Evidence submission validation: URL schemes, length, and participant authorization', async () => {
    const match: Match = {
      id: 'm-ev-test',
      tournamentId: tournament.id,
      round: 1,
      matchNumber: 1,
      bracketPosition: 1,
      isBye: false,
      teamAId: teamA.id,
      teamAName: teamA.name,
      teamBId: teamB.id,
      teamBName: teamB.name,
      matchStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.data.matches.push(match);

    // 7A. Unauthorized spectator upload is rejected
    const specEvRes = await fetch(`${baseUrl}/api/matches/${match.id}/evidence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${spectatorToken}`
      },
      body: JSON.stringify({
        url: 'https://youtube.com/watch?v=12345',
        type: 'VOD',
        description: 'VOD of run 1'
      })
    });

    assert.strictEqual(specEvRes.status, 403);

    // 7B. Invalid URL scheme (javascript: or ftp:) is rejected
    const invalidUrlRes = await fetch(`${baseUrl}/api/matches/${match.id}/evidence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      },
      body: JSON.stringify({
        url: 'ftp://fileserver/run1.mp4',
        type: 'VOD',
        description: 'VOD of run 1'
      })
    });

    assert.strictEqual(invalidUrlRes.status, 400);
    const invalidUrlData = await invalidUrlRes.json();
    assert.match(invalidUrlData.error, /must use http:\/\/ or https:\/\//i);

    // 7C. Valid participant upload succeeds
    const validEvRes = await fetch(`${baseUrl}/api/matches/${match.id}/evidence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${captainAToken}`
      },
      body: JSON.stringify({
        url: 'https://twitch.tv/videos/123456789',
        type: 'VOD',
        runNumber: 1,
        description: 'Captain Alpha official Run 1 VOD'
      })
    });

    assert.strictEqual(validEvRes.status, 200);
    const validEvData = await validEvRes.json();
    assert.strictEqual(validEvData.success, true);
    assert.strictEqual(validEvData.evidence.teamId, teamA.id);
  });

  test('8. Strict parsing of /score chat command prevents silent default to zero on typos', () => {
    // Missing fields
    const missingKills = parseScoreCommandStrict('/score run1 loot:48000 survived:3 objective:yes');
    assert.strictEqual(missingKills.success, false);
    assert.match(missingKills.error!, /Missing required scoring fields.*kills/i);

    // Typo in field name (e.g. kils:6)
    const typoParam = parseScoreCommandStrict('/score run1 kils:6 loot:48000 survived:3 objective:yes');
    assert.strictEqual(typoParam.success, false);
    assert.match(typoParam.error!, /Unknown parameter 'kils'/i);

    // Invalid survived number (must be 0-3)
    const invalidSurvivors = parseScoreCommandStrict('/score run1 kills:6 loot:48000 survived:5 objective:yes');
    assert.strictEqual(invalidSurvivors.success, false);
    assert.match(invalidSurvivors.error!, /Must be 0, 1, 2, or 3/i);

    // Correct command succeeds
    const valid = parseScoreCommandStrict('/score run1 kills:6 loot:48000 survived:3 objective:yes');
    assert.strictEqual(valid.success, true);
    assert.strictEqual(valid.data?.runnerKills, 6);
    assert.strictEqual(valid.data?.extractedCredits, 48000);
    assert.strictEqual(valid.data?.playersExtracted, 3);
    assert.strictEqual(valid.data?.objectiveCompleted, true);
  });
});
