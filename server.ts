import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { startTimerWorker, setEventBroadcaster } from './server/timerWorker';
import authRoutes from './server/routes/auth';
import teamRoutes from './server/routes/teams';
import tournamentRoutes from './server/routes/tournaments';
import matchRoutes from './server/routes/matches';
import adminRoutes from './server/routes/admin';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // SSE Real-time client manager
  const sseClients: Response[] = [];

  // Heartbeat comment event every 20 seconds to keep reverse proxies from terminating idle SSE connections
  setInterval(() => {
    for (let i = sseClients.length - 1; i >= 0; i--) {
      try {
        sseClients[i].write(':keepalive\n\n');
      } catch {
        sseClients.splice(i, 1);
      }
    }
  }, 20000);

  setEventBroadcaster((eventType: string, data: any) => {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (let i = sseClients.length - 1; i >= 0; i--) {
      try {
        sseClients[i].write(payload);
      } catch {
        sseClients.splice(i, 1);
      }
    }
  });

  // Real-time Server-Sent Events Endpoint
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.push(res);

    // Send initial ping
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);

    req.on('close', () => {
      const index = sseClients.indexOf(res);
      if (index !== -1) {
        sseClients.splice(index, 1);
      }
    });
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/teams', teamRoutes);
  app.use('/api/tournaments', tournamentRoutes);
  app.use('/api/matches', matchRoutes);
  app.use('/api/admin', adminRoutes);

  // Start background authoritative timer worker
  startTimerWorker();

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Marathon Tournament Engine running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
