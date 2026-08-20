# Hathap.AI - Debate & Collaboration Platform

A modern web application for creating debate rooms ("Courtrooms") where multiple AI agents and AI models collaborate, debate, and reach consensus on complex topics.

## 🎯 Features

### Core Functionality
- **Authentication**: Placeholder authentication system
- **Dashboard**: Overview with statistics and recent courtrooms
- **Models Management**: Connect and manage AI models from multiple providers
- **Agent Templates**: Create reusable AI agent personas with custom prompts
- **Courtroom Creation**: Set up debate rooms with specific objectives
- **Debate Visualization**: Real-time threaded debate discussion
- **Consensus Panel**: Track agreements, disagreements, and recommendations
- **Multiple Debate Modes**: Consensus, Majority Vote, Devil's Advocate, Judge Mode, Open Debate

### Supported Model Providers
- OpenAI (GPT series)
- Anthropic (Claude)
- Google Gemini
- DeepSeek
- Ollama (local)
- Any OpenAI-compatible API

### Agent Types
- Senior Architect
- Security Engineer
- Product Manager
- Startup CTO
- Devil's Advocate
- Performance Expert
- Custom user-defined agents

## 🛠️ Tech Stack

- **Frontend**: React 18.2
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3.4
- **UI Components**: Custom with shadcn/ui patterns
- **Icons**: Lucide React
- **Routing**: React Router v6
- **Build Tool**: Vite 5
- **State Management**: React Context API

## 📁 Project Structure

```
Hathap.ai/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/    # Header, Layout components
│   │   │   └── ui/        # Reusable UI components
│   │   ├── context/       # React Context for state management
│   │   ├── data/          # Mock data
│   │   ├── pages/         # Page components
│   │   ├── types/         # TypeScript type definitions
│   │   ├── utils/         # Helper functions
│   │   ├── App.tsx        # Main app with routing
│   │   ├── main.tsx       # Entry point
│   │   └── index.css      # Global styles
│   ├── package.json       # Frontend dependencies
│   ├── vite.config.ts     # Vite configuration
│   └── tsconfig.json      # TypeScript config
│
└── server/                 # Backend Node.js + Express API
    ├── src/
    │   ├── a2a/           # Agent-to-Agent protocol
    │   ├── engine/        # Debate engine and AI logic
    │   ├── middleware/    # Express middleware
    │   ├── models/        # MongoDB schemas
    │   ├── routes/        # API routes
    │   ├── services/      # Business logic
    │   ├── utils/         # Helper functions
    │   └── index.ts       # Server entry point
    ├── package.json       # Backend dependencies
    └── tsconfig.json      # TypeScript config
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- MongoDB (local or Atlas)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Hathap.ai
```

2. Install frontend dependencies:
```bash
cd client
npm install
```

3. Install backend dependencies:
```bash
cd ../server
npm install
```

4. Configure environment variables:
```bash
# In server directory
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, and encryption secret
```

5. Start the development servers:

**Backend (from server directory):**
```bash
npm run dev
```
Server will run on `http://localhost:4000`

**Frontend (from client directory):**
```bash
npm run dev
```
Frontend will run on `http://localhost:5173`

### Build for Production

**Frontend:**
```bash
cd client
npm run build
```
The optimized build will be in the `client/dist` directory.

**Backend:**
```bash
cd server
npm run build
```
The compiled build will be in the `server/dist` directory.

## 🔑 Key Pages

### Login Page (`/`)
- Simple placeholder authentication
- Demo credentials: use any email and password

### Dashboard (`/dashboard`)
- Overall statistics
- Quick actions
- Recent courtrooms list

### Models Page (`/models`)
- View all connected models
- Add new model integrations
- Edit/delete existing models
- Test API connections

### Agents Page (`/agents`)
- Browse agent templates
- Create custom agents
- Configure system prompts
- Assign models to agents

### Courtrooms Page (`/courtrooms`)
- View all courtrooms
- Filter by status
- Quick actions

### Create Courtroom (`/courtrooms/new`)
- Multi-step form
- Configure debate objective
- Select debate mode
- Add participants

### Courtroom Detail (`/courtrooms/:id`)
- Left sidebar: Participants and rounds
- Center: Debate thread with messages
- Right sidebar: Consensus panel and status
- Start/pause debate controls

## 🎨 Design System

### Color Palette
- **Background**: Gradient from slate-950 to slate-900
- **Primary**: Blue (400-600)
- **Accent**: Cyan (400-500)
- **Text**: Slate (100-400)
- **Success**: Green
- **Warning**: Orange/Yellow
- **Error**: Red

### Design Features
- Dark mode first approach
- Glassmorphism effects
- Smooth transitions and animations
- Responsive design (mobile, tablet, desktop)
- Professional SaaS aesthetic

## 📊 Initial State

This frontend now starts with no models, agents, or courtrooms. Data is persisted per-user via the backend API (MongoDB). When you first sign up, your workspace will be empty so you can connect models and create agents and courtrooms.

## 🔧 Backend API

The backend is a Node.js + Express + TypeScript server located in the `server/` directory. It provides:

- **JWT-based authentication**: Secure user authentication and authorization
- **Per-user CRUD endpoints**: Models, agents, and courtrooms management
- **MongoDB integration**: Data persistence with Mongoose ODM
- **A2A Protocol**: Agent-to-Agent communication support
- **Debate Engine**: Multi-agent debate orchestration with various strategies
- **OpenAI Integration**: LLM-powered agent responses

### API Endpoints:
- `/api/auth/*` - Authentication (login, signup)
- `/api/models/*` - AI model management
- `/api/agents/*` - Agent template CRUD
- `/api/courtrooms/*` - Courtroom and debate management

The backend runs on port `4000` by default (configurable via PORT env variable).  
CORS is enabled for development with the frontend.

## 🔄 State Management

Uses React Context API (`AppContext`) for global state:
- Models list and operations
- Agent templates and operations
- Courtrooms and operations
- Participants management

## 🛣️ Routing

- `/` - Login page
- `/dashboard` - Dashboard
- `/models` - Models management
- `/agents` - Agent templates
- `/courtrooms` - Courtrooms list
- `/courtrooms/new` - Create new courtroom
- `/courtrooms/:id` - Courtroom detail

## 📝 Future Enhancements

- Backend API integration
- Real WebSocket communication
- Actual AI model API calls
- User persistence and authentication
- Export debate transcripts
- Advanced analytics
- Custom debate modes
- Model parameter fine-tuning
- Debate history and analytics
- Team collaboration features

## 📄 License

MIT License - See LICENSE file for details

## 👨‍💻 Development

### Available Scripts

**Frontend (client/):**
```bash
npm run dev       # Start Vite development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

**Backend (server/):**
```bash
npm run dev       # Start development server with hot reload
npm run build     # Compile TypeScript to JavaScript
npm start         # Run compiled production build
```

### Code Quality

- TypeScript strict mode enabled
- ESLint configured
- Responsive design tested
- Cross-browser compatible

### End of Document
