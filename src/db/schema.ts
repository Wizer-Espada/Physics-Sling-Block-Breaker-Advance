import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const gameRuns = pgTable('game_runs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  score: integer('score').notNull(),
  turn: integer('turn').notNull(),
  maxBalls: integer('max_balls').notNull(),
  powerupsCollected: integer('powerups_collected').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const soundtracks = pgTable('soundtracks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  prompt: text('prompt').notNull(),
  model: text('model').notNull(),
  mimeType: text('mime_type').notNull(),
  audioDataUrl: text('audio_data_url').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  gameRuns: many(gameRuns),
  soundtracks: many(soundtracks),
}));

export const gameRunsRelations = relations(gameRuns, ({ one }) => ({
  player: one(users, {
    fields: [gameRuns.userId],
    references: [users.id],
  }),
}));

export const soundtracksRelations = relations(soundtracks, ({ one }) => ({
  creator: one(users, {
    fields: [soundtracks.userId],
    references: [users.id],
  }),
}));
