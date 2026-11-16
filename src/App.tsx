import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { CheckCircle2 } from 'lucide-react';
import { GameControls } from './components/GameControls.tsx';
import { GameHUD } from './components/GameHUD.tsx';
import { GameOverModal } from './components/GameOverModal.tsx';
import { MissionsDrawer } from './components/MissionsDrawer.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import {
  LeaderboardDrawer,
  LeaderboardEntry,
  PlayerProfileSummary,
} from './components/LeaderboardDrawer.tsx';
import { soundEngine } from './game/audio.ts';
import { hapticsEngine } from './game/haptics.ts';
import {
  applyRunMissionProgress,
  DailyMissionsState,
  getActiveDailyMultiplier,
  loadDailyMissions,
} from './game/missions.ts';
import {
  clearActiveRunSnapshot,
  getEffectivePlayStreak,
  loadActiveRunSnapshot,
  loadPlayerProgress,
  PlayerProgressState,
  recordCompletedRun,
  recordMissionCompletionDay,
  recordPlayDay,
  saveActiveRunSnapshot,
} from './game/progress.ts';
import {
  createInitialGameState,
  fireSalvo,
  restoreGameStateFromSnapshot,
  saveBestScore,
  stepGame,
  triggerRecall,
  updateAim,
} from './game/physics.ts';
import { renderGame } from './game/renderer.ts';
import {
  GamePhase,
  GameState,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
} from './game/types.ts';
import { auth, googleAuthProvider } from './lib/firebase.ts';

interface UiSnapshot {
  phase: GamePhase;
  score: number;
  bestScore: number;
  turn: number;
  difficultyTier: number;
  ballCount: number;
  pendingExtraBalls: number;
  shields: number;
  powerupsCollected: number;
  maxBalls: number;
  fastForward: boolean;
  isNewBest: boolean;
  isAiming: boolean;
  isAimValid: boolean;
  aimAngleDeg: number;
}

function toSnapshot(state: GameState): UiSnapshot {
  return {
    phase: state.phase,
    score: state.score,
    bestScore: state.bestScore,
    turn: state.turn,
    difficultyTier: state.difficultyTier,
    ballCount: state.ballCount,
    pendingExtraBalls: state.pendingExtraBalls,
    shields: state.shields,
    powerupsCollected: state.powerupsCollected,
    maxBalls: state.maxBalls,
    fastForward: state.fastForward,
    isNewBest: state.isNewBest,
    isAiming: state.aim.isDragging,
    isAimValid: state.aim.isValid,
    aimAngleDeg: Math.round((state.aim.angleRad * 180) / Math.PI),
  };
}

export default function App() {
  const [dailyMissions, setDailyMissions] = useState<DailyMissionsState>(() =>
    loadDailyMissions()
  );
  const dailyMissionsRef = useRef<DailyMissionsState>(dailyMissions);

  const [playerProgress, setPlayerProgress] = useState<PlayerProgressState>(() =>
    loadPlayerProgress()
  );
  const playerProgressRef = useRef<PlayerProgressState>(playerProgress);

  const initialRestoredSnapshotRef = useRef(loadActiveRunSnapshot());
  const prevMissionMetricsRef = useRef({
    blocksDestroyed: initialRestoredSnapshotRef.current?.blocksDestroyed ?? 0,
    powerupsCollected: initialRestoredSnapshotRef.current?.powerupsCollected ?? 0,
    bombsDetonated: initialRestoredSnapshotRef.current?.bombsDetonated ?? 0,
  });
  const missionToastTimerRef = useRef<number | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(
    initialRestoredSnapshotRef.current
      ? restoreGameStateFromSnapshot(
          initialRestoredSnapshotRef.current,
          getActiveDailyMultiplier(dailyMissions)
        )
      : createInitialGameState(getActiveDailyMultiplier(dailyMissions))
  );
  const pointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
  } | null>(null);
  const recordedCloudGameOverRef = useRef<boolean>(false);
  const recordedLocalGameOverRef = useRef<boolean>(false);

  const [snap, setSnap] = useState<UiSnapshot>(() => toSnapshot(stateRef.current));
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: LOGICAL_WIDTH,
    height: LOGICAL_HEIGHT,
  });
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [showMissions, setShowMissions] = useState<boolean>(false);
  const [missionToast, setMissionToast] = useState<{
    title: string;
    bonusMultiplier: number;
    activeMultiplier: number;
  } | null>(null);

  // Firebase Auth & Cloud SQL Leaderboard state
  const [user, setUser] = useState<User | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfileSummary | null>(null);
  const [cloudSavedThisRun, setCloudSavedThisRun] = useState<boolean>(false);

  const syncUi = useCallback(() => {
    const st = stateRef.current;
    const prev = prevMissionMetricsRef.current;
    const deltaBlocks = Math.max(0, st.blocksDestroyed - prev.blocksDestroyed);
    const deltaPowerups = Math.max(0, st.powerupsCollected - prev.powerupsCollected);
    const deltaBombs = Math.max(0, st.bombsDetonated - prev.bombsDetonated);

    prev.blocksDestroyed = st.blocksDestroyed;
    prev.powerupsCollected = st.powerupsCollected;
    prev.bombsDetonated = st.bombsDetonated;

    const { nextDaily, newlyCompleted, changed } = applyRunMissionProgress(
      dailyMissionsRef.current,
      {
        blocksDestroyed: deltaBlocks,
        powerupsCollected: deltaPowerups,
        bombsDetonated: deltaBombs,
      },
      {
        turn: st.hasTakenFirstShot ? st.turn : 0,
        maxBalls: st.hasTakenFirstShot ? st.maxBalls : 0,
        peakChain: st.peakChainThisRun,
      }
    );

    if (changed) {
      dailyMissionsRef.current = nextDaily;
      const nextMult = getActiveDailyMultiplier(nextDaily);
      st.dailyScoreMultiplier = nextMult;
      setDailyMissions(nextDaily);

      if (newlyCompleted.length > 0) {
        const latest = newlyCompleted[newlyCompleted.length - 1];
        const streakUpdate = recordMissionCompletionDay(playerProgressRef.current);
        if (streakUpdate.changed) {
          playerProgressRef.current = streakUpdate.next;
          setPlayerProgress(streakUpdate.next);
        }

        soundEngine.playMissionComplete();
        hapticsEngine.pickup('multi_ball');
        setMissionToast({
          title: latest.title,
          bonusMultiplier: latest.bonusMultiplier,
          activeMultiplier: nextMult,
        });
        if (missionToastTimerRef.current !== null) {
          window.clearTimeout(missionToastTimerRef.current);
        }
        missionToastTimerRef.current = window.setTimeout(() => {
          setMissionToast(null);
          missionToastTimerRef.current = null;
        }, 3600);
      }
    }

    if (st.hasTakenFirstShot) {
      const playUpdate = recordPlayDay(playerProgressRef.current);
      if (playUpdate.changed) {
        playerProgressRef.current = playUpdate.next;
        setPlayerProgress(playUpdate.next);
      }
      if (st.phase === 'AIMING') {
        saveActiveRunSnapshot(st);
      }
    }

    setSnap(toSnapshot(st));
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (!res.ok) {
        setLeaderboardError(data?.error || 'Failed to load leaderboard.');
        return;
      }
      setLeaderboard(data.entries ?? []);
    } catch {
      setLeaderboardError('Unable to reach leaderboard service.');
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const fetchProfile = useCallback(async (firebaseUser: User) => {
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch('/api/profile', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.profile) {
        setProfile(data.profile);
        if (
          typeof data.profile.bestScore === 'number' &&
          data.profile.bestScore > stateRef.current.bestScore
        ) {
          stateRef.current.bestScore = data.profile.bestScore;
          saveBestScore(data.profile.bestScore);
          syncUi();
        }
      }
    } catch {
      // Keep offline localStorage gameplay intact
    }
  }, [syncUi]);

  // Fit 2D Canvas cleanly to any mobile or desktop screen while preserving 420:660 aspect ratio
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const updateFittedDimensions = () => {
      const rect = stage.getBoundingClientRect();
      const availW = Math.max(200, rect.width);
      const availH = Math.max(240, rect.height);
      const scale = Math.min(availW / LOGICAL_WIDTH, availH / LOGICAL_HEIGHT);
      const width = Math.floor(LOGICAL_WIDTH * scale);
      const height = Math.floor(LOGICAL_HEIGHT * scale);
      setCanvasSize({ width, height });

      const canvas = canvasRef.current;
      if (canvas) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(LOGICAL_WIDTH * dpr);
        canvas.height = Math.round(LOGICAL_HEIGHT * dpr);
      }
    };

    updateFittedDimensions();
    const observer = new ResizeObserver(updateFittedDimensions);
    observer.observe(stage);
    window.addEventListener('resize', updateFittedDimensions);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateFittedDimensions);
    };
  }, []);

  // 60fps requestAnimationFrame Physics & Render Loop
  useEffect(() => {
    let frameId = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.max(0, (now - lastTime) / 1000);
      lastTime = now;

      const changed = stepGame(stateRef.current, dt);
      if (changed) {
        syncUi();
      }

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = canvas.width / LOGICAL_WIDTH || 1;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderGame(ctx, stateRef.current);
        }
      }

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [syncUi]);

  // Auth listener & initial leaderboard fetch
  useEffect(() => {
    fetchLeaderboard();
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        fetchProfile(nextUser);
      } else {
        setProfile(null);
      }
    });
    return () => unsub();
  }, [fetchLeaderboard, fetchProfile]);

  // Auto-save active run progress when tab/app goes to background
  useEffect(() => {
    const saveIfReady = () => {
      saveActiveRunSnapshot(stateRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveIfReady();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', saveIfReady);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', saveIfReady);
    };
  }, []);

  // Persist completed run locally (history & streaks) and to Cloud SQL when signed in
  useEffect(() => {
    if (snap.phase !== 'GAME_OVER') {
      recordedCloudGameOverRef.current = false;
      recordedLocalGameOverRef.current = false;
      setCloudSavedThisRun(false);
      return;
    }

    if (!recordedLocalGameOverRef.current) {
      recordedLocalGameOverRef.current = true;
      clearActiveRunSnapshot();
      const st = stateRef.current;
      const nextProgress = recordCompletedRun(playerProgressRef.current, {
        score: st.score,
        turn: st.turn,
        maxBalls: st.maxBalls,
        powerupsCollected: st.powerupsCollected,
        blocksDestroyed: st.blocksDestroyed,
        peakChain: st.peakChainThisRun,
        dailyMultiplier: st.dailyScoreMultiplier,
      });
      playerProgressRef.current = nextProgress;
      setPlayerProgress(nextProgress);
    }

    if (recordedCloudGameOverRef.current || !user || snap.score <= 0) return;

    recordedCloudGameOverRef.current = true;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            score: snap.score,
            turn: snap.turn,
            maxBalls: snap.maxBalls,
            powerupsCollected: snap.powerupsCollected,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setCloudSavedThisRun(true);
        if (data.profile) setProfile(data.profile);
        if (data.entries) setLeaderboard(data.entries);
      } catch {
        // Ignore network errors cleanly
      }
    })();
  }, [snap.phase, snap.score, snap.turn, snap.maxBalls, snap.powerupsCollected, user]);

  // Window blur safety + keyboard Space for Fast Forward
  useEffect(() => {
    const onWindowBlur = () => {
      if (pointerRef.current) {
        pointerRef.current = null;
        stateRef.current.aim.isDragging = false;
        stateRef.current.aim.isValid = false;
        stateRef.current.aim.previewPoints = [];
        syncUi();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (showLeaderboard) {
        if (e.key === 'Escape') setShowLeaderboard(false);
        return;
      }
      if (showMissions) {
        if (e.key === 'Escape') setShowMissions(false);
        return;
      }
      if (
        e.key === ' ' &&
        (stateRef.current.phase === 'FIRING' || stateRef.current.phase === 'FLYING')
      ) {
        e.preventDefault();
        stateRef.current.fastForward = !stateRef.current.fastForward;
        syncUi();
      }
    };

    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('keydown', onKeyDown);
      if (missionToastTimerRef.current !== null) {
        window.clearTimeout(missionToastTimerRef.current);
      }
    };
  }, [showLeaderboard, showMissions, syncUi]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = stateRef.current;
    if (st.phase !== 'AIMING' || showLeaderboard || showMissions) return;
    if (pointerRef.current) return;

    soundEngine.unlock();
    pointerRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    st.aim.isDragging = true;
    st.aim.isValid = false;
    st.aim.previewPoints = [];
    syncUi();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = pointerRef.current;
    if (!active || active.id !== e.pointerId) return;

    const st = stateRef.current;
    if (st.phase !== 'AIMING') return;

    // Scale pointer delta to logical canvas pixels so mobile vs desktop feel identical
    const scaleX = LOGICAL_WIDTH / Math.max(1, canvasSize.width);
    const scaleY = LOGICAL_HEIGHT / Math.max(1, canvasSize.height);
    const rawDx = (active.startX - e.clientX) * scaleX;
    const rawDy = (active.startY - e.clientY) * scaleY;

    updateAim(st, rawDx, rawDy);
    syncUi();
  };

  const handlePointerEnd = (
    e: React.PointerEvent<HTMLCanvasElement>,
    cancelled: boolean
  ) => {
    const active = pointerRef.current;
    if (!active || active.id !== e.pointerId) return;
    pointerRef.current = null;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const st = stateRef.current;
    const shouldFire = !cancelled && st.phase === 'AIMING' && st.aim.isValid;
    const angle = st.aim.angleRad;

    st.aim.isDragging = false;
    st.aim.isValid = false;
    st.aim.previewPoints = [];

    if (shouldFire) {
      fireSalvo(st, angle);
    }
    syncUi();
  };

  const handleRestart = useCallback(() => {
    soundEngine.unlock();
    hapticsEngine.cancel();
    clearActiveRunSnapshot();
    const refreshedDaily = loadDailyMissions();
    dailyMissionsRef.current = refreshedDaily;
    setDailyMissions(refreshedDaily);
    const activeMult = getActiveDailyMultiplier(refreshedDaily);
    prevMissionMetricsRef.current = {
      blocksDestroyed: 0,
      powerupsCollected: 0,
      bombsDetonated: 0,
    };

    const fresh = createInitialGameState(activeMult);
    const bestKnown = Math.max(
      fresh.bestScore,
      playerProgressRef.current.bestScore,
      profile?.bestScore ?? 0
    );
    if (bestKnown > fresh.bestScore) {
      fresh.bestScore = bestKnown;
    }
    stateRef.current = fresh;
    syncUi();
  }, [profile?.bestScore, syncUi]);

  const handleToggleFastForward = useCallback(() => {
    stateRef.current.fastForward = !stateRef.current.fastForward;
    syncUi();
  }, [syncUi]);

  const handleRecallBalls = useCallback(() => {
    triggerRecall(stateRef.current);
    syncUi();
  }, [syncUi]);

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    soundEngine.setMuted(next);
    setMuted(next);
    if (!next) soundEngine.unlock();
  }, [muted]);

  const handleOpenLeaderboard = useCallback(() => {
    fetchLeaderboard();
    if (user) fetchProfile(user);
    setShowLeaderboard(true);
  }, [fetchLeaderboard, fetchProfile, user]);

  const handleOpenMissions = useCallback(() => {
    const refreshedDaily = loadDailyMissions();
    dailyMissionsRef.current = refreshedDaily;
    setDailyMissions(refreshedDaily);
    stateRef.current.dailyScoreMultiplier = getActiveDailyMultiplier(refreshedDaily);
    setShowMissions(true);
  }, []);

  const handleSignIn = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch {
      // Popup closed by user
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore sign-out errors
    }
  }, []);

  const dailyMultiplier = getActiveDailyMultiplier(dailyMissions);
  const missionsCompleted = dailyMissions.missions.filter((m) => m.completed).length;
  const missionsTotal = dailyMissions.missions.length;
  const effectivePlayStreak = Math.max(
    getEffectivePlayStreak(playerProgress, dailyMissions.dateKey),
    profile?.cloudStreak ?? 0
  );
  const displayBestScore = Math.max(
    snap.bestScore,
    playerProgress.bestScore,
    profile?.bestScore ?? 0
  );

  return (
    <main className="w-screen h-dvh overflow-hidden bg-[#070b14] flex flex-col items-center justify-center select-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {/* Mobile-first full-screen portrait shell, centered cleanly on desktop */}
      <div className="relative w-full h-full max-w-[460px] flex flex-col bg-[#0f172a] sm:max-h-[min(96dvh,860px)] sm:rounded-2xl sm:border sm:border-slate-800 sm:shadow-2xl overflow-hidden">
        <GameHUD
          score={snap.score}
          bestScore={displayBestScore}
          turn={snap.turn}
          difficultyTier={snap.difficultyTier}
          ballCount={snap.ballCount}
          pendingExtraBalls={snap.pendingExtraBalls}
          shields={snap.shields}
          dailyMultiplier={dailyMultiplier}
          muted={muted}
          onToggleMute={handleToggleMute}
          onRestart={handleRestart}
          onOpenLeaderboard={handleOpenLeaderboard}
        />

        <OfflineIndicator />

        {missionToast && (
          <div
            role="status"
            className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-[90%] px-3.5 py-2 rounded-xl bg-[#0b1120]/95 border border-emerald-500/45 shadow-lg flex items-center gap-2 text-xs whitespace-nowrap"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold text-white truncate">
              {missionToast.title}
            </span>
            <span className="font-mono-num text-emerald-400 font-bold shrink-0">
              +{missionToast.bonusMultiplier.toFixed(2)}× ({missionToast.activeMultiplier.toFixed(2)}×)
            </span>
          </div>
        )}

        {/* Flexible 2D Canvas Stage: always scales to fit screen height & width */}
        <div
          ref={stageRef}
          className="relative flex-1 min-h-0 w-full flex items-center justify-center bg-[#0f172a] overflow-hidden"
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(e) => handlePointerEnd(e, false)}
            onPointerCancel={(e) => handlePointerEnd(e, true)}
            style={{
              width: `${canvasSize.width}px`,
              height: `${canvasSize.height}px`,
            }}
            className="block touch-none-canvas cursor-crosshair"
          />
        </div>

        <GameControls
          phase={snap.phase}
          fastForward={snap.fastForward}
          isAiming={snap.isAiming}
          isAimValid={snap.isAimValid}
          aimAngleDeg={snap.aimAngleDeg}
          bestScore={displayBestScore}
          missionsCompleted={missionsCompleted}
          missionsTotal={missionsTotal}
          dailyMultiplier={dailyMultiplier}
          onToggleFastForward={handleToggleFastForward}
          onRecallBalls={handleRecallBalls}
          onOpenMissions={handleOpenMissions}
        />

        {snap.phase === 'GAME_OVER' && (
          <GameOverModal
            score={snap.score}
            bestScore={displayBestScore}
            turn={snap.turn}
            powerupsCollected={snap.powerupsCollected}
            dailyMultiplier={dailyMultiplier}
            missionsCompleted={missionsCompleted}
            missionsTotal={missionsTotal}
            playStreak={effectivePlayStreak}
            isNewBest={snap.isNewBest}
            cloudSaved={cloudSavedThisRun}
            onPlayAgain={handleRestart}
            onOpenLeaderboard={handleOpenLeaderboard}
            onOpenMissions={handleOpenMissions}
          />
        )}
      </div>

      {showMissions && (
        <MissionsDrawer
          dailyState={dailyMissions}
          playerProgress={playerProgress}
          onClose={() => setShowMissions(false)}
        />
      )}

      {showLeaderboard && (
        <LeaderboardDrawer
          entries={leaderboard}
          profile={profile}
          playerProgress={playerProgress}
          loading={leaderboardLoading}
          error={leaderboardError}
          userEmail={user?.email ?? null}
          userName={user?.displayName ?? null}
          onClose={() => setShowLeaderboard(false)}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      )}
    </main>
  );
}
