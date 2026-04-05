import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { env } from '../env.js';
import { auth } from './auth.js';
import { botsApi } from './bots.js';
import { channelsApi } from './channels.js';
import { postsApi } from './posts.js';
import { tasksApi } from './tasks.js';
import { aiProvidersApi } from './ai-providers.js';
import { searchProvidersApi } from './search-providers.js';
import { settingsApi } from './settings.js';
import { statsApi } from './stats.js';
import { activityApi } from './activity.js';
import { usersApi } from './users.js';
import { templatesApi } from './templates.js';
import { pollsApi } from './polls.js';

export const api = new Hono();

// Middleware
api.use('*', cors({ origin: env.CORS_ORIGIN, credentials: true }));
api.use('*', logger());

// Health check
api.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
api.route('/api/auth', auth);
api.route('/api/bots', botsApi);
api.route('/api', channelsApi);
api.route('/api/posts', postsApi);
api.route('/api', tasksApi);       // handles /api/channels/:id/tasks, /api/tasks/:id, /api/sources/:id
api.route('/api/ai-providers', aiProvidersApi);
api.route('/api/search-providers', searchProvidersApi);
api.route('/api/settings', settingsApi);
api.route('/api/stats', statsApi);
api.route('/api/activity', activityApi);
api.route('/api/users', usersApi);
api.route('/api/templates', templatesApi);
api.route('/api/polls', pollsApi);

// 404 fallback for API
api.all('/api/*', (c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Serve frontend in production
const clientDir = resolve(process.cwd(), 'dist', 'client');
if (existsSync(clientDir)) {
  api.use('/*', serveStatic({ root: './dist/client' }));
  // SPA fallback: serve index.html for all non-API, non-static routes
  api.get('*', serveStatic({ root: './dist/client', path: 'index.html' }));
}
