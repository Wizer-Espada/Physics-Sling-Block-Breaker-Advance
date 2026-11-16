import { and, desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import { gameRuns, soundtracks, users } from './schema.ts';

export async function getOrCreateUser(
  uid: string,
  email: string,
  displayName?: string | null
) {
  try {
    const [user] = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          ...(displayName ? { displayName } : {}),
        },
      })
      .returning();

    return user;
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize player profile.', { cause: error });
  }
}

export async function recordGameRun(params: {
  uid: string;
  email: string;
  displayName?: string | null;
  score: number;
  turn: number;
  maxBalls: number;
  powerupsCollected: number;
}) {
  try {
    const user = await getOrCreateUser(params.uid, params.email, params.displayName);
    const [run] = await db
      .insert(gameRuns)
      .values({
        userId: user.id,
        score: Math.max(0, Math.floor(params.score)),
        turn: Math.max(1, Math.floor(params.turn)),
        maxBalls: Math.max(1, Math.floor(params.maxBalls)),
        powerupsCollected: Math.max(0, Math.floor(params.powerupsCollected)),
      })
      .returning();
    return run;
  } catch (error) {
    console.error('Database error in recordGameRun:', error);
    throw new Error('Failed to save game run.', { cause: error });
  }
}

export async function getUserProfileSummary(
  uid: string,
  email: string,
  displayName?: string | null
) {
  try {
    const user = await getOrCreateUser(uid, email, displayName);
    const allRuns = await db
      .select()
      .from(gameRuns)
      .where(eq(gameRuns.userId, user.id))
      .orderBy(desc(gameRuns.createdAt));

    const totalRuns = allRuns.length;
    let bestScore = 0;
    let bestTurn = 0;

    // Distinct UTC/local date keys (YYYY-MM-DD) for play streak calculation
    const distinctDates = new Set<string>();
    for (const r of allRuns) {
      if (r.score > bestScore) bestScore = r.score;
      if (r.turn > bestTurn) bestTurn = r.turn;
      const d = new Date(r.createdAt);
      distinctDates.add(d.toISOString().slice(0, 10));
    }

    const sortedDates = Array.from(distinctDates).sort((a, b) =>
      b.localeCompare(a)
    );
    let cloudStreak = 0;
    if (sortedDates.length > 0) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const yestDate = new Date();
      yestDate.setUTCDate(yestDate.getUTCDate() - 1);
      const yesterdayIso = yestDate.toISOString().slice(0, 10);

      if (sortedDates[0] === todayIso || sortedDates[0] === yesterdayIso) {
        cloudStreak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
          const prevDate = new Date(`${sortedDates[i - 1]}T00:00:00Z`);
          prevDate.setUTCDate(prevDate.getUTCDate() - 1);
          const expectedPrev = prevDate.toISOString().slice(0, 10);
          if (sortedDates[i] === expectedPrev) {
            cloudStreak += 1;
          } else {
            break;
          }
        }
      }
    }

    return {
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      },
      bestScore,
      bestTurn,
      totalRuns,
      cloudStreak,
      recentRuns: allRuns.slice(0, 15).map((r) => ({
        id: r.id,
        score: r.score,
        turn: r.turn,
        maxBalls: r.maxBalls,
        powerupsCollected: r.powerupsCollected,
        createdAt: r.createdAt,
      })),
    };
  } catch (error) {
    console.error('Database error in getUserProfileSummary:', error);
    throw new Error('Failed to load player profile.', { cause: error });
  }
}

export async function getGlobalLeaderboard(limitCount = 12) {
  try {
    const rows = await db
      .select({
        id: gameRuns.id,
        score: gameRuns.score,
        turn: gameRuns.turn,
        maxBalls: gameRuns.maxBalls,
        powerupsCollected: gameRuns.powerupsCollected,
        createdAt: gameRuns.createdAt,
        displayName: users.displayName,
        email: users.email,
      })
      .from(gameRuns)
      .innerJoin(users, eq(gameRuns.userId, users.id))
      .orderBy(desc(gameRuns.score), desc(gameRuns.turn), desc(gameRuns.createdAt))
      .limit(limitCount);

    return rows.map((row) => ({
      id: row.id,
      playerName:
        row.displayName?.trim() ||
        (row.email ? row.email.split('@')[0] : 'Player'),
      score: row.score,
      turn: row.turn,
      maxBalls: row.maxBalls,
      powerupsCollected: row.powerupsCollected,
      createdAt: row.createdAt,
    }));
  } catch (error) {
    console.error('Database error in getGlobalLeaderboard:', error);
    throw new Error('Failed to fetch leaderboard.', { cause: error });
  }
}

export async function saveSoundtrackRecord(params: {
  uid: string;
  email: string;
  displayName?: string | null;
  prompt: string;
  model: string;
  mimeType: string;
  audioDataUrl: string;
  notes?: string | null;
}) {
  try {
    const user = await getOrCreateUser(params.uid, params.email, params.displayName);
    const [track] = await db
      .insert(soundtracks)
      .values({
        userId: user.id,
        prompt: params.prompt,
        model: params.model,
        mimeType: params.mimeType,
        audioDataUrl: params.audioDataUrl,
        notes: params.notes ?? null,
      })
      .returning();

    return {
      id: track.id,
      prompt: track.prompt,
      model: track.model,
      mimeType: track.mimeType,
      audioDataUrl: track.audioDataUrl,
      notes: track.notes,
      createdAt: track.createdAt,
    };
  } catch (error) {
    console.error('Database error in saveSoundtrackRecord:', error);
    throw new Error('Failed to save generated soundtrack.', { cause: error });
  }
}

export async function getUserSoundtracks(uid: string) {
  try {
    const rows = await db
      .select({
        id: soundtracks.id,
        prompt: soundtracks.prompt,
        model: soundtracks.model,
        mimeType: soundtracks.mimeType,
        audioDataUrl: soundtracks.audioDataUrl,
        notes: soundtracks.notes,
        createdAt: soundtracks.createdAt,
      })
      .from(soundtracks)
      .innerJoin(users, eq(soundtracks.userId, users.id))
      .where(eq(users.uid, uid))
      .orderBy(desc(soundtracks.createdAt))
      .limit(10);

    return rows;
  } catch (error) {
    console.error('Database error in getUserSoundtracks:', error);
    throw new Error('Failed to fetch saved soundtracks.', { cause: error });
  }
}

export async function deleteUserSoundtrack(uid: string, trackId: number) {
  try {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);

    if (!user) return false;

    const deleted = await db
      .delete(soundtracks)
      .where(and(eq(soundtracks.id, trackId), eq(soundtracks.userId, user.id)))
      .returning({ id: soundtracks.id });

    return deleted.length > 0;
  } catch (error) {
    console.error('Database error in deleteUserSoundtrack:', error);
    throw new Error('Failed to delete soundtrack.', { cause: error });
  }
}
