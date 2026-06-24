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
const setupA2A_1 = require("./a2a/setupA2A");
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hathap';
mongoose_1.default
    .connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error', err));
app.use('/api/auth', auth_1.default);
app.use('/api/models', models_1.default);
app.use('/api/agents', agents_1.default);
app.use('/api/courtrooms', courtrooms_1.default);
app.get('/api/health', (req, res) => res.json({ ok: true }));
(0, setupA2A_1.setupA2A)(app);
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
