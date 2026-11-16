import 'dotenv/config';
import express from 'express';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import {
  deleteUserSoundtrack,
  getGlobalLeaderboard,
  getUserProfileSummary,
  getUserSoundtracks,
  recordGameRun,
  saveSoundtrackRecord,
} from './src/db/users.ts';
import { optionalAuth, requireAuth, type AuthRequest } from './src/middleware/auth.ts';

const PORT = Number(process.env.PORT) || 3000;

function createGeminiClient(apiVersion: 'v1beta' | 'v1alpha' = 'v1beta') {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    apiVersion,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Public global leaderboard from Cloud SQL
  app.get('/api/leaderboard', async (_req, res) => {
    try {
      const entries = await getGlobalLeaderboard(15);
      res.json({ entries });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to load leaderboard.';
      res.status(500).json({ error: message });
    }
  });

  // Authenticated player profile + saved Lyria soundtracks
  app.get('/api/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email ?? `${uid}@player.local`;
      const displayName = (req.user!.name as string | undefined) ?? null;

      const [profile, tracks] = await Promise.all([
        getUserProfileSummary(uid, email, displayName),
        getUserSoundtracks(uid),
      ]);

      res.json({ profile, tracks });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to load player profile.';
      res.status(500).json({ error: message });
    }
  });

  // Save a completed 3D game run to Cloud SQL
  app.post('/api/runs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const email = req.user!.email ?? `${uid}@player.local`;
      const displayName = (req.user!.name as string | undefined) ?? null;

      const { score, turn, maxBalls, powerupsCollected } = req.body ?? {};
      if (typeof score !== 'number' || typeof turn !== 'number') {
        return res.status(400).json({ error: 'Invalid run payload.' });
      }

      const run = await recordGameRun({
        uid,
        email,
        displayName,
        score,
        turn,
        maxBalls: typeof maxBalls === 'number' ? maxBalls : 1,
        powerupsCollected:
          typeof powerupsCollected === 'number' ? powerupsCollected : 0,
      });

      const [profile, entries] = await Promise.all([
        getUserProfileSummary(uid, email, displayName),
        getGlobalLeaderboard(15),
      ]);

      res.json({ run, profile, entries });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to record game run.';
      res.status(500).json({ error: message });
    }
  });

  // Server-side Lyria music generation (lyria-3-clip-preview / lyria-3-pro-preview)
  app.post('/api/music/generate', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const rawPrompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
      const mode = req.body?.mode === 'pro' ? 'pro' : 'clip';
      const model = mode === 'pro' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';

      if (!rawPrompt) {
        return res.status(400).json({ error: 'Please provide a soundtrack prompt.' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({
          error:
            'GEMINI_API_KEY is not configured. Please add a billing-enabled API key in Settings > Secrets to use Lyria music generation.',
        });
      }

      const ai = createGeminiClient();
      const responseStream = await ai.models.generateContentStream({
        model,
        contents: rawPrompt,
      });

      const audioChunks: Buffer[] = [];
      let notes = '';
      let mimeType = 'audio/mpeg';

      for await (const chunk of responseStream) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (audioChunks.length === 0 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
          }
          if (part.text) {
            notes += part.text;
          }
        }
      }

      if (audioChunks.length === 0) {
        return res.status(502).json({
          error: 'Lyria did not return audio data for this prompt. Please try another description.',
        });
      }

      const audioBase64 = Buffer.concat(audioChunks).toString('base64');
      const audioDataUrl = `data:${mimeType};base64,${audioBase64}`;

      let savedTrack = null;
      if (req.user) {
        const uid = req.user.uid;
        const email = req.user.email ?? `${uid}@player.local`;
        const displayName = (req.user.name as string | undefined) ?? null;
        savedTrack = await saveSoundtrackRecord({
          uid,
          email,
          displayName,
          prompt: rawPrompt,
          model,
          mimeType,
          audioDataUrl,
          notes: notes.trim() || null,
        });
      }

      res.json({
        audioDataUrl,
        mimeType,
        model,
        notes: notes.trim(),
        savedTrack,
      });
    } catch (error: unknown) {
      console.error('Lyria generation failed:', error);
      const rawMsg = error instanceof Error ? error.message : String(error);

      if (
        rawMsg.includes('RESOURCE_EXHAUSTED') ||
        rawMsg.includes('429') ||
        rawMsg.includes('PERMISSION_DENIED') ||
        rawMsg.includes('403') ||
        rawMsg.includes('billing') ||
        rawMsg.includes('API_KEY_INVALID')
      ) {
        return res.status(402).json({
          error:
            'Lyria music generation requires a billing-enabled API key. Select a paid API key in Settings > Secrets to generate tracks.',
        });
      }

      res.status(500).json({
        error: rawMsg || 'Failed to generate soundtrack with Lyria.',
      });
    }
  });

  app.delete('/api/music/tracks/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const trackId = Number(req.params.id);
      if (!Number.isFinite(trackId)) {
        return res.status(400).json({ error: 'Invalid track ID.' });
      }
      const deleted = await deleteUserSoundtrack(req.user!.uid, trackId);
      if (!deleted) {
        return res.status(404).json({ error: 'Track not found.' });
      }
      res.json({ ok: true });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to delete track.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Prism Sling 3D server listening on port ${PORT}`);
  });
}

startServer();
