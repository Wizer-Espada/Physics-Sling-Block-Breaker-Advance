import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { CheckCircle2 } from 'lucide-react';
import { GameControls } from './components/GameControls.tsx';
import { GameHUD } from './components/GameHUD.tsx';
import { GameOverModal } from './components/GameOverModal.tsx';
import { GlobalActivityEntry } from './components/GlobalActivityBar.tsx';
import { HomeScreen } from './components/HomeScreen.tsx';
import { MissionsDrawer } from './components/MissionsDrawer.tsx';
import { OfflineIndicator } from './components/OfflineIndicator.tsx';
import {
  GlobalRankSummary,
  LeaderboardDrawer,
  LeaderboardEntry,
  PlayerProfileSummary,
} from './components/LeaderboardDrawer.tsx';
import {
  AudioChannel,
  AudioVolumeSettings,
  soundEngine,
} from './game/audio.ts';
import {
  claimDailyReward,
  consumeDailyRewardForRun,
  DAILY_REWARD_MULTIPLIER_BOOST,
  DailyRewardState,
  loadDailyReward,
  selectDailyRewardChoice,
} from './game/dailyReward.ts';
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
  recordDailyMissionsHistory,
  recordMissionCompletionDay,
  recordPlayDay,
  SavedActiveRun,
  saveActiveRunSnapshot,
} from './game/progress.ts';
import {
  applyRunMasteryQuestProgress,
  getMasteryQuestBonus,
  loadMasteryQuests,
  loadSelectedDifficulty,
  MasteryQuestsState,
  saveSelectedDifficulty,
} from './game/quests.ts';
import {
  getDefaultGuestCallsign,
  getOrCreateGuestId,
  loadSavedPlayerName,
  savePlayerName,
} from './game/playerIdentity.ts';
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
  DailyRewardChoice,
  DifficultyMode,
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
  difficultyMode: DifficultyMode;
  difficultyTier: number;
  stageSpeedMult: number;
  ballCount: number;
  pendingExtraBalls: number;
  shields: number;
  dailyMultiplier: number;
  trajectoryCombo: number;
  trajectoryComboBump: number;
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
    difficultyMode: state.difficultyMode,
    difficultyTier: state.difficultyTier,
    stageSpeedMult: state.stageSpeedMult,
    ballCount: state.ballCount,
    pendingExtraBalls: state.pendingExtraBalls,
    shields: state.shields,
    dailyMultiplier: state.dailyScoreMultiplier,
    trajectoryCombo: state.trajectoryCombo,
    trajectoryComboBump: state.trajectoryComboBump,
    powerupsCollected: state.powerupsCollected,
    maxBalls: state.maxBalls,
    fastForward: state.fastForward,
    isNewBest: state.isNewBest,
    isAiming: state.aim.isDragging,
    isAimValid: state.aim.isValid,
    aimAngleDeg: Math.round((state.aim.angleRad * 180) / Math.PI),
  };
}

function getCombinedQuestMultiplier(
  daily: DailyMissionsState,
  mastery: MasteryQuestsState
): number {
  return Math.round((getActiveDailyMultiplier(daily) + getMasteryQuestBonus(mastery)) * 100) / 100;
}

export default function App() {
  const [screen, setScreen] = useState<'HOME' | 'PLAYING'>('HOME');
  const [selectedDifficulty, setSelectedDifficulty] = useState<DifficultyMode>(() =>
    loadSelectedDifficulty()
  );

  const [dailyMissions, setDailyMissions] = useState<DailyMissionsState>(() =>
    loadDailyMissions()
  );
  const dailyMissionsRef = useRef<DailyMissionsState>(dailyMissions);

  const [masteryQuests, setMasteryQuests] = useState<MasteryQuestsState>(() =>
    loadMasteryQuests()
  );
  const masteryQuestsRef = useRef<MasteryQuestsState>(masteryQuests);

  const [dailyReward, setDailyReward] = useState<DailyRewardState>(() =>
    loadDailyReward()
  );
  const dailyRewardRef = useRef<DailyRewardState>(dailyReward);

  const [playerProgress, setPlayerProgress] = useState<PlayerProgressState>(() =>
    loadPlayerProgress()
  );
  const playerProgressRef = useRef<PlayerProgressState>(playerProgress);

  const [savedRunSnapshot, setSavedRunSnapshot] = useState<SavedActiveRun | null>(() =>
    loadActiveRunSnapshot()
  );

  const prevMissionMetricsRef = useRef({
    blocksDestroyed: 0,
    powerupsCollected: 0,
    bombsDetonated: 0,
    shieldSaves: 0,
  });
  const missionToastTimerRef = useRef<number | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(
    createInitialGameState(
      getCombinedQuestMultiplier(dailyMissions, masteryQuests),
      selectedDifficulty
    )
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
  const [audioVolumes, setAudioVolumes] = useState<AudioVolumeSettings>(() =>
    soundEngine.getVolumes()
  );
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [leaderboardTab, setLeaderboardTab] = useState<
    'progress' | 'rankings' | 'audio'
  >('progress');
  const [showMissions, setShowMissions] = useState<boolean>(false);
  const [missionToast, setMissionToast] = useState<{
    title: string;
    bonusMultiplier: number;
    activeMultiplier: number;
  } | null>(null);

  // Player identity, Firebase Auth & Cloud SQL Leaderboard state
  const guestIdRef = useRef<string>(getOrCreateGuestId());
  const [customPlayerName, setCustomPlayerName] = useState<string | null>(() =>
    loadSavedPlayerName()
  );
  const [savingPlayerName, setSavingPlayerName] = useState<boolean>(false);
  const [user, setUser] = useState<User | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [topScore, setTopScore] = useState<LeaderboardEntry | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number>(0);
  const [myRank, setMyRank] = useState<GlobalRankSummary | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [globalActivity, setGlobalActivity] = useState<GlobalActivityEntry[]>([]);
  const [globalActivityLoading, setGlobalActivityLoading] = useState<boolean>(false);
  const [globalActivityError, setGlobalActivityError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PlayerProfileSummary | null>(null);
  const [cloudSavedThisRun, setCloudSavedThisRun] = useState<boolean>(false);

  const effectivePlayerName =
    customPlayerName ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    getDefaultGuestCallsign(guestIdRef.current);

  const syncUi = useCallback(() => {
    const st = stateRef.current;
    const prev = prevMissionMetricsRef.current;
    const deltaBlocks = Math.max(0, st.blocksDestroyed - prev.blocksDestroyed);
    const deltaPowerups = Math.max(0, st.powerupsCollected - prev.powerupsCollected);
    const deltaBombs = Math.max(0, st.bombsDetonated - prev.bombsDetonated);
    const deltaShieldSaves = Math.max(0, st.shieldSavesThisRun - prev.shieldSaves);

    prev.blocksDestroyed = st.blocksDestroyed;
    prev.powerupsCollected = st.powerupsCollected;
    prev.bombsDetonated = st.bombsDetonated;
    prev.shieldSaves = st.shieldSavesThisRun;

    const dailyResult = applyRunMissionProgress(
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

    const masteryResult = applyRunMasteryQuestProgress(
      masteryQuestsRef.current,
      {
        blocksDestroyed: deltaBlocks,
        bombsDetonated: deltaBombs,
        shieldSaves: deltaShieldSaves,
      },
      {
        turn: st.hasTakenFirstShot ? st.turn : 0,
        peakChain: st.peakChainThisRun,
        difficultyMode: st.difficultyMode,
      }
    );

    if (dailyResult.changed) {
      dailyMissionsRef.current = dailyResult.nextDaily;
      setDailyMissions(dailyResult.nextDaily);
      const historyUpdate = recordDailyMissionsHistory(
        playerProgressRef.current,
        dailyResult.nextDaily
      );
      if (historyUpdate.changed) {
        playerProgressRef.current = historyUpdate.next;
        setPlayerProgress(historyUpdate.next);
      }
    }
    if (masteryResult.changed) {
      masteryQuestsRef.current = masteryResult.nextQuests;
      setMasteryQuests(masteryResult.nextQuests);
    }

    const baseMult = getCombinedQuestMultiplier(
      dailyMissionsRef.current,
      masteryQuestsRef.current
    );
    const rewardMultBonus =
      st.dailyRewardBonus === 'multiplier_boost'
        ? DAILY_REWARD_MULTIPLIER_BOOST
        : 0;
    const nextMult = Math.round((baseMult + rewardMultBonus) * 100) / 100;
    st.dailyScoreMultiplier = nextMult;

    const latestDaily =
      dailyResult.newlyCompleted[dailyResult.newlyCompleted.length - 1];
    const latestMastery =
      masteryResult.newlyCompleted[masteryResult.newlyCompleted.length - 1];
    const newlyCompletedItem = latestDaily ?? latestMastery;

    if (newlyCompletedItem) {
      if (latestDaily) {
        const streakUpdate = recordMissionCompletionDay(playerProgressRef.current);
        if (streakUpdate.changed) {
          playerProgressRef.current = streakUpdate.next;
          setPlayerProgress(streakUpdate.next);
        }
        const historyAfterCompletion = recordDailyMissionsHistory(
          playerProgressRef.current,
          dailyMissionsRef.current
        );
        if (historyAfterCompletion.changed) {
          playerProgressRef.current = historyAfterCompletion.next;
          setPlayerProgress(historyAfterCompletion.next);
        }
      }

      soundEngine.playMissionComplete();
      hapticsEngine.pickup('multi_ball');
      setMissionToast({
        title: newlyCompletedItem.title,
        bonusMultiplier: newlyCompletedItem.bonusMultiplier,
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

  const fetchLeaderboard = useCallback(async (firebaseUser?: User | null) => {
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const headers: Record<string, string> = {};
      const activeUser = firebaseUser !== undefined ? firebaseUser : auth.currentUser;
      if (activeUser) {
        try {
          const token = await activeUser.getIdToken();
          headers.Authorization = `Bearer ${token}`;
        } catch {
          // Proceed with guestId fallback if token fails
        }
      }
      const query = new URLSearchParams({ guestId: guestIdRef.current });
      const res = await fetch(`/api/leaderboard?${query.toString()}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        setLeaderboardError(data?.error || 'Failed to load leaderboard.');
        return;
      }
      setLeaderboard(data.entries ?? []);
      setTopScore(data.topScore ?? null);
      setTotalPlayers(typeof data.totalPlayers === 'number' ? data.totalPlayers : (data.entries?.length ?? 0));
      setMyRank(data.myRank ?? null);
    } catch {
      setLeaderboardError('Unable to reach leaderboard service.');
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  const fetchGlobalActivity = useCallback(async (firebaseUser?: User | null) => {
    setGlobalActivityLoading(true);
    setGlobalActivityError(null);
    try {
      const headers: Record<string, string> = {};
      const activeUser = firebaseUser !== undefined ? firebaseUser : auth.currentUser;
      if (activeUser) {
        try {
          const token = await activeUser.getIdToken();
          headers.Authorization = `Bearer ${token}`;
        } catch {
          // Proceed with guestId fallback if token fails
        }
      }
      const query = new URLSearchParams({ guestId: guestIdRef.current });
      const res = await fetch(`/api/global-activity?${query.toString()}`, { headers });
      const data = await res.json();
      if (!res.ok) {
        setGlobalActivityError(data?.error || 'Failed to load global activity.');
        return;
      }
      setGlobalActivity(data.entries ?? []);
    } catch {
      setGlobalActivityError('Unable to reach global activity feed.');
    } finally {
      setGlobalActivityLoading(false);
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
    if (screen !== 'PLAYING') return;
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
  }, [screen]);

  // 60fps requestAnimationFrame Physics & Render Loop
  useEffect(() => {
    if (screen !== 'PLAYING') return;
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
  }, [screen, syncUi]);

  // Auth listener & initial leaderboard fetch
  useEffect(() => {
    fetchLeaderboard(null);
    fetchGlobalActivity(null);
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      fetchLeaderboard(nextUser);
      fetchGlobalActivity(nextUser);
      if (nextUser) {
        fetchProfile(nextUser);
      } else {
        setProfile(null);
      }
    });
    return () => unsub();
  }, [fetchLeaderboard, fetchGlobalActivity, fetchProfile]);

  // Poll real-time global activity while on Home screen
  useEffect(() => {
    if (screen !== 'HOME') return;
    fetchGlobalActivity(user);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchGlobalActivity(user);
      }
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [screen, user, fetchGlobalActivity]);

  // Ambient lo-fi synth music during active gameplay (respects global mute setting)
  useEffect(() => {
    if (screen === 'PLAYING' && snap.phase !== 'GAME_OVER') {
      soundEngine.startAmbientMusic();
    } else {
      soundEngine.stopAmbientMusic();
    }
    return () => {
      soundEngine.stopAmbientMusic();
    };
  }, [screen, snap.phase]);

  // Auto-save active run progress and pause/resume ambient audio on tab visibility
  useEffect(() => {
    const saveIfReady = () => {
      saveActiveRunSnapshot(stateRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        saveIfReady();
        soundEngine.pauseAmbientMusic();
      } else {
        soundEngine.resumeAmbientMusicIfActive();
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
      setSavedRunSnapshot(null);
      const st = stateRef.current;
      const nextProgress = recordCompletedRun(playerProgressRef.current, {
        score: st.score,
        turn: st.turn,
        maxBalls: st.maxBalls,
        powerupsCollected: st.powerupsCollected,
        blocksDestroyed: st.blocksDestroyed,
        peakChain: st.peakChainThisRun,
        dailyMultiplier: st.dailyScoreMultiplier,
        difficultyMode: st.difficultyMode,
      });
      playerProgressRef.current = nextProgress;
      setPlayerProgress(nextProgress);
    }

    if (recordedCloudGameOverRef.current || snap.score <= 0) return;

    recordedCloudGameOverRef.current = true;
    (async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (user) {
          const token = await user.getIdToken();
          headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            guestId: guestIdRef.current,
            playerName: effectivePlayerName,
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
        if ('topScore' in data) setTopScore(data.topScore ?? null);
        if (typeof data.totalPlayers === 'number') setTotalPlayers(data.totalPlayers);
        if ('myRank' in data) setMyRank(data.myRank ?? null);
      } catch {
        // Ignore network errors cleanly
      }
    })();
  }, [snap.phase, snap.score, snap.turn, snap.maxBalls, snap.powerupsCollected, user, effectivePlayerName]);

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

  const handleSelectDifficulty = useCallback((mode: DifficultyMode) => {
    setSelectedDifficulty(mode);
    saveSelectedDifficulty(mode);
  }, []);

  const handleSelectDailyRewardChoice = useCallback((choice: DailyRewardChoice) => {
    const next = selectDailyRewardChoice(dailyRewardRef.current, choice);
    dailyRewardRef.current = next;
    setDailyReward(next);
  }, []);

  const handleClaimDailyReward = useCallback(() => {
    soundEngine.unlock();
    const next = claimDailyReward(dailyRewardRef.current);
    dailyRewardRef.current = next;
    setDailyReward(next);
    if (next.selectedReward === 'starter_shield') {
      soundEngine.playShieldGain();
      hapticsEngine.pickup('shield');
    } else {
      soundEngine.playMissionComplete();
      hapticsEngine.pickup('multi_ball');
    }
  }, []);

  const startFreshGame = useCallback(
    (mode: DifficultyMode) => {
      soundEngine.unlock();
      hapticsEngine.cancel();
      clearActiveRunSnapshot();
      setSavedRunSnapshot(null);

      const refreshedDaily = loadDailyMissions();
      dailyMissionsRef.current = refreshedDaily;
      setDailyMissions(refreshedDaily);

      const refreshedMastery = loadMasteryQuests();
      masteryQuestsRef.current = refreshedMastery;
      setMasteryQuests(refreshedMastery);

      const rewardConsumption = consumeDailyRewardForRun(dailyRewardRef.current);
      dailyRewardRef.current = rewardConsumption.next;
      setDailyReward(rewardConsumption.next);

      const activeMult = getCombinedQuestMultiplier(
        refreshedDaily,
        refreshedMastery
      );
      prevMissionMetricsRef.current = {
        blocksDestroyed: 0,
        powerupsCollected: 0,
        bombsDetonated: 0,
        shieldSaves: 0,
      };

      const fresh = createInitialGameState(
        activeMult,
        mode,
        rewardConsumption.granted
      );
      const bestKnown = Math.max(
        fresh.bestScore,
        playerProgressRef.current.bestScore,
        profile?.bestScore ?? 0
      );
      if (bestKnown > fresh.bestScore) {
        fresh.bestScore = bestKnown;
      }
      stateRef.current = fresh;
      setSnap(toSnapshot(fresh));
    },
    [profile?.bestScore]
  );

  const handleStartNewRun = useCallback(() => {
    startFreshGame(selectedDifficulty);
    setScreen('PLAYING');
  }, [selectedDifficulty, startFreshGame]);

  const handleResumeRun = useCallback(() => {
    const snapshot = loadActiveRunSnapshot();
    if (!snapshot) {
      startFreshGame(selectedDifficulty);
      setScreen('PLAYING');
      return;
    }

    soundEngine.unlock();
    hapticsEngine.cancel();

    const refreshedDaily = loadDailyMissions();
    dailyMissionsRef.current = refreshedDaily;
    setDailyMissions(refreshedDaily);

    const refreshedMastery = loadMasteryQuests();
    masteryQuestsRef.current = refreshedMastery;
    setMasteryQuests(refreshedMastery);

    const refreshedReward = loadDailyReward();
    dailyRewardRef.current = refreshedReward;
    setDailyReward(refreshedReward);

    const activeMult = getCombinedQuestMultiplier(refreshedDaily, refreshedMastery);
    prevMissionMetricsRef.current = {
      blocksDestroyed: snapshot.blocksDestroyed,
      powerupsCollected: snapshot.powerupsCollected,
      bombsDetonated: snapshot.bombsDetonated,
      shieldSaves: snapshot.shieldSavesThisRun ?? 0,
    };

    const restored = restoreGameStateFromSnapshot(snapshot, activeMult);
    stateRef.current = restored;
    setSnap(toSnapshot(restored));
    setScreen('PLAYING');
  }, [selectedDifficulty, startFreshGame]);

  const handleGoHome = useCallback(() => {
    hapticsEngine.cancel();
    pointerRef.current = null;
    const st = stateRef.current;
    st.aim.isDragging = false;
    st.aim.isValid = false;
    st.aim.previewPoints = [];

    if (st.phase === 'AIMING' && st.hasTakenFirstShot) {
      saveActiveRunSnapshot(st);
    }
    const refreshedReward = loadDailyReward();
    dailyRewardRef.current = refreshedReward;
    setDailyReward(refreshedReward);
    setSavedRunSnapshot(loadActiveRunSnapshot());
    setScreen('HOME');
  }, []);

  const handleRestart = useCallback(() => {
    startFreshGame(stateRef.current.difficultyMode);
  }, [startFreshGame]);

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

  const handleChangeAudioVolume = useCallback(
    (channel: AudioChannel, value: number) => {
      soundEngine.unlock();
      soundEngine.setChannelVolume(channel, value);
      setAudioVolumes(soundEngine.getVolumes());
    },
    []
  );

  const handleResetAudioVolumes = useCallback(() => {
    soundEngine.unlock();
    const next = soundEngine.resetVolumes();
    setAudioVolumes(next);
  }, []);

  const handleTestSfx = useCallback(() => {
    soundEngine.unlock();
    soundEngine.previewSfx();
  }, []);

  const handleSavePlayerName = useCallback(
    async (rawName: string) => {
      const clean = savePlayerName(rawName);
      if (!clean) return;
      setCustomPlayerName(clean);
      setSavingPlayerName(true);
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (user) {
          const token = await user.getIdToken();
          headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch('/api/player-name', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            guestId: guestIdRef.current,
            playerName: clean,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.entries) setLeaderboard(data.entries);
          if ('topScore' in data) setTopScore(data.topScore ?? null);
          if (typeof data.totalPlayers === 'number') setTotalPlayers(data.totalPlayers);
          if ('myRank' in data) setMyRank(data.myRank ?? null);
        }
      } catch {
        // Keep local callsign saved even if offline
      } finally {
        setSavingPlayerName(false);
      }
    },
    [user]
  );

  const handleOpenLeaderboard = useCallback(
    (initialTab: 'progress' | 'rankings' | 'audio' = 'progress') => {
      const refreshedDaily = loadDailyMissions();
      dailyMissionsRef.current = refreshedDaily;
      setDailyMissions(refreshedDaily);
      const historyUpdate = recordDailyMissionsHistory(
        playerProgressRef.current,
        refreshedDaily
      );
      if (historyUpdate.changed) {
        playerProgressRef.current = historyUpdate.next;
        setPlayerProgress(historyUpdate.next);
      }
      setLeaderboardTab(initialTab);
      fetchLeaderboard(user);
      if (user) fetchProfile(user);
      setShowLeaderboard(true);
    },
    [fetchLeaderboard, fetchProfile, user]
  );

  const handleOpenMissions = useCallback(() => {
    const refreshedDaily = loadDailyMissions();
    dailyMissionsRef.current = refreshedDaily;
    setDailyMissions(refreshedDaily);
    const refreshedMastery = loadMasteryQuests();
    masteryQuestsRef.current = refreshedMastery;
    setMasteryQuests(refreshedMastery);
    const baseMult = getCombinedQuestMultiplier(
      refreshedDaily,
      refreshedMastery
    );
    const rewardBonusMult =
      stateRef.current.dailyRewardBonus === 'multiplier_boost'
        ? DAILY_REWARD_MULTIPLIER_BOOST
        : 0;
    stateRef.current.dailyScoreMultiplier =
      Math.round((baseMult + rewardBonusMult) * 100) / 100;
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

  const totalQuestMultiplier = getCombinedQuestMultiplier(
    dailyMissions,
    masteryQuests
  );
  const missionsCompleted =
    dailyMissions.missions.filter((m) => m.completed).length +
    masteryQuests.quests.filter((q) => q.completed).length;
  const missionsTotal =
    dailyMissions.missions.length + masteryQuests.quests.length;
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
        {screen === 'HOME' ? (
          <>
            <OfflineIndicator />
            <HomeScreen
              selectedDifficulty={selectedDifficulty}
              onSelectDifficulty={handleSelectDifficulty}
              dailyMissions={dailyMissions}
              masteryQuests={masteryQuests}
              dailyReward={dailyReward}
              onSelectDailyRewardChoice={handleSelectDailyRewardChoice}
              onClaimDailyReward={handleClaimDailyReward}
              bestScore={displayBestScore}
              topGlobalScore={topScore}
              globalActivity={globalActivity}
              globalActivityLoading={globalActivityLoading}
              globalActivityError={globalActivityError}
              playStreak={effectivePlayStreak}
              totalMultiplier={totalQuestMultiplier}
              savedRun={savedRunSnapshot}
              muted={muted}
              onToggleMute={handleToggleMute}
              onStartNewRun={handleStartNewRun}
              onResumeRun={handleResumeRun}
              onOpenLeaderboard={() => handleOpenLeaderboard('progress')}
              onOpenTopRankings={() => handleOpenLeaderboard('rankings')}
              onRefreshGlobalActivity={() => fetchGlobalActivity(user)}
            />
          </>
        ) : (
          <>
            <GameHUD
              score={snap.score}
              bestScore={displayBestScore}
              turn={snap.turn}
              difficultyMode={snap.difficultyMode}
              difficultyTier={snap.difficultyTier}
              stageSpeedMult={snap.stageSpeedMult}
              ballCount={snap.ballCount}
              pendingExtraBalls={snap.pendingExtraBalls}
              shields={snap.shields}
              dailyMultiplier={snap.dailyMultiplier}
              trajectoryCombo={snap.trajectoryCombo}
              trajectoryComboBump={snap.trajectoryComboBump}
              muted={muted}
              onGoHome={handleGoHome}
              onToggleMute={handleToggleMute}
              onRestart={handleRestart}
              onOpenLeaderboard={() => handleOpenLeaderboard('progress')}
            />

            <OfflineIndicator />

            {missionToast && (
              <div
                role="status"
                className={`pointer-events-none absolute left-1/2 -translate-x-1/2 z-20 max-w-[90%] px-3.5 py-2 rounded-xl bg-[#0b1120]/95 border border-emerald-500/45 shadow-lg flex items-center gap-2 text-xs whitespace-nowrap transition-[top] duration-150 ${
                  snap.trajectoryCombo >= 2 ? 'top-28' : 'top-16'
                }`}
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
              dailyMultiplier={snap.dailyMultiplier}
              onToggleFastForward={handleToggleFastForward}
              onRecallBalls={handleRecallBalls}
              onOpenMissions={handleOpenMissions}
            />

            {snap.phase === 'GAME_OVER' && (
              <GameOverModal
                score={snap.score}
                bestScore={displayBestScore}
                topGlobalScore={topScore}
                turn={snap.turn}
                difficultyMode={snap.difficultyMode}
                powerupsCollected={snap.powerupsCollected}
                dailyMultiplier={snap.dailyMultiplier}
                missionsCompleted={missionsCompleted}
                missionsTotal={missionsTotal}
                playStreak={effectivePlayStreak}
                isNewBest={snap.isNewBest}
                cloudSaved={cloudSavedThisRun}
                onPlayAgain={handleRestart}
                onGoHome={handleGoHome}
                onOpenLeaderboard={() => handleOpenLeaderboard('rankings')}
                onOpenMissions={handleOpenMissions}
              />
            )}
          </>
        )}
      </div>

      {showMissions && (
        <MissionsDrawer
          dailyState={dailyMissions}
          masteryState={masteryQuests}
          playerProgress={playerProgress}
          audioVolumes={audioVolumes}
          muted={muted}
          onChangeAudioVolume={handleChangeAudioVolume}
          onToggleMute={handleToggleMute}
          onResetAudioVolumes={handleResetAudioVolumes}
          onTestSfx={handleTestSfx}
          onClose={() => setShowMissions(false)}
        />
      )}

      {showLeaderboard && (
        <LeaderboardDrawer
          entries={leaderboard}
          topScore={topScore}
          totalPlayers={totalPlayers}
          myRank={myRank}
          playerName={effectivePlayerName}
          savingPlayerName={savingPlayerName}
          initialTab={leaderboardTab}
          profile={profile}
          playerProgress={playerProgress}
          dailyMissions={dailyMissions}
          loading={leaderboardLoading}
          error={leaderboardError}
          userEmail={user?.email ?? null}
          userName={user?.displayName ?? null}
          audioVolumes={audioVolumes}
          muted={muted}
          onChangeAudioVolume={handleChangeAudioVolume}
          onToggleMute={handleToggleMute}
          onResetAudioVolumes={handleResetAudioVolumes}
          onTestSfx={handleTestSfx}
          onSavePlayerName={handleSavePlayerName}
          onClose={() => setShowLeaderboard(false)}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />
      )}
    </main>
  );
}
