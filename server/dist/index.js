"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const auth_1 = __importDefault(require("./routes/auth"));
const models_1 = __importDefault(require("./routes/models"));
const agents_1 = __importDefault(require("./routes/agents"));
const courtrooms_1 = __importDefault(require("./routes/courtrooms"));
const decisions_1 = __importDefault(require("./routes/decisions"));
const setupA2A_1 = require("./a2a/setupA2A");
const worker_1 = require("./tasks/worker");
dotenv_1.default.config();
if (!process.env.API_KEY_ENCRYPTION_SECRET || process.env.API_KEY_ENCRYPTION_SECRET.length < 32) {
    console.error('FATAL: API_KEY_ENCRYPTION_SECRET must be set in server/.env and be at least 32 characters.');
    process.exit(1);
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hathap';
async function start() {
    await mongoose_1.default.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    // Start the background execution worker once persistence is available. The
    // worker picks up queued/running executions and recovers interrupted ones.
    worker_1.worker.start();
    app.use('/api/auth', auth_1.default);
    app.use('/api/models', models_1.default);
    app.use('/api/agents', agents_1.default);
    app.use('/api/courtrooms', courtrooms_1.default);
    app.use('/api/decisions', decisions_1.default);
    app.get('/api/health', (req, res) => res.json({ ok: true }));
    (0, setupA2A_1.setupA2A)(app);
    const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
    // Graceful shutdown: stop dispatching new work, let in-flight tasks finish up
    // to a timeout, then close the HTTP server.
    const shutdown = async (signal) => {
        console.log(`[Server] received ${signal}, shutting down...`);
        server.close();
        await worker_1.worker.stop();
        await mongoose_1.default.disconnect();
        process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
