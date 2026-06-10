# AI Courtroom - Debate & Collaboration Platform

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
src/
├── components/
│   ├── layout/          # Header, Layout components
│   └── ui/              # Reusable UI components
├── context/             # React Context for state management
├── data/                # Mock data
├── pages/               # Page components
├── types/               # TypeScript type definitions
├── utils/               # Helper functions
├── App.tsx              # Main app with routing
├── main.tsx             # Entry point
└── index.css            # Global styles

```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ai-courtroom
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The optimized build will be in the `dist` directory.

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

## 📊 Mock Data

The application includes comprehensive mock data:
- **5 AI Models** (OpenAI, Anthropic, Google, DeepSeek, Ollama)
- **6 Agent Templates** with unique personalities
- **3 Courtrooms** with different statuses and modes
- **Sample debates** with realistic conversation flow
- **Consensus data** with agreements and recommendations

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

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

### Code Quality

- TypeScript strict mode enabled
- ESLint configured
- Responsive design tested
- Cross-browser compatible

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For support, please open an issue in the repository.

---

**Built with ❤️ for AI collaboration and debate**
