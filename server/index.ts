import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { userRoutes } from './user-routes';
import dotenv from 'dotenv';

dotenv.config();

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

userRoutes(app);

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

const port = Number(process.env.PORT) || 3000;
console.log(`Server is running on port ${port}`);

serve({
    fetch: app.fetch,
    port
});
