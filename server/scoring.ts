export interface ScoreCalculationInput {
  runnerKills: number;
  extractedCredits: number;
  playersExtracted: 0 | 1 | 2 | 3;
  objectiveCompleted: boolean;
  objectivePointsValue?: number;
}

export interface ScoreCalculationResult {
  runnerKills: number;
  extractedCredits: number;
  playersExtracted: 0 | 1 | 2 | 3;
  objectiveCompleted: boolean;
  killPoints: number;
  lootPoints: number;
  objectivePoints: number;
  baseScore: number;
  survivalMultiplier: number;
  finalRunScore: number;
  breakdownString: string;
}

/**
 * Authoritative Marathon tournament scoring function.
 */
export function calculateRunScore(input: ScoreCalculationInput): ScoreCalculationResult {
  const runnerKills = Math.max(0, Math.floor(input.runnerKills || 0));
  const extractedCredits = Math.max(0, Number(input.extractedCredits) || 0);
  const playersExtracted = Math.min(3, Math.max(0, Math.floor(input.playersExtracted || 0))) as 0 | 1 | 2 | 3;
  const objectiveCompleted = Boolean(input.objectiveCompleted);
  const objectivePointsValue = input.objectivePointsValue ?? 5;

  const killPoints = runnerKills * 5;
  const lootPoints = Number((extractedCredits / 3000).toFixed(4));
  const objectivePoints = objectiveCompleted ? objectivePointsValue : 0;
  const baseScore = Number((killPoints + lootPoints + objectivePoints).toFixed(4));

  let survivalMultiplier = 1.0;
  let finalRunScore = 0;

  if (playersExtracted === 3) {
    survivalMultiplier = 1.2;
    finalRunScore = Number((baseScore * 1.2).toFixed(2));
  } else if (playersExtracted === 1 || playersExtracted === 2) {
    survivalMultiplier = 1.0;
    finalRunScore = Number(baseScore.toFixed(2));
  } else {
    // 0 players extracted -> Squad Wipe -> 0 points
    survivalMultiplier = 0.0;
    finalRunScore = 0;
  }

  const breakdownString = [
    `Kills: ${runnerKills} (${killPoints} pts)`,
    `Loot: ${extractedCredits.toLocaleString()} credits (${lootPoints.toFixed(2)} pts)`,
    `Objective: ${objectiveCompleted ? `Yes (${objectivePoints} pts)` : 'No (0 pts)'}`,
    `Base Score: ${baseScore.toFixed(2)}`,
    `Extraction: ${playersExtracted}/3 survived (${survivalMultiplier === 1.2 ? '1.20×' : survivalMultiplier === 1.0 ? '1.00×' : '0.00× Wipe'})`,
    `FINAL RUN SCORE: ${finalRunScore.toFixed(2)}`
  ].join(' | ');

  return {
    runnerKills,
    extractedCredits,
    playersExtracted,
    objectiveCompleted,
    killPoints,
    lootPoints,
    objectivePoints,
    baseScore,
    survivalMultiplier,
    finalRunScore,
    breakdownString
  };
}

/**
 * Parses structured chat command:
 * /score run1 kills:6 loot:48000 survived:3 objective:yes
 */
export function parseScoreCommand(commandText: string): {
  runNumber: 1 | 2;
  runnerKills: number;
  extractedCredits: number;
  playersExtracted: 0 | 1 | 2 | 3;
  objectiveCompleted: boolean;
} | null {
  const trimmed = commandText.trim();
  if (!trimmed.startsWith('/score')) return null;

  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return null;

  const runArg = parts[1].toLowerCase();
  let runNumber: 1 | 2 = 1;
  if (runArg === 'run1' || runArg === '1') {
    runNumber = 1;
  } else if (runArg === 'run2' || runArg === '2') {
    runNumber = 2;
  } else {
    return null;
  }

  let runnerKills = 0;
  let extractedCredits = 0;
  let playersExtracted: 0 | 1 | 2 | 3 = 0;
  let objectiveCompleted = false;

  for (let i = 2; i < parts.length; i++) {
    const item = parts[i];
    const [key, val] = item.split(':');
    if (!key || val === undefined) continue;

    const k = key.toLowerCase();
    const v = val.toLowerCase();

    if (k === 'kills' || k === 'kill' || k === 'k') {
      runnerKills = parseInt(v, 10) || 0;
    } else if (k === 'loot' || k === 'credits' || k === 'credit' || k === 'c') {
      extractedCredits = parseFloat(v.replace(/,/g, '')) || 0;
    } else if (k === 'survived' || k === 'extracted' || k === 'survivors' || k === 's') {
      const parsed = parseInt(v, 10);
      if (parsed >= 0 && parsed <= 3) {
        playersExtracted = parsed as 0 | 1 | 2 | 3;
      }
    } else if (k === 'objective' || k === 'obj' || k === 'o') {
      objectiveCompleted = v === 'yes' || v === 'true' || v === '1' || v === 'y';
    }
  }

  return {
    runNumber,
    runnerKills,
    extractedCredits,
    playersExtracted,
    objectiveCompleted
  };
}

export interface RunDataForTiebreaker {
  runnerKills: number;
  extractedCredits: number;
  playersExtracted: number;
  objectiveCompleted: boolean;
  finalRunScore: number;
}

export interface TeamRunsData {
  teamId: string;
  run1?: RunDataForTiebreaker | null;
  run2?: RunDataForTiebreaker | null;
}

export interface TiebreakerResult {
  winnerTeamId: string;
  reason: string;
  isTied: boolean;
}

/**
 * Resolves match winner including tiebreaker sequence.
 */
export function determineMatchWinner(
  teamA: TeamRunsData,
  teamB: TeamRunsData
): TiebreakerResult {
  const totalScoreA = Number(((teamA.run1?.finalRunScore || 0) + (teamA.run2?.finalRunScore || 0)).toFixed(2));
  const totalScoreB = Number(((teamB.run1?.finalRunScore || 0) + (teamB.run2?.finalRunScore || 0)).toFixed(2));

  if (totalScoreA > totalScoreB) {
    return {
      winnerTeamId: teamA.teamId,
      reason: `Higher overall match score (${totalScoreA.toFixed(2)} vs ${totalScoreB.toFixed(2)})`,
      isTied: false
    };
  }

  if (totalScoreB > totalScoreA) {
    return {
      winnerTeamId: teamB.teamId,
      reason: `Higher overall match score (${totalScoreB.toFixed(2)} vs ${totalScoreA.toFixed(2)})`,
      isTied: false
    };
  }

  // Identical total score -> Apply Tiebreaker hierarchy
  // 1. Most full-squad (3-man) extractions
  const fullExtA = (teamA.run1?.playersExtracted === 3 ? 1 : 0) + (teamA.run2?.playersExtracted === 3 ? 1 : 0);
  const fullExtB = (teamB.run1?.playersExtracted === 3 ? 1 : 0) + (teamB.run2?.playersExtracted === 3 ? 1 : 0);
  if (fullExtA !== fullExtB) {
    const winner = fullExtA > fullExtB ? teamA.teamId : teamB.teamId;
    return {
      winnerTeamId: winner,
      reason: `Tiebreaker 1: Most full-squad extractions (${Math.max(fullExtA, fullExtB)} vs ${Math.min(fullExtA, fullExtB)})`,
      isTied: false
    };
  }

  // 2. Most total Runner eliminations
  const killsA = (teamA.run1?.runnerKills || 0) + (teamA.run2?.runnerKills || 0);
  const killsB = (teamB.run1?.runnerKills || 0) + (teamB.run2?.runnerKills || 0);
  if (killsA !== killsB) {
    const winner = killsA > killsB ? teamA.teamId : teamB.teamId;
    return {
      winnerTeamId: winner,
      reason: `Tiebreaker 2: Most total Runner eliminations (${Math.max(killsA, killsB)} vs ${Math.min(killsA, killsB)})`,
      isTied: false
    };
  }

  // 3. Highest total extracted credit value
  const lootA = (teamA.run1?.extractedCredits || 0) + (teamA.run2?.extractedCredits || 0);
  const lootB = (teamB.run1?.extractedCredits || 0) + (teamB.run2?.extractedCredits || 0);
  if (lootA !== lootB) {
    const winner = lootA > lootB ? teamA.teamId : teamB.teamId;
    return {
      winnerTeamId: winner,
      reason: `Tiebreaker 3: Highest total extracted credits (${Math.max(lootA, lootB).toLocaleString()} vs ${Math.min(lootA, lootB).toLocaleString()})`,
      isTied: false
    };
  }

  // 4. Highest single Run Score
  const highA = Math.max(teamA.run1?.finalRunScore || 0, teamA.run2?.finalRunScore || 0);
  const highB = Math.max(teamB.run1?.finalRunScore || 0, teamB.run2?.finalRunScore || 0);
  if (highA !== highB) {
    const winner = highA > highB ? teamA.teamId : teamB.teamId;
    return {
      winnerTeamId: winner,
      reason: `Tiebreaker 4: Highest single Run Score (${Math.max(highA, highB).toFixed(2)} vs ${Math.min(highA, highB).toFixed(2)})`,
      isTied: false
    };
  }

  // 5. Most Featured Objectives completed
  const objA = (teamA.run1?.objectiveCompleted ? 1 : 0) + (teamA.run2?.objectiveCompleted ? 1 : 0);
  const objB = (teamB.run1?.objectiveCompleted ? 1 : 0) + (teamB.run2?.objectiveCompleted ? 1 : 0);
  if (objA !== objB) {
    const winner = objA > objB ? teamA.teamId : teamB.teamId;
    return {
      winnerTeamId: winner,
      reason: `Tiebreaker 5: Most Featured Objectives completed (${Math.max(objA, objB)} vs ${Math.min(objA, objB)})`,
      isTied: false
    };
  }

  // 6. Complete Tie -> Administrator ruling / tiebreaker run needed
  return {
    winnerTeamId: '',
    reason: 'Dead heat tie across all tiebreakers. Admin tiebreaker run required.',
    isTied: true
  };
}
