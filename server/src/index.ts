import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';
import modelsRoutes from './routes/models';
import agentsRoutes from './routes/agents';
import courtroomsRoutes from './routes/courtrooms';
import decisionsRoutes from './routes/decisions';
import { setupA2A } from './a2a/setupA2A';
import { worker } from './tasks/worker';

dotenv.config();

if (!process.env.API_KEY_ENCRYPTION_SECRET || process.env.API_KEY_ENCRYPTION_SECRET.length < 32) {
  console.error(
    'FATAL: API_KEY_ENCRYPTION_SECRET must be set in server/.env and be at least 32 characters.'
  );
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hathap';

async function start() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Start the background execution worker once persistence is available. The
  // worker picks up queued/running executions and recovers interrupted ones.
  worker.start();

  app.use('/api/auth', authRoutes);
  app.use('/api/models', modelsRoutes);
  app.use('/api/agents', agentsRoutes);
  app.use('/api/courtrooms', courtroomsRoutes);
  app.use('/api/decisions', decisionsRoutes);

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  setupA2A(app);

  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Graceful shutdown: stop dispatching new work, let in-flight tasks finish up
  // to a timeout, then close the HTTP server.
  const shutdown = async (signal: string) => {
    console.log(`[Server] received ${signal}, shutting down...`);
    server.close();
    await worker.stop();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
