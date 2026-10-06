import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  User,
  UserRecord,
  Team,
  TeamMember,
  TeamInvitation,
  Tournament,
  TournamentRegistration,
  Match,
  Bracket,
  RunSubmission,
  MatchMessage,
  MatchEvidence,
  MatchDispute,
  AdminTicket,
  AdminAction,
  AuditLog,
  Notification
} from '../src/types';
import { generateSingleEliminationBracket } from './bracket';
import { calculateRunScore } from './scoring';

export interface DatabaseSchema {
  users: UserRecord[];
  teams: Team[];
  teamMembers: TeamMember[];
  teamInvitations: TeamInvitation[];
  tournaments: Tournament[];
  tournamentRegistrations: TournamentRegistration[];
  matches: Match[];
  brackets: Bracket[];
  runSubmissions: RunSubmission[];
  matchMessages: MatchMessage[];
  matchEvidence: MatchEvidence[];
  matchDisputes: MatchDispute[];
  adminTickets: AdminTicket[];
  adminActions: AdminAction[];
  auditLogs: AuditLog[];
  notifications: Notification[];
}

const DB_FILE = path.join(process.cwd(), 'marathon_db.json');

class DatabaseStore {
  public data: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.loadOrSeed();
  }

  private loadOrSeed(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        console.log('[DB] Loaded existing database from disk.');
        return parsed;
      } catch (err) {
        console.error('[DB] Failed to parse database file, reseeding...', err);
      }
    }

    // In non-demo environments, initialize clean empty database (never seed demo accounts)
    if (process.env.DEMO_MODE !== 'true') {
      const emptyDb = this.createEmptyDatabase();
      this.saveImmediate(emptyDb);
      return emptyDb;
    }

    const seeded = this.createSeedData();
    this.saveImmediate(seeded);
    return seeded;
  }

  public createEmptyDatabase(): DatabaseSchema {
    console.log('[DB] Initializing clean production database schema (no demo credentials seeded).');
    const schema: DatabaseSchema = {
      users: [],
      teams: [],
      teamMembers: [],
      teamInvitations: [],
      tournaments: [],
      tournamentRegistrations: [],
      matches: [],
      brackets: [],
      runSubmissions: [],
      matchMessages: [],
      matchEvidence: [],
      matchDisputes: [],
      adminTickets: [],
      adminActions: [],
      auditLogs: [],
      notifications: []
    };

    // Secure production administrator bootstrap mechanism
    if (process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      const nowIso = new Date().toISOString();
      const adminUser: UserRecord = {
        id: `usr-admin-${uuidv4().slice(0, 8)}`,
        email: process.env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(),
        passwordHash: bcrypt.hashSync(process.env.BOOTSTRAP_ADMIN_PASSWORD, 10),
        username: process.env.BOOTSTRAP_ADMIN_USERNAME || 'Admin',
        displayName: process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Administrator',
        bungieId: process.env.BOOTSTRAP_ADMIN_BUNGIE || 'Admin#0001',
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=Admin`,
        role: 'SUPERADMIN',
        accountStatus: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso
      };
      schema.users.push(adminUser);
      console.log(`[DB] Bootstrapped production administrator: ${adminUser.email}`);
    }

    return schema;
  }

  public save(): void {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveImmediate(this.data);
    }, 200);
  }

  public saveImmediate(dataToSave: DatabaseSchema = this.data): void {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Error writing DB file:', err);
    }
  }

  private createSeedData(): DatabaseSchema {
    console.log('[DB] Generating comprehensive Marathon tournament seed data...');
    const now = new Date();
    const isoNow = now.toISOString();

    const passwordHash = bcrypt.hashSync('MarathonPass2026!', 8);

    // 1. Users
    const users: UserRecord[] = [
      {
        id: 'usr-admin-1',
        email: 'director@marathontournaments.gg',
        passwordHash,
        username: 'TournamentDirector',
        displayName: 'Tournament Director',
        bungieId: 'Director#0001',
        avatarUrl: 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80',
        role: 'SUPERADMIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-admin-2',
        email: 'referee@marathontournaments.gg',
        passwordHash,
        username: 'HeadRef_Vance',
        displayName: 'Head Ref Vance',
        bungieId: 'RefVance#7788',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        role: 'ADMIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      // Team 1: Cryo Kings
      {
        id: 'usr-capt-1',
        email: 'player1@outlook.com',
        passwordHash,
        username: 'PlayerOne',
        displayName: 'Player One [Cryo]',
        bungieId: 'PlayerOne#1337',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        role: 'CAPTAIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p2',
        email: 'player2@gmail.com',
        passwordHash,
        username: 'PlayerTwo',
        displayName: 'FrostByte',
        bungieId: 'FrostByte#4412',
        avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p3',
        email: 'player3@gmail.com',
        passwordHash,
        username: 'PlayerThree',
        displayName: 'GlacierRunner',
        bungieId: 'Glacier#9081',
        avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },

      // Team 2: Tau Ceti Boys
      {
        id: 'usr-capt-2',
        email: 'tau_capt@gmail.com',
        passwordHash,
        username: 'TauCaptain',
        displayName: 'TauPrime',
        bungieId: 'TauPrime#2201',
        avatarUrl: 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&auto=format&fit=crop&q=80',
        role: 'CAPTAIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p5',
        email: 'tau_p2@gmail.com',
        passwordHash,
        username: 'OrbitStrike',
        displayName: 'OrbitStrike',
        bungieId: 'OrbitStrike#8834',
        avatarUrl: 'https://images.unsplash.com/photo-1628157582853-a796fa650a6a?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p6',
        email: 'tau_p3@gmail.com',
        passwordHash,
        username: 'NovaGhost',
        displayName: 'NovaGhost',
        bungieId: 'NovaGhost#5519',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },

      // Team 3: Last Runner
      {
        id: 'usr-capt-3',
        email: 'last_capt@gmail.com',
        passwordHash,
        username: 'LastRunnerCapt',
        displayName: 'VanguardZero',
        bungieId: 'VanguardZero#3399',
        avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=80',
        role: 'CAPTAIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p8',
        email: 'last_p2@gmail.com',
        passwordHash,
        username: 'ShadowExtract',
        displayName: 'ShadowExtract',
        bungieId: 'ShadowExtract#6611',
        avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p9',
        email: 'last_p3@gmail.com',
        passwordHash,
        username: 'ApexPredator',
        displayName: 'ApexPredator',
        bungieId: 'Apex#9922',
        avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },

      // Team 4: MIDA Syndicate
      {
        id: 'usr-capt-4',
        email: 'mida_capt@gmail.com',
        passwordHash,
        username: 'MIDALeader',
        displayName: 'MultiTool_God',
        bungieId: 'MIDALeader#7700',
        avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
        role: 'CAPTAIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p11',
        email: 'mida_p2@gmail.com',
        passwordHash,
        username: 'TacticalReload',
        displayName: 'TacticalReload',
        bungieId: 'TacReload#3141',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p12',
        email: 'mida_p3@gmail.com',
        passwordHash,
        username: 'PrecisionShot',
        displayName: 'PrecisionShot',
        bungieId: 'Precise#8802',
        avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },

      // Team 5: Voidstalkers
      {
        id: 'usr-capt-5',
        email: 'void_capt@gmail.com',
        passwordHash,
        username: 'VoidReaper',
        displayName: 'VoidReaper',
        bungieId: 'VoidReaper#1100',
        avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
        role: 'CAPTAIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p14',
        email: 'void_p2@gmail.com',
        passwordHash,
        username: 'BlinkRunner',
        displayName: 'BlinkRunner',
        bungieId: 'Blink#4488',
        avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p15',
        email: 'void_p3@gmail.com',
        passwordHash,
        username: 'DarkMatter',
        displayName: 'DarkMatter',
        bungieId: 'DarkMatter#9911',
        avatarUrl: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },

      // Team 6: Traxus Vanguard
      {
        id: 'usr-capt-6',
        email: 'traxus_capt@gmail.com',
        passwordHash,
        username: 'TraxusOverlord',
        displayName: 'TraxusIV',
        bungieId: 'TraxusIV#5544',
        avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
        role: 'CAPTAIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p17',
        email: 'traxus_p2@gmail.com',
        passwordHash,
        username: 'HeavyLifter',
        displayName: 'HeavyLifter',
        bungieId: 'Lifter#2233',
        avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p18',
        email: 'traxus_p3@gmail.com',
        passwordHash,
        username: 'SteelTitan',
        displayName: 'SteelTitan',
        bungieId: 'Titan#8899',
        avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },

      // Team 7: Sekiguchi Heavy
      {
        id: 'usr-capt-7',
        email: 'seki_capt@gmail.com',
        passwordHash,
        username: 'SekiguchiExec',
        displayName: 'RoninZero',
        bungieId: 'Ronin#9021',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        role: 'CAPTAIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p20',
        email: 'seki_p2@gmail.com',
        passwordHash,
        username: 'KatanaStrike',
        displayName: 'KatanaStrike',
        bungieId: 'Katana#4411',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p21',
        email: 'seki_p3@gmail.com',
        passwordHash,
        username: 'NaniteStorm',
        displayName: 'NaniteStorm',
        bungieId: 'Nanite#3300',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },

      // Team 8: Arachne Elite
      {
        id: 'usr-capt-8',
        email: 'arachne_capt@gmail.com',
        passwordHash,
        username: 'ArachneQueen',
        displayName: 'SilkWeaver',
        bungieId: 'SilkWeaver#7711',
        avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
        role: 'CAPTAIN',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p23',
        email: 'arachne_p2@gmail.com',
        passwordHash,
        username: 'VenomBite',
        displayName: 'VenomBite',
        bungieId: 'Venom#6677',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'usr-p24',
        email: 'arachne_p3@gmail.com',
        passwordHash,
        username: 'WebStrider',
        displayName: 'WebStrider',
        bungieId: 'WebStrider#1245',
        avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
        role: 'PLAYER',
        accountStatus: 'ACTIVE',
        createdAt: isoNow,
        updatedAt: isoNow
      }
    ];

    // 2. Teams
    const teams: Team[] = [
      {
        id: 'team-1',
        name: 'Cryo Kings',
        tag: 'CRYO',
        logoUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
        captainUserId: 'usr-capt-1',
        createdAt: isoNow
      },
      {
        id: 'team-2',
        name: 'Tau Ceti Boys',
        tag: 'TAU',
        logoUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150&auto=format&fit=crop&q=80',
        captainUserId: 'usr-capt-2',
        createdAt: isoNow
      },
      {
        id: 'team-3',
        name: 'Last Runner',
        tag: 'LAST',
        logoUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=150&auto=format&fit=crop&q=80',
        captainUserId: 'usr-capt-3',
        createdAt: isoNow
      },
      {
        id: 'team-4',
        name: 'MIDA Syndicate',
        tag: 'MIDA',
        logoUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150&auto=format&fit=crop&q=80',
        captainUserId: 'usr-capt-4',
        createdAt: isoNow
      },
      {
        id: 'team-5',
        name: 'Voidstalkers',
        tag: 'VOID',
        logoUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=150&auto=format&fit=crop&q=80',
        captainUserId: 'usr-capt-5',
        createdAt: isoNow
      },
      {
        id: 'team-6',
        name: 'Traxus Vanguard',
        tag: 'TRXS',
        logoUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=150&auto=format&fit=crop&q=80',
        captainUserId: 'usr-capt-6',
        createdAt: isoNow
      },
      {
        id: 'team-7',
        name: 'Sekiguchi Heavy',
        tag: 'SEKI',
        logoUrl: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=150&auto=format&fit=crop&q=80',
        captainUserId: 'usr-capt-7',
        createdAt: isoNow
      },
      {
        id: 'team-8',
        name: 'Arachne Elite',
        tag: 'ARAC',
        logoUrl: 'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=150&auto=format&fit=crop&q=80',
        captainUserId: 'usr-capt-8',
        createdAt: isoNow
      }
    ];

    // 3. Team Members (3 per team)
    const teamMembers: TeamMember[] = [
      // Team 1
      { id: 'tm-1', teamId: 'team-1', userId: 'usr-capt-1', role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-2', teamId: 'team-1', userId: 'usr-p2', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-3', teamId: 'team-1', userId: 'usr-p3', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      // Team 2
      { id: 'tm-4', teamId: 'team-2', userId: 'usr-capt-2', role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-5', teamId: 'team-2', userId: 'usr-p5', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-6', teamId: 'team-2', userId: 'usr-p6', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      // Team 3
      { id: 'tm-7', teamId: 'team-3', userId: 'usr-capt-3', role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-8', teamId: 'team-3', userId: 'usr-p8', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-9', teamId: 'team-3', userId: 'usr-p9', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      // Team 4
      { id: 'tm-10', teamId: 'team-4', userId: 'usr-capt-4', role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-11', teamId: 'team-4', userId: 'usr-p11', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-12', teamId: 'team-4', userId: 'usr-p12', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      // Team 5
      { id: 'tm-13', teamId: 'team-5', userId: 'usr-capt-5', role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-14', teamId: 'team-5', userId: 'usr-p14', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-15', teamId: 'team-5', userId: 'usr-p15', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      // Team 6
      { id: 'tm-16', teamId: 'team-6', userId: 'usr-capt-6', role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-17', teamId: 'team-6', userId: 'usr-p17', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-18', teamId: 'team-6', userId: 'usr-p18', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      // Team 7
      { id: 'tm-19', teamId: 'team-7', userId: 'usr-capt-7', role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-20', teamId: 'team-7', userId: 'usr-p20', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-21', teamId: 'team-7', userId: 'usr-p21', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      // Team 8
      { id: 'tm-22', teamId: 'team-8', userId: 'usr-capt-8', role: 'CAPTAIN', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-23', teamId: 'team-8', userId: 'usr-p23', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow },
      { id: 'tm-24', teamId: 'team-8', userId: 'usr-p24', role: 'MEMBER', membershipStatus: 'ACTIVE', joinedAt: isoNow }
    ];

    // 4. Tournaments
    const tournaments: Tournament[] = [
      {
        id: 'tourn-1',
        title: 'MARATHON CRYO CUP — INAUGURAL SCORE RACE',
        description: 'The premier 3-player competitive extraction tournament. Head-to-head score races on Cryo Archive across two public-lobby runs. 5 pts per kill, 1 pt / 3k credits extracted, ×1.20 full squad multiplier.',
        map: 'Cryo Archive',
        format: '3-player Public-Lobby Score Race',
        runsPerMatch: 2,
        entryFee: 30,
        prizePool: 1500,
        maxTeams: 64,
        featuredObjectiveTitle: 'Core Data Terminal Extraction',
        featuredObjectiveDescription: 'Successfully upload and extract the encrypted Archive Data Drive from the Cryo Central Vault.',
        featuredObjectivePoints: 5,
        registrationOpenAt: new Date(now.getTime() - 86400000 * 3).toISOString(),
        registrationCloseAt: new Date(now.getTime() - 3600000).toISOString(),
        tournamentStartAt: new Date(now.getTime() - 1800000).toISOString(),
        readyWindowMinutes: 10,
        matchWindowMinutes: 75,
        disputeWindowMinutes: 10,
        roundIntermissionMinutes: 10,
        status: 'LIVE',
        currentRound: 1,
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'tourn-2',
        title: 'TAU CETI CHAMPIONSHIP — $5,000 PRIZE POOL',
        description: 'Elite weekend bracket for veteran Marathon runners. Open registration, double elimination finals, fully audited VOD review.',
        map: 'Cryo Archive',
        format: '3-player Public-Lobby Score Race',
        runsPerMatch: 2,
        entryFee: 50,
        prizePool: 5000,
        maxTeams: 64,
        featuredObjectiveTitle: 'Sub-Zero Security Keycard Extraction',
        featuredObjectiveDescription: 'Obtain and extract with the High-Sec Executive Keycard from Security Sector C.',
        featuredObjectivePoints: 5,
        registrationOpenAt: new Date(now.getTime() - 86400000).toISOString(),
        registrationCloseAt: new Date(now.getTime() + 86400000 * 2).toISOString(),
        tournamentStartAt: new Date(now.getTime() + 86400000 * 2 + 3600000).toISOString(),
        readyWindowMinutes: 10,
        matchWindowMinutes: 75,
        disputeWindowMinutes: 10,
        roundIntermissionMinutes: 10,
        status: 'REGISTRATION_OPEN',
        currentRound: 0,
        createdAt: isoNow,
        updatedAt: isoNow
      },
      {
        id: 'tourn-3',
        title: 'CRYO VAULT WEEKLY #1',
        description: 'Completed inaugural community test tournament with preserved championship history.',
        map: 'Cryo Archive',
        format: '3-player Public-Lobby Score Race',
        runsPerMatch: 2,
        entryFee: 15,
        prizePool: 300,
        maxTeams: 16,
        featuredObjectiveTitle: 'Heavy Armory Breached',
        featuredObjectiveDescription: 'Breach the Sub-level 2 Armory and extract the Prototype Mag-Rail.',
        featuredObjectivePoints: 5,
        registrationOpenAt: new Date(now.getTime() - 86400000 * 7).toISOString(),
        registrationCloseAt: new Date(now.getTime() - 86400000 * 6).toISOString(),
        tournamentStartAt: new Date(now.getTime() - 86400000 * 6).toISOString(),
        readyWindowMinutes: 10,
        matchWindowMinutes: 75,
        disputeWindowMinutes: 10,
        roundIntermissionMinutes: 10,
        status: 'COMPLETED',
        currentRound: 3,
        championTeamId: 'team-1',
        championTeamName: 'Cryo Kings',
        createdAt: isoNow,
        updatedAt: isoNow
      }
    ];

    // 5. Tournament Registrations with Roster Snapshots for tourn-1
    const tournamentRegistrations: TournamentRegistration[] = teams.map((team, idx) => {
      const members = teamMembers.filter((tm) => tm.teamId === team.id);
      const snapshot = members.map((tm) => {
        const u = users.find((usr) => usr.id === tm.userId)!;
        return {
          userId: u.id,
          usernameSnapshot: u.username,
          displayNameSnapshot: u.displayName,
          bungieIdSnapshot: u.bungieId
        };
      });

      return {
        id: `reg-${team.id}`,
        tournamentId: 'tourn-1',
        teamId: team.id,
        teamName: team.name,
        captainUserId: team.captainUserId,
        status: 'REGISTERED',
        paymentStatus: 'PAID',
        rosterSnapshot: snapshot,
        registeredAt: new Date(now.getTime() - 86400000 + idx * 1000).toISOString(),
        termsAcceptedAt: new Date(now.getTime() - 86400000 + idx * 1000).toISOString(),
        refundPolicyAcceptedAt: new Date(now.getTime() - 86400000 + idx * 1000).toISOString()
      };
    });

    // Also register first 4 teams for tourn-2 (Open registration)
    for (let i = 0; i < 4; i++) {
      const team = teams[i];
      const members = teamMembers.filter((tm) => tm.teamId === team.id);
      const snapshot = members.map((tm) => {
        const u = users.find((usr) => usr.id === tm.userId)!;
        return {
          userId: u.id,
          usernameSnapshot: u.username,
          displayNameSnapshot: u.displayName,
          bungieIdSnapshot: u.bungieId
        };
      });

      tournamentRegistrations.push({
        id: `reg-tourn2-${team.id}`,
        tournamentId: 'tourn-2',
        teamId: team.id,
        teamName: team.name,
        captainUserId: team.captainUserId,
        status: 'REGISTERED',
        paymentStatus: 'PAID',
        rosterSnapshot: snapshot,
        registeredAt: isoNow,
        termsAcceptedAt: isoNow,
        refundPolicyAcceptedAt: isoNow
      });
    }

    // 6. Generate Bracket for Tournament 1 (8 Teams -> 3 Rounds, 7 Matches)
    const teamLookup: Record<string, { name: string; logoUrl?: string }> = {};
    teams.forEach((t) => {
      teamLookup[t.id] = { name: t.name, logoUrl: t.logoUrl };
    });

    const regsT1 = tournamentRegistrations.filter((r) => r.tournamentId === 'tourn-1');
    const { bracket, matches } = generateSingleEliminationBracket('tourn-1', regsT1, teamLookup);

    // Let's configure the matches in tourn-1 to showcase distinct realistic states for scenario testing!
    // Match 1: ACTIVE MATCH with Run 1 completed and Run 2 ongoing (Cryo Kings vs Tau Ceti Boys)
    const m1 = matches.find((m) => m.round === 1 && m.bracketPosition === 0);
    const m2 = matches.find((m) => m.round === 1 && m.bracketPosition === 1);
    const m3 = matches.find((m) => m.round === 1 && m.bracketPosition === 2);
    const m4 = matches.find((m) => m.round === 1 && m.bracketPosition === 3);

    const runSubmissions: RunSubmission[] = [];
    const matchMessages: MatchMessage[] = [];
    const matchEvidence: MatchEvidence[] = [];
    const matchDisputes: MatchDispute[] = [];
    const adminTickets: AdminTicket[] = [];
    const adminActions: AdminAction[] = [];
    const auditLogs: AuditLog[] = [];
    const notifications: Notification[] = [];

    if (m1 && m1.teamAId && m1.teamBId) {
      m1.matchStatus = 'RUN_1_COMPLETE';
      m1.teamAReady = true;
      m1.teamBReady = true;
      m1.teamAReadyAt = new Date(now.getTime() - 25 * 60 * 1000).toISOString();
      m1.teamBReadyAt = new Date(now.getTime() - 24 * 60 * 1000).toISOString();
      m1.matchStartedAt = new Date(now.getTime() - 24 * 60 * 1000).toISOString();
      m1.matchDeadlineAt = new Date(now.getTime() + 51 * 60 * 1000).toISOString();
      m1.run1Revealed = true;

      // Seed Run 1 for Team A (Cryo Kings)
      const scoreA1 = calculateRunScore({ runnerKills: 6, extractedCredits: 48000, playersExtracted: 3, objectiveCompleted: true });
      const subA1: RunSubmission = {
        id: 'sub-m1-a1',
        matchId: m1.id,
        teamId: m1.teamAId,
        runNumber: 1,
        ...scoreA1,
        submittedBy: 'usr-capt-1',
        submittedByName: 'PlayerOne',
        submittedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
        evidenceUrl: 'https://twitch.tv/videos/marathon_cryo_run1',
        locked: true
      };
      runSubmissions.push(subA1);
      m1.teamARun1 = subA1;

      // Seed Run 1 for Team B (Tau Ceti)
      const scoreB1 = calculateRunScore({ runnerKills: 4, extractedCredits: 39000, playersExtracted: 3, objectiveCompleted: false });
      const subB1: RunSubmission = {
        id: 'sub-m1-b1',
        matchId: m1.id,
        teamId: m1.teamBId,
        runNumber: 1,
        ...scoreB1,
        submittedBy: 'usr-capt-2',
        submittedByName: 'TauCaptain',
        submittedAt: new Date(now.getTime() - 14 * 60 * 1000).toISOString(),
        evidenceUrl: 'https://youtube.com/watch?v=tau_ceti_run1',
        locked: true
      };
      runSubmissions.push(subB1);
      m1.teamBRun1 = subB1;

      // Match 1 Chat History
      matchMessages.push(
        {
          id: uuidv4(),
          matchId: m1.id,
          userId: 'usr-capt-1',
          userName: 'PlayerOne',
          userRole: 'CAPTAIN',
          teamId: m1.teamAId,
          teamName: m1.teamAName || '',
          type: 'CHAT',
          message: 'Good luck Tau Ceti, queueing into Cryo Archive Run 1 now!',
          createdAt: new Date(now.getTime() - 23 * 60 * 1000).toISOString()
        },
        {
          id: uuidv4(),
          matchId: m1.id,
          userId: 'usr-capt-2',
          userName: 'TauCaptain',
          userRole: 'CAPTAIN',
          teamId: m1.teamBId,
          teamName: m1.teamBName || '',
          type: 'CHAT',
          message: 'GL HF! In matchmaking queue now.',
          createdAt: new Date(now.getTime() - 22 * 60 * 1000).toISOString()
        },
        {
          id: uuidv4(),
          matchId: m1.id,
          userId: 'usr-capt-1',
          userName: 'PlayerOne',
          userRole: 'CAPTAIN',
          teamId: m1.teamAId,
          teamName: m1.teamAName || '',
          type: 'SCORE_SUBMISSION',
          message: '/score run1 kills:6 loot:48000 survived:3 objective:yes',
          createdAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString()
        },
        {
          id: uuidv4(),
          matchId: m1.id,
          userId: 'SYSTEM',
          userName: 'SYSTEM',
          userRole: 'SYSTEM',
          type: 'SYSTEM',
          message: `SYSTEM — RUN 1 SUBMITTED BY ${m1.teamAName} | ${scoreA1.breakdownString}`,
          structuredScore: subA1,
          createdAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString()
        },
        {
          id: uuidv4(),
          matchId: m1.id,
          userId: 'usr-capt-2',
          userName: 'TauCaptain',
          userRole: 'CAPTAIN',
          teamId: m1.teamBId,
          teamName: m1.teamBName || '',
          type: 'SCORE_SUBMISSION',
          message: '/score run1 kills:4 loot:39000 survived:3 objective:no',
          createdAt: new Date(now.getTime() - 14 * 60 * 1000).toISOString()
        },
        {
          id: uuidv4(),
          matchId: m1.id,
          userId: 'SYSTEM',
          userName: 'SYSTEM',
          userRole: 'SYSTEM',
          type: 'SYSTEM',
          message: `SYSTEM — BOTH RUN 1 SCORES LOCKED AND REVEALED!\n${m1.teamAName}: ${scoreA1.finalRunScore.toFixed(2)} pts\n${m1.teamBName}: ${scoreB1.finalRunScore.toFixed(2)} pts\nDeficit: ${m1.teamBName} trails by ${(scoreA1.finalRunScore - scoreB1.finalRunScore).toFixed(2)} pts`,
          createdAt: new Date(now.getTime() - 14 * 60 * 1000).toISOString()
        }
      );
    }

    // Match 2: RESULT PENDING (10-min Dispute Window active, ready to test Flag / Request Admin or Auto-Finalize)
    if (m2 && m2.teamAId && m2.teamBId) {
      m2.matchStatus = 'RESULT_PENDING';
      m2.teamAReady = true;
      m2.teamBReady = true;
      m2.run1Revealed = true;
      m2.matchStartedAt = new Date(now.getTime() - 65 * 60 * 1000).toISOString();
      m2.disputeDeadlineAt = new Date(now.getTime() + 7 * 60 * 1000).toISOString(); // 7 minutes left

      const scoreA1 = calculateRunScore({ runnerKills: 5, extractedCredits: 36000, playersExtracted: 3, objectiveCompleted: true });
      const scoreA2 = calculateRunScore({ runnerKills: 7, extractedCredits: 52000, playersExtracted: 3, objectiveCompleted: true });
      const scoreB1 = calculateRunScore({ runnerKills: 3, extractedCredits: 27000, playersExtracted: 2, objectiveCompleted: false });
      const scoreB2 = calculateRunScore({ runnerKills: 4, extractedCredits: 31000, playersExtracted: 3, objectiveCompleted: true });

      const subA1: RunSubmission = {
        id: 'sub-m2-a1',
        matchId: m2.id,
        teamId: m2.teamAId,
        runNumber: 1,
        ...scoreA1,
        submittedBy: 'usr-capt-3',
        submittedByName: 'LastRunnerCapt',
        submittedAt: new Date(now.getTime() - 45 * 60 * 1000).toISOString(),
        locked: true
      };
      const subA2: RunSubmission = {
        id: 'sub-m2-a2',
        matchId: m2.id,
        teamId: m2.teamAId,
        runNumber: 2,
        ...scoreA2,
        submittedBy: 'usr-capt-3',
        submittedByName: 'LastRunnerCapt',
        submittedAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
        locked: true
      };
      const subB1: RunSubmission = {
        id: 'sub-m2-b1',
        matchId: m2.id,
        teamId: m2.teamBId,
        runNumber: 1,
        ...scoreB1,
        submittedBy: 'usr-capt-4',
        submittedByName: 'MIDALeader',
        submittedAt: new Date(now.getTime() - 44 * 60 * 1000).toISOString(),
        locked: true
      };
      const subB2: RunSubmission = {
        id: 'sub-m2-b2',
        matchId: m2.id,
        teamId: m2.teamBId,
        runNumber: 2,
        ...scoreB2,
        submittedBy: 'usr-capt-4',
        submittedByName: 'MIDALeader',
        submittedAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
        locked: true
      };

      runSubmissions.push(subA1, subA2, subB1, subB2);
      m2.teamARun1 = subA1;
      m2.teamARun2 = subA2;
      m2.teamBRun1 = subB1;
      m2.teamBRun2 = subB2;
      m2.finalScoreA = Number((scoreA1.finalRunScore + scoreA2.finalRunScore).toFixed(2));
      m2.finalScoreB = Number((scoreB1.finalRunScore + scoreB2.finalRunScore).toFixed(2));

      matchMessages.push({
        id: uuidv4(),
        matchId: m2.id,
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userRole: 'SYSTEM',
        type: 'SYSTEM',
        message: `SYSTEM — ALL RUNS SUBMITTED. Provisional Result:\n${m2.teamAName}: ${m2.finalScoreA.toFixed(2)} pts (Provisional Winner)\n${m2.teamBName}: ${m2.finalScoreB.toFixed(2)} pts\n10-Minute Review Window started.`,
        createdAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString()
      });
    }

    // Match 3: READY CHECK ACTIVE (Countdown running)
    if (m3 && m3.teamAId && m3.teamBId) {
      m3.matchStatus = 'READY_CHECK';
      m3.teamAReady = true;
      m3.teamBReady = false;
      m3.teamAReadyAt = new Date(now.getTime() - 3 * 60 * 1000).toISOString();
      m3.readyDeadlineAt = new Date(now.getTime() + 7 * 60 * 1000).toISOString();

      matchMessages.push({
        id: uuidv4(),
        matchId: m3.id,
        userId: 'SYSTEM',
        userName: 'SYSTEM',
        userRole: 'SYSTEM',
        type: 'SYSTEM',
        message: `SYSTEM — Ready Check initiated. 10 minutes remaining for both captains to ready up.`,
        createdAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString()
      });
    }

    // Match 4: DISPUTED MATCH (Flagged for Admin Review with ticket & evidence)
    if (m4 && m4.teamAId && m4.teamBId) {
      m4.matchStatus = 'DISPUTED';
      m4.teamAReady = true;
      m4.teamBReady = true;
      m4.run1Revealed = true;
      m4.adminNotes = 'Admin reviewing disputed kill count in Run 2';

      const scoreA1 = calculateRunScore({ runnerKills: 8, extractedCredits: 55000, playersExtracted: 3, objectiveCompleted: true });
      const scoreA2 = calculateRunScore({ runnerKills: 9, extractedCredits: 62000, playersExtracted: 3, objectiveCompleted: true });
      const scoreB1 = calculateRunScore({ runnerKills: 6, extractedCredits: 44000, playersExtracted: 3, objectiveCompleted: true });
      const scoreB2 = calculateRunScore({ runnerKills: 5, extractedCredits: 38000, playersExtracted: 3, objectiveCompleted: true });

      const subA1: RunSubmission = {
        id: 'sub-m4-a1',
        matchId: m4.id,
        teamId: m4.teamAId,
        runNumber: 1,
        ...scoreA1,
        submittedBy: 'usr-capt-7',
        submittedByName: 'SekiguchiExec',
        submittedAt: new Date(now.getTime() - 50 * 60 * 1000).toISOString(),
        locked: true
      };
      const subA2: RunSubmission = {
        id: 'sub-m4-a2',
        matchId: m4.id,
        teamId: m4.teamAId,
        runNumber: 2,
        ...scoreA2,
        submittedBy: 'usr-capt-7',
        submittedByName: 'SekiguchiExec',
        submittedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
        locked: true
      };
      const subB1: RunSubmission = {
        id: 'sub-m4-b1',
        matchId: m4.id,
        teamId: m4.teamBId,
        runNumber: 1,
        ...scoreB1,
        submittedBy: 'usr-capt-8',
        submittedByName: 'ArachneQueen',
        submittedAt: new Date(now.getTime() - 50 * 60 * 1000).toISOString(),
        locked: true
      };
      const subB2: RunSubmission = {
        id: 'sub-m4-b2',
        matchId: m4.id,
        teamId: m4.teamBId,
        runNumber: 2,
        ...scoreB2,
        submittedBy: 'usr-capt-8',
        submittedByName: 'ArachneQueen',
        submittedAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
        locked: true
      };

      runSubmissions.push(subA1, subA2, subB1, subB2);
      m4.teamARun1 = subA1;
      m4.teamARun2 = subA2;
      m4.teamBRun1 = subB1;
      m4.teamBRun2 = subB2;
      m4.finalScoreA = Number((scoreA1.finalRunScore + scoreA2.finalRunScore).toFixed(2));
      m4.finalScoreB = Number((scoreB1.finalRunScore + scoreB2.finalRunScore).toFixed(2));

      // Dispute record
      const disputeId = 'disp-1';
      matchDisputes.push({
        id: disputeId,
        matchId: m4.id,
        requestingTeamId: m4.teamBId,
        requestingTeamName: m4.teamBName || '',
        disputedTeamId: m4.teamAId,
        disputedTeamName: m4.teamAName || '',
        runNumber: 2,
        category: 'Kill count incorrect / AI kills counted as Runner kills',
        description: 'Sekiguchi reported 9 runner kills in Run 2. Their Twitch stream VOD at timestamp 1:12:40 clearly shows 2 of those eliminations were AI Prime Wardens, not enemy player runners.',
        evidenceUrls: ['https://twitch.tv/videos/marathon_seki_run2?t=01h12m40s'],
        status: 'INVESTIGATING',
        assignedAdminId: 'usr-admin-1',
        assignedAdminName: 'TournamentDirector',
        createdAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        updatedAt: isoNow
      });

      // Admin ticket
      adminTickets.push({
        id: 'tkt-1',
        matchId: m4.id,
        tournamentId: 'tourn-1',
        requestingUserId: 'usr-capt-8',
        requestingUserName: 'ArachneQueen',
        requestingTeamId: m4.teamBId,
        requestingTeamName: m4.teamBName || '',
        category: 'Suspected scoring discrepancy',
        description: 'Dispute filed on Sekiguchi Run 2 kills. Requesting referee review.',
        status: 'INVESTIGATING',
        assignedAdminId: 'usr-admin-1',
        assignedAdminName: 'TournamentDirector',
        createdAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        updatedAt: isoNow
      });

      matchMessages.push(
        {
          id: uuidv4(),
          matchId: m4.id,
          userId: 'usr-capt-8',
          userName: 'ArachneQueen',
          userRole: 'CAPTAIN',
          teamId: m4.teamBId,
          teamName: m4.teamBName || '',
          type: 'FLAG',
          message: 'FLAGGED RESULT: Sekiguchi reported 9 kills on Run 2, but 2 kills in VOD were AI Wardens.',
          createdAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString()
        },
        {
          id: uuidv4(),
          matchId: m4.id,
          userId: 'usr-admin-1',
          userName: 'TournamentDirector',
          userRole: 'ADMIN',
          type: 'ADMIN',
          message: 'Admin has entered Match Room. Reviewing VOD timestamps now. Please stand by.',
          createdAt: new Date(now.getTime() - 8 * 60 * 1000).toISOString()
        }
      );
    }

    // Add initial Audit Logs
    auditLogs.push(
      {
        id: uuidv4(),
        actorType: 'SYSTEM',
        actorId: 'SYSTEM',
        actorName: 'Tournament Engine',
        action: 'BRACKET_GENERATED',
        entityType: 'TOURNAMENT',
        entityId: 'tourn-1',
        metadata: { teamsCount: 8, bracketSize: 8 },
        timestamp: new Date(now.getTime() - 30 * 60 * 1000).toISOString()
      },
      {
        id: uuidv4(),
        actorType: 'USER',
        actorId: 'usr-capt-8',
        actorName: 'ArachneQueen',
        action: 'RESULT_FLAGGED',
        entityType: 'MATCH',
        entityId: m4 ? m4.id : 'm4',
        metadata: { reason: 'Kill count discrepancy on Run 2' },
        timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString()
      }
    );

    return {
      users,
      teams,
      teamMembers,
      teamInvitations: [],
      tournaments,
      tournamentRegistrations,
      matches,
      brackets: [bracket],
      runSubmissions,
      matchMessages,
      matchEvidence,
      matchDisputes,
      adminTickets,
      adminActions,
      auditLogs,
      notifications
    };
  }
}

export const db = new DatabaseStore();
