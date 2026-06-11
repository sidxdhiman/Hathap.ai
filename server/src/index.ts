import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth';
import modelsRoutes from './routes/models';
import agentsRoutes from './routes/agents';
import courtroomsRoutes from './routes/courtrooms';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hathap';

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error', err));

app.use('/api/auth', authRoutes);
app.use('/api/models', modelsRoutes);
app.use('/api/agents', agentsRoutes);
app.use('/api/courtrooms', courtroomsRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
