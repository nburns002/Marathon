import { db } from './db';
import { Tournament, Team, User, TournamentRosterMember } from '../src/types';

export interface EligibilityResult {
  eligible: boolean;
  error?: string;
  tournament?: Tournament;
  team?: Team;
  rosterSnapshot?: TournamentRosterMember[];
  entryFee?: number;
}

/**
 * Normalizes a Bungie ID by trimming, collapsing spaces, and standardizing case.
 * Example: "AlphaRunner#1234" -> "alpharunner#1234"
 */
export function normalizeBungieId(bungieId: string): string {
  if (!bungieId) return '';
  return bungieId.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Validates Bungie ID format: 3-24 characters before '#', followed by 4-5 digits.
 */
export function validateBungieIdFormat(bungieId: string): boolean {
  if (!bungieId || typeof bungieId !== 'string') return false;
  const trimmed = bungieId.trim();
  // Standard Bungie.net display name format: Name#1234
  const regex = /^[\p{L}\p{N}\p{Pd}\p{Pc} ]{2,24}#[0-9]{4,5}$/u;
  return regex.test(trimmed);
}

/**
 * Authoritatively validates tournament registration eligibility.
 * Used by BOTH `/join-check` and `/checkout` or `/register`.
 */
export function validateTournamentRegistrationEligibility(
  tournamentId: string,
  teamId: string,
  requestingUser: User
): EligibilityResult {
  // 1. Tournament exists
  const tournament = db.data.tournaments.find((t) => t.id === tournamentId);
  if (!tournament) {
    return { eligible: false, error: 'Tournament not found.' };
  }

  // 2. Status is REGISTRATION_OPEN
  if (tournament.status !== 'REGISTRATION_OPEN') {
    return {
      eligible: false,
      error: `Tournament registration is currently ${tournament.status.replace(/_/g, ' ')}.`
    };
  }

  // 3. Current server time has not passed registrationCloseAt
  const now = new Date();
  if (tournament.registrationCloseAt) {
    const closeTime = new Date(tournament.registrationCloseAt);
    if (now.getTime() > closeTime.getTime()) {
      return {
        eligible: false,
        error: `Tournament registration closed on ${closeTime.toUTCString()}.`
      };
    }
  }

  // 4. Team exists
  const team = db.data.teams.find((t) => t.id === teamId);
  if (!team) {
    return { eligible: false, error: 'Selected team not found.' };
  }

  // 5. Requesting user is captain or authorized admin
  const isAdmin = requestingUser.role === 'ADMIN' || requestingUser.role === 'SUPERADMIN';
  if (team.captainUserId !== requestingUser.id && !isAdmin) {
    return {
      eligible: false,
      error: 'Only the designated Team Captain may register a team into the tournament.'
    };
  }

  // 6. Exactly 3 active roster members
  const activeMembers = db.data.teamMembers.filter(
    (tm) => tm.teamId === team.id && tm.membershipStatus === 'ACTIVE'
  );
  if (activeMembers.length !== 3) {
    return {
      eligible: false,
      error: `Tournament requires exactly 3 active players on the roster. Team "${team.name}" currently has ${activeMembers.length} player(s).`
    };
  }

  // 7. All users exist in the database with ACTIVE status
  const memberUsers: User[] = [];
  for (const tm of activeMembers) {
    const usr = db.data.users.find((u) => u.id === tm.userId);
    if (!usr) {
      return {
        eligible: false,
        error: `Roster member ID '${tm.userId}' does not exist in the player database.`
      };
    }
    if (usr.accountStatus === 'SUSPENDED') {
      return {
        eligible: false,
        error: `Player ${usr.displayName || usr.username} is currently suspended and ineligible for tournament competition.`
      };
    }
    memberUsers.push(usr);
  }

  // 8. All players have valid Bungie IDs
  for (const usr of memberUsers) {
    if (!usr.bungieId || !validateBungieIdFormat(usr.bungieId)) {
      return {
        eligible: false,
        error: `Player ${usr.displayName || usr.username} does not have a valid Bungie ID (format: Name#1234). Both Bungie ID format and linked status are required.`
      };
    }
  }

  // 9. Prevent duplicate Bungie IDs within the same team
  const normalizedTeamBungieIds = memberUsers.map((u) => normalizeBungieId(u.bungieId));
  const uniqueTeamBungieIds = new Set(normalizedTeamBungieIds);
  if (uniqueTeamBungieIds.size !== memberUsers.length) {
    return {
      eligible: false,
      error: 'Duplicate Bungie ID detected within the same team roster. Each competitor must have a distinct Bungie ID.'
    };
  }

  // Retrieve all existing confirmed registrations for this tournament
  const existingRegistrations = db.data.tournamentRegistrations.filter(
    (r) => r.tournamentId === tournament.id && r.status === 'REGISTERED' && r.paymentStatus === 'PAID'
  );

  // 10. Tournament registered team count is below maxTeams
  if (existingRegistrations.length >= tournament.maxTeams) {
    return {
      eligible: false,
      error: `Tournament has reached maximum capacity (${tournament.maxTeams} teams). Registration is full.`
    };
  }

  // 11. Team is not already registered
  const teamAlreadyRegistered = existingRegistrations.some((r) => r.teamId === team.id);
  if (teamAlreadyRegistered) {
    return {
      eligible: false,
      error: `Team "${team.name}" is already registered and confirmed for this tournament.`
    };
  }

  // 12. No roster user is registered on another team in this tournament
  for (const member of memberUsers) {
    for (const reg of existingRegistrations) {
      const matchInSnapshot = reg.rosterSnapshot.some((snap) => snap.userId === member.id);
      if (matchInSnapshot) {
        return {
          eligible: false,
          error: `Player ${member.displayName || member.username} is already registered on team "${reg.teamName}" in this tournament. Cross-team participation is strictly prohibited.`
        };
      }
    }
  }

  // 13. No normalized Bungie ID is already present on another registered roster
  for (const member of memberUsers) {
    const normId = normalizeBungieId(member.bungieId);
    for (const reg of existingRegistrations) {
      const matchBungieInSnapshot = reg.rosterSnapshot.some(
        (snap) => normalizeBungieId(snap.bungieIdSnapshot) === normId
      );
      if (matchBungieInSnapshot) {
        return {
          eligible: false,
          error: `Bungie ID "${member.bungieId}" is already registered on team "${reg.teamName}" in this tournament. Duplicate identity registration is prohibited.`
        };
      }
    }
  }

  // Build immutable roster snapshot
  const rosterSnapshot: TournamentRosterMember[] = memberUsers.map((u) => ({
    userId: u.id,
    usernameSnapshot: u.username,
    displayNameSnapshot: u.displayName,
    bungieIdSnapshot: u.bungieId
  }));

  return {
    eligible: true,
    tournament,
    team,
    rosterSnapshot,
    entryFee: tournament.entryFee
  };
}
