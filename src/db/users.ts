import { and, desc, eq, sql } from 'drizzle-orm';
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

function formatPublicPlayerName(params: {
  displayName: string | null;
  email: string;
  uid: string;
}): string {
  const trimmed = params.displayName?.trim();
  if (trimmed) return trimmed;
  if (params.uid.startsWith('guest_')) {
    return `Player-${params.uid.slice(-4).toUpperCase()}`;
  }
  return params.email ? params.email.split('@')[0] : 'Player';
}

export async function updatePlayerDisplayName(params: {
  uid: string;
  email: string;
  displayName: string;
}) {
  const cleanName = params.displayName.replace(/\s+/g, ' ').trim().slice(0, 20);
  if (!cleanName) {
    throw new Error('Player name cannot be empty.');
  }

  const [user] = await db
    .insert(users)
    .values({
      uid: params.uid,
      email: params.email,
      displayName: cleanName,
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        displayName: cleanName,
      },
    })
    .returning();

  return user;
}

interface RankedRow {
  id: number;
  uid: string;
  display_name: string | null;
  email: string;
  score: number;
  turn: number;
  max_balls: number;
  powerups_collected: number;
  created_at: Date | string;
  rank: number;
}

export async function getGlobalLeaderboard(
  limitCount = 20,
  currentUid?: string | null
) {
  try {
    const topResult = await db.execute(sql`
      WITH best_per_player AS (
        SELECT DISTINCT ON (gr.user_id)
          gr.id,
          u.uid,
          u.display_name,
          u.email,
          gr.score,
          gr.turn,
          gr.max_balls,
          gr.powerups_collected,
          gr.created_at
        FROM game_runs gr
        INNER JOIN users u ON gr.user_id = u.id
        WHERE gr.score > 0
        ORDER BY gr.user_id, gr.score DESC, gr.turn DESC, gr.created_at ASC
      ),
      ranked AS (
        SELECT
          id,
          uid,
          display_name,
          email,
          score,
          turn,
          max_balls,
          powerups_collected,
          created_at,
          ROW_NUMBER() OVER (ORDER BY score DESC, turn DESC, created_at ASC)::int AS rank
        FROM best_per_player
      )
      SELECT * FROM ranked
      ORDER BY rank ASC
      LIMIT ${limitCount}
    `);

    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT user_id)::int AS total_players
      FROM game_runs
      WHERE score > 0
    `);

    const topRows = topResult.rows as unknown as RankedRow[];
    const totalPlayers = Number(
      (countResult.rows[0] as { total_players?: number } | undefined)?.total_players ?? 0
    );

    const entries = topRows.map((row) => ({
      id: Number(row.id),
      rank: Number(row.rank),
      playerName: formatPublicPlayerName({
        displayName: row.display_name,
        email: row.email,
        uid: row.uid,
      }),
      score: Number(row.score),
      turn: Number(row.turn),
      maxBalls: Number(row.max_balls),
      powerupsCollected: Number(row.powerups_collected),
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      isYou: Boolean(currentUid && row.uid === currentUid),
    }));

    let myRank: {
      rank: number;
      playerName: string;
      score: number;
      turn: number;
    } | null = null;

    if (currentUid) {
      const inTop = entries.find((e) => e.isYou);
      if (inTop) {
        myRank = {
          rank: inTop.rank,
          playerName: inTop.playerName,
          score: inTop.score,
          turn: inTop.turn,
        };
      } else {
        const selfResult = await db.execute(sql`
          WITH best_per_player AS (
            SELECT DISTINCT ON (gr.user_id)
              u.uid,
              u.display_name,
              u.email,
              gr.score,
              gr.turn,
              gr.created_at
            FROM game_runs gr
            INNER JOIN users u ON gr.user_id = u.id
            WHERE gr.score > 0
            ORDER BY gr.user_id, gr.score DESC, gr.turn DESC, gr.created_at ASC
          ),
          ranked AS (
            SELECT
              uid,
              display_name,
              email,
              score,
              turn,
              ROW_NUMBER() OVER (ORDER BY score DESC, turn DESC, created_at ASC)::int AS rank
            FROM best_per_player
          )
          SELECT * FROM ranked WHERE uid = ${currentUid} LIMIT 1
        `);

        const selfRow = selfResult.rows[0] as unknown as RankedRow | undefined;
        if (selfRow) {
          myRank = {
            rank: Number(selfRow.rank),
            playerName: formatPublicPlayerName({
              displayName: selfRow.display_name,
              email: selfRow.email,
              uid: selfRow.uid,
            }),
            score: Number(selfRow.score),
            turn: Number(selfRow.turn),
          };
        }
      }
    }

    return {
      entries,
      topScore: entries[0] ?? null,
      totalPlayers,
      myRank,
    };
  } catch (error) {
    console.error('Database error in getGlobalLeaderboard:', error);
    throw new Error('Failed to fetch leaderboard.', { cause: error });
  }
}

interface RecentActivityRow {
  id: number;
  uid: string;
  display_name: string | null;
  email: string;
  score: number;
  turn: number;
  max_balls: number;
  created_at: Date | string;
}

export async function getRecentGlobalActivity(
  limitCount = 20,
  excludeUids: string[] = []
) {
  try {
    const cleanExcludes = Array.from(
      new Set(excludeUids.map((u) => u.trim()).filter((u) => u.length > 0))
    );

    const recentResult = await db.execute(sql`
      SELECT
        gr.id,
        u.uid,
        u.display_name,
        u.email,
        gr.score,
        gr.turn,
        gr.max_balls,
        gr.created_at
      FROM game_runs gr
      INNER JOIN users u ON gr.user_id = u.id
      WHERE gr.score > 0
      ORDER BY gr.created_at DESC
      LIMIT ${Math.max(limitCount * 2, 30)}
    `);

    const rows = recentResult.rows as unknown as RecentActivityRow[];
    const excludeSet = new Set(cleanExcludes);

    const entries = rows
      .filter((row) => !excludeSet.has(row.uid))
      .slice(0, limitCount)
      .map((row) => ({
        id: Number(row.id),
        playerName: formatPublicPlayerName({
          displayName: row.display_name,
          email: row.email,
          uid: row.uid,
        }),
        score: Number(row.score),
        turn: Number(row.turn),
        maxBalls: Number(row.max_balls),
        createdAt:
          row.created_at instanceof Date
            ? row.created_at.toISOString()
            : String(row.created_at),
      }));

    return entries;
  } catch (error) {
    console.error('Database error in getRecentGlobalActivity:', error);
    throw new Error('Failed to fetch global activity.', { cause: error });
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
