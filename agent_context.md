# Hathap.AI - Agent Context Documentation

## Quick Summary

Hathap.AI is a multi-agent AI debate and collaboration platform that enables users to create virtual "Courtrooms" where multiple AI agents powered by different LLM models can debate, collaborate, and reach consensus on complex topics. The platform supports multiple debate strategies (consensus, majority vote, devil's advocate, judge mode, open debate), integrates with various AI providers (OpenAI, Anthropic, Google Gemini, DeepSeek, Ollama, and OpenAI-compatible APIs), and provides real-time visualization of agent interactions. Built with a React + TypeScript frontend and Node.js + Express + MongoDB backend, it offers JWT-based authentication, per-user workspace management, customizable agent personas with system prompts, and an Agent-to-Agent (A2A) protocol for inter-agent communication. The platform is designed for technical decision-making, brainstorming, architectural reviews, and exploring multiple perspectives on complex problems through structured AI collaboration.

---

# Table of Contents

1. [Project Overview](#1-project-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure](#4-repository-structure)
5. [System Components](#5-system-components)
6. [Data Model](#6-data-model)
7. [API Design](#7-api-design)
8. [Business Rules](#8-business-rules)
9. [User Roles & Permissions](#9-user-roles--permissions)
10. [Application Flow](#10-application-flow)
11. [Configuration](#11-configuration)
12. [Development Guide](#12-development-guide)
13. [Coding Standards](#13-coding-standards)
14. [Design Guidelines](#14-design-guidelines)
15. [Performance Considerations](#15-performance-considerations)
16. [Security](#16-security)
17. [Current Status](#17-current-status)
18. [Known Issues](#18-known-issues)
19. [Future Roadmap](#19-future-roadmap)
20. [Glossary](#20-glossary)
21. [AI Agent Instructions](#21-ai-agent-instructions)
22. [Frequently Asked Questions](#22-frequently-asked-questions)
23. [References](#23-references)

---

# 1. Project Overview

## Goal

Create a collaborative AI platform where multiple AI agents with different perspectives, powered by various LLM providers, can engage in structured debates to solve complex problems, make decisions, and explore multiple viewpoints. The platform aims to harness the power of multi-agent systems to provide more comprehensive, balanced, and well-reasoned outputs than single-agent interactions.

## Problem Being Solved

- **Single-perspective limitation**: Traditional AI interactions provide only one perspective
- **Decision-making complexity**: Complex technical and business decisions benefit from multiple viewpoints
- **Model comparison**: No easy way to compare how different AI models approach the same problem
- **Collaboration barriers**: Difficult to orchestrate structured discussions between multiple AI agents
- **Consensus building**: Challenge in synthesizing multiple AI responses into actionable recommendations

## Target Users

- **Technical Leaders**: CTOs, architects, and engineering managers making technical decisions
- **Product Teams**: Product managers evaluating features and priorities
- **Researchers**: AI researchers studying multi-agent interactions and consensus mechanisms
- **Consultants**: Professional advisors needing diverse perspectives on client problems
- **Developers**: Engineers seeking code reviews and architectural feedback from multiple AI perspectives

## Core Functionality

1. **Model Integration**: Connect and manage AI models from multiple providers with API key encryption
2. **Agent Templates**: Create reusable agent personas with custom system prompts and assigned models
3. **Courtroom Creation**: Set up debate rooms with specific objectives and debate strategies
4. **Multi-Agent Debates**: Execute structured debates with configurable rounds and participation rules
5. **Real-time Visualization**: Watch threaded debate discussions unfold in real-time
6. **Consensus Tracking**: Monitor agreements, disagreements, and track consensus formation
7. **Verdict Generation**: Generate final recommendations based on debate strategy outcomes
8. **A2A Protocol**: Enable agent-to-agent communication and inter-system collaboration
9. **User Workspace**: Per-user isolation with personal models, agents, and courtrooms
10. **Authentication**: Secure JWT-based authentication with encrypted credential storage

---

# 2. High-Level Architecture

## Overall Architecture

Hathap.AI follows a **client-server architecture** with clear separation of concerns:

```
┌─────────────────────────────────────┐
│         React Frontend              │
│   (Vite + TypeScript + Tailwind)   │
│  - UI Components                    │
│  - State Management (Context API)  │
│  - Routing (React Router)          │
└──────────────┬──────────────────────┘
               │ HTTP/REST API
               │ (JWT Authentication)
┌──────────────▼──────────────────────┐
│      Express.js Backend             │
│   (Node.js + TypeScript)           │
│  - REST API Routes                 │
│  - Business Logic                  │
│  - Debate Engine                   │
│  - A2A Protocol Handler            │
└──────────────┬──────────────────────┘
               │ Mongoose ODM
┌──────────────▼──────────────────────┐
│         MongoDB Database            │
│  - Users                           │
│  - Models (encrypted keys)         │
│  - Agents                          │
│  - Courtrooms                      │
│  - Messages                        │
│  - Verdicts                        │
└─────────────────────────────────────┘

External Integrations:
┌─────────────┐  ┌──────────────┐  ┌─────────────┐
│   OpenAI    │  │  Anthropic   │  │ Google AI   │
│     API     │  │     API      │  │     API     │
└─────────────┘  └──────────────┘  └─────────────┘
```

## Data Flow

1. **User Authentication**:
   - User submits credentials → Backend validates → JWT token issued → Token stored in frontend context

2. **Model Configuration**:
   - User adds model with API key → Key encrypted with AES-256-GCM → Stored in MongoDB → Retrieved and decrypted for API calls

3. **Agent Creation**:
   - User defines agent template → Saved with system prompt and model reference → Used in courtroom assignments

4. **Courtroom Debate Flow**:
   ```
   User Creates Courtroom
   ↓
   Selects Agents & Strategy
   ↓
   Starts Debate
   ↓
   Debate Engine Orchestrates:
     ├─ Round 1: Agent A responds
     ├─ Round 1: Agent B responds
     ├─ Round 1: Agent C responds
     ├─ Round 2: Agent A responds to others
     ├─ Round 2: Agent B responds to others
     └─ ... continues per strategy
   ↓
   Strategy Evaluates Consensus
   ↓
   Verdict Generated
   ↓
   Results Displayed to User
   ```

5. **A2A Communication**:
   - External agent → A2A endpoint → Agent card validation → Courtroom service → Internal debate engine

## Request Lifecycle

### Frontend Request:
1. User action triggers API call
2. AuthContext provides JWT token
3. Axios/fetch adds token to Authorization header
4. Request sent to Express backend

### Backend Processing:
1. CORS middleware validates origin
2. Auth middleware validates JWT and extracts user ID
3. Route handler receives request with authenticated user
4. Business logic executes with user-scoped queries
5. Database operations via Mongoose
6. Response sent back to frontend

### Debate Execution:
1. User starts courtroom debate
2. Debate engine initialized with strategy
3. Agent runner fetches agent configurations
4. LLM client decrypts API keys and makes requests
5. Response parser extracts structured outputs
6. Messages stored in database
7. Strategy evaluates round completion
8. Verdict generator synthesizes final output

## Major Modules

1. **Frontend Client** (`client/`)
   - React-based SPA with routing and state management
   - UI components for courtroom visualization and management
   - Context providers for auth, app state, and themes

2. **Backend API** (`server/`)
   - Express REST API with authentication middleware
   - Debate engine for multi-agent orchestration
   - Database models and business logic

3. **Debate Engine** (`server/src/engine/`)
   - Core orchestration of multi-agent debates
   - Strategy implementations (consensus, voting, judge, etc.)
   - LLM integration and response parsing

4. **A2A Protocol** (`server/src/a2a/`)
   - Agent-to-Agent communication protocol
   - External agent integration
   - Agent card management and validation

## External Services

- **MongoDB Atlas/Local**: Primary database for all persistent data
- **OpenAI API**: GPT-3.5, GPT-4, GPT-4o models
- **Anthropic API**: Claude 3 Opus, Sonnet, Haiku
- **Google AI API**: Gemini Pro, Gemini Ultra
- **DeepSeek API**: DeepSeek Chat models
- **Ollama**: Local model hosting (Llama, Mistral, etc.)
- **Custom OpenAI-compatible APIs**: Any API following OpenAI's interface

---

# 3. Technology Stack

## Frontend

- **Framework**: React 18.2 (Functional components with Hooks)
- **Language**: TypeScript 5.3
- **Build Tool**: Vite 5.0
- **Styling**: Tailwind CSS 3.4
- **UI Library**: Custom components with shadcn/ui patterns
- **Icons**: Lucide React
- **Routing**: React Router v6.20
- **State Management**: React Context API
- **HTTP Client**: Fetch API / Axios (context-dependent)
- **Dev Tools**: ESLint, PostCSS, Autoprefixer

## Backend

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.3
- **Framework**: Express.js 4.18
- **Database ODM**: Mongoose 7.5
- **Authentication**: JWT (jsonwebtoken 9.0)
- **Password Hashing**: bcryptjs 2.4
- **CORS**: cors middleware
- **Environment Config**: dotenv
- **Dev Server**: ts-node-dev for hot reload
- **LLM Integration**: OpenAI SDK 4.33
- **A2A Protocol**: @a2a-js/sdk 0.3
- **UUID Generation**: uuid 14.0

## Database

- **Primary Database**: MongoDB 7.0+
- **Schema Management**: Mongoose schemas with TypeScript
- **Hosting Options**: MongoDB Atlas (cloud) or local MongoDB
- **Connection**: Connection string via environment variable

## Authentication

- **Strategy**: JWT (JSON Web Tokens)
- **Token Storage**: LocalStorage/SessionStorage on client
- **Password Security**: bcrypt hashing with salt rounds
- **API Key Encryption**: AES-256-GCM for stored LLM API keys
- **Encryption Library**: Node.js built-in crypto module

## Infrastructure

- **Development**: Local development with hot reload
- **Build**: TypeScript compilation to JavaScript
- **Frontend Serving**: Vite dev server (dev), static files (prod)
- **Backend Serving**: Node.js process with Express
- **Environment Management**: .env files for configuration

## Deployment

- **Frontend**: Can be deployed to Vercel, Netlify, or any static hosting
- **Backend**: Can be deployed to Heroku, Railway, AWS, DigitalOcean, etc.
- **Database**: MongoDB Atlas for managed cloud database
- **Environment Variables**: Managed via hosting platform's env config

## Third-party Services

- **AI Model Providers**: OpenAI, Anthropic, Google AI, DeepSeek, custom APIs
- **Local AI**: Ollama for local model hosting
- **A2A Network**: Inter-agent communication protocol

---

# 4. Repository Structure

```
Hathap.ai/
├── client/                          # Frontend React application
│   ├── src/
│   │   ├── components/              # React components
│   │   │   ├── layout/             # Layout components (Header, Layout)
│   │   │   └── ui/                 # Reusable UI components (Button, Card, Input, Modal, etc.)
│   │   ├── context/                 # React Context providers
│   │   │   ├── AppContext.tsx      # Global app state (models, agents, courtrooms)
│   │   │   ├── AuthContext.tsx     # Authentication state and functions
│   │   │   └── ThemeContext.tsx    # Theme management (light/dark mode)
│   │   ├── data/                    # Static data and mock data
│   │   ├── pages/                   # Page-level components
│   │   │   ├── LoginPage.tsx       # Login page
│   │   │   ├── SignupPage.tsx      # Signup page
│   │   │   ├── LandingPage.tsx     # Marketing landing page
│   │   │   ├── DashboardPage.tsx   # Main dashboard
│   │   │   ├── ModelsPage.tsx      # Model management
│   │   │   ├── AgentsPage.tsx      # Agent templates
│   │   │   ├── CourtroomsPage.tsx  # Courtrooms list
│   │   │   ├── CreateCourtroomPage.tsx    # Courtroom creation wizard
│   │   │   ├── CourtroomDetailPage.tsx    # Debate view
│   │   │   ├── OnboardingPage.tsx  # User onboarding
│   │   │   └── ProfilePage.tsx     # User profile
│   │   ├── types/                   # TypeScript type definitions
│   │   ├── utils/                   # Utility functions and helpers
│   │   ├── App.tsx                  # Main app component with routing
│   │   ├── main.tsx                 # Application entry point
│   │   └── index.css                # Global styles and Tailwind imports
│   ├── dist/                        # Build output (git-ignored)
│   ├── node_modules/                # Dependencies (git-ignored)
│   ├── .env.development             # Development environment variables
│   ├── .eslintrc.cjs                # ESLint configuration
│   ├── index.html                   # HTML entry point
│   ├── package.json                 # Frontend dependencies and scripts
│   ├── postcss.config.js            # PostCSS configuration
│   ├── tailwind.config.ts           # Tailwind CSS configuration
│   ├── tsconfig.json                # TypeScript configuration
│   ├── tsconfig.node.json           # TypeScript Node configuration
│   └── vite.config.ts               # Vite build configuration
│
├── server/                          # Backend Node.js + Express API
│   ├── src/
│   │   ├── a2a/                     # Agent-to-Agent protocol implementation
│   │   │   ├── agentCard.ts        # Agent card management
│   │   │   ├── courtroomService.ts # Courtroom service for A2A
│   │   │   ├── debateExecutor.ts   # Execute debates via A2A
│   │   │   ├── messageParser.ts    # Parse A2A messages
│   │   │   ├── setupA2A.ts         # A2A protocol setup
│   │   │   ├── types.ts            # A2A type definitions
│   │   │   └── userBuilder.ts      # User context builder
│   │   ├── engine/                  # Debate engine core
│   │   │   ├── agentRunner.ts      # Execute individual agent turns
│   │   │   ├── debateEngine.ts     # Main debate orchestration
│   │   │   ├── llmClient.ts        # LLM API client abstraction
│   │   │   ├── responseParser.ts   # Parse LLM responses
│   │   │   ├── types.ts            # Engine type definitions
│   │   │   ├── verdictGenerator.ts # Generate final verdicts
│   │   │   └── strategies/         # Debate strategies
│   │   │       ├── consensus.ts    # Consensus-building strategy
│   │   │       ├── devilsAdvocate.ts   # Devil's advocate strategy
│   │   │       ├── judge.ts        # Judge-moderated strategy
│   │   │       ├── majorityVote.ts # Voting-based strategy
│   │   │       └── openDebate.ts   # Open discussion strategy
│   │   ├── middleware/              # Express middleware
│   │   │   └── authMiddleware.ts   # JWT authentication middleware
│   │   ├── models/                  # Mongoose schemas
│   │   │   ├── Agent.ts            # Agent template schema
│   │   │   ├── Courtroom.ts        # Courtroom schema
│   │   │   ├── Message.ts          # Debate message schema
│   │   │   ├── Model.ts            # LLM model schema
│   │   │   ├── User.ts             # User schema
│   │   │   └── Verdict.ts          # Verdict schema
│   │   ├── routes/                  # API route definitions
│   │   │   ├── agents.ts           # Agent CRUD endpoints
│   │   │   ├── auth.ts             # Authentication endpoints
│   │   │   ├── courtrooms.ts       # Courtroom CRUD and debate endpoints
│   │   │   └── models.ts           # Model CRUD endpoints
│   │   ├── services/                # Business logic services
│   │   │   ├── debateValidation.ts # Validate debate configurations
│   │   │   └── modelService.ts     # Model-related business logic
│   │   ├── utils/                   # Utility functions
│   │   │   ├── defaultAgents.ts    # Default agent templates
│   │   │   ├── encryption.ts       # API key encryption/decryption
│   │   │   └── modelSerializer.ts  # Model data serialization
│   │   └── index.ts                 # Server entry point
│   ├── dist/                        # Compiled output (git-ignored)
│   ├── node_modules/                # Dependencies (git-ignored)
│   ├── .env                         # Production environment (git-ignored)
│   ├── .env.example                 # Example environment variables
│   ├── package.json                 # Backend dependencies and scripts
│   └── tsconfig.json                # TypeScript configuration
│
├── .git/                            # Git repository data
├── .github/                         # GitHub-specific files
│   └── copilot-instructions.md     # GitHub Copilot instructions
├── .gitignore                       # Git ignore patterns
├── install.bat                      # Windows installation script
├── README.md                        # Project documentation
└── agent_context.md                 # This file - comprehensive AI agent context
```

---

# 5. System Components

## Frontend Client (client/)

**Purpose**: Provide an intuitive web interface for users to manage models, create agents, orchestrate debates, and visualize multi-agent conversations.

**Responsibilities**:
- User authentication and session management
- CRUD operations for models, agents, and courtrooms
- Real-time debate visualization with threaded messages
- Responsive UI with dark-mode-first design
- Client-side validation and error handling
- Routing and navigation

**Dependencies**:
- React 18.2, React Router v6
- Tailwind CSS for styling
- Lucide React for icons
- Backend API for all data operations

**Important Files**:
- `src/App.tsx` - Main routing and app structure
- `src/context/AppContext.tsx` - Global state management
- `src/context/AuthContext.tsx` - Authentication state
- `src/pages/CourtroomDetailPage.tsx` - Debate visualization

**Interactions**: Communicates with backend via REST API using JWT authentication in Authorization headers.

## Backend API (server/)

**Purpose**: Provide RESTful API endpoints for data management, authentication, and debate orchestration.

**Responsibilities**:
- User authentication and authorization (JWT)
- CRUD operations for all entities
- Input validation and sanitization
- Database operations via Mongoose
- API key encryption and secure storage
- CORS handling for frontend

**Dependencies**:
- Express.js, Mongoose, bcryptjs, jsonwebtoken
- MongoDB database connection

**Important Files**:
- `src/index.ts` - Server initialization
- `src/middleware/authMiddleware.ts` - Auth protection
- `src/routes/*.ts` - API endpoint definitions
- `src/models/*.ts` - Database schemas

**Interactions**: Receives requests from frontend, queries MongoDB, calls debate engine for execution.

## Debate Engine (server/src/engine/)

**Purpose**: Orchestrate multi-agent debates with configurable strategies and generate consensus verdicts.

**Responsibilities**:
- Execute debate rounds based on selected strategy
- Manage agent turn-taking and conversation flow
- Interface with LLM providers via unified client
- Parse and structure agent responses
- Track consensus, agreements, and disagreements
- Generate final verdicts with recommendations

**Dependencies**:
- LLM provider SDKs (OpenAI, etc.)
- Mongoose models for storage
- Encryption utils for API key handling

**Important Files**:
- `debateEngine.ts` - Main orchestration logic
- `agentRunner.ts` - Individual agent execution
- `llmClient.ts` - LLM provider abstraction
- `strategies/*.ts` - Debate strategy implementations
- `verdictGenerator.ts` - Verdict synthesis

**Interactions**: Called by courtroom routes, uses LLM APIs, stores messages and verdicts in database.

## A2A Protocol Handler (server/src/a2a/)

**Purpose**: Implement Agent-to-Agent communication protocol for external agent integration.

**Responsibilities**:
- Expose A2A-compliant endpoints
- Manage agent cards and capabilities
- Parse incoming A2A messages
- Route external agent requests to internal debate engine
- Build user context from A2A requests
- Handle courtroom service operations

**Dependencies**:
- @a2a-js/sdk for protocol implementation
- Express for HTTP endpoints
- Debate engine for execution

**Important Files**:
- `setupA2A.ts` - Protocol initialization
- `agentCard.ts` - Agent capability definitions
- `courtroomService.ts` - Service handler
- `debateExecutor.ts` - Execute A2A-initiated debates
- `messageParser.ts` - Parse A2A message formats

**Interactions**: Receives requests from external A2A clients, translates to internal debate operations.

## Authentication System

**Purpose**: Secure user accounts and API access with JWT-based authentication.

**Responsibilities**:
- User registration with password hashing
- Login with credential validation
- JWT token generation and validation
- Password strength requirements
- Token expiration and refresh (if implemented)

**Dependencies**:
- bcryptjs for hashing
- jsonwebtoken for JWT operations
- User model for storage

**Important Files**:
- `routes/auth.ts` - Auth endpoints
- `middleware/authMiddleware.ts` - JWT validation
- `models/User.ts` - User schema

**Interactions**: Generates tokens for frontend, validates tokens on protected routes.

---

# 6. Data Model

## Database: MongoDB

### Collections/Tables

#### Users
- `_id`: ObjectId (primary key)
- `email`: String (unique, required)
- `password`: String (hashed with bcrypt)
- `name`: String (optional)
- `createdAt`: Date
- `updatedAt`: Date

**Relationships**: One-to-many with Models, Agents, Courtrooms

#### Models
- `_id`: ObjectId
- `userId`: ObjectId (ref: User)
- `name`: String (e.g., "GPT-4")
- `provider`: String (openai, anthropic, google, deepseek, ollama, custom)
- `modelId`: String (e.g., "gpt-4-turbo")
- `apiKey`: String (encrypted with AES-256-GCM)
- `baseUrl`: String (optional, for custom providers)
- `parameters`: Object (temperature, max_tokens, etc.)
- `isActive`: Boolean
- `createdAt`: Date
- `updatedAt`: Date

**Relationships**: Belongs to User, referenced by Agents

#### Agents
- `_id`: ObjectId
- `userId`: ObjectId (ref: User)
- `name`: String (e.g., "Senior Architect")
- `role`: String (description of agent's perspective)
- `systemPrompt`: String (instructions for LLM)
- `modelId`: ObjectId (ref: Model)
- `personality`: Object (traits and behavior settings)
- `isTemplate`: Boolean (true for default templates)
- `createdAt`: Date
- `updatedAt`: Date

**Relationships**: Belongs to User and Model, used in Courtrooms

#### Courtrooms
- `_id`: ObjectId
- `userId`: ObjectId (ref: User)
- `name`: String
- `objective`: String (debate topic/question)
- `strategy`: String (consensus, majority_vote, devils_advocate, judge, open_debate)
- `status`: String (draft, active, paused, completed)
- `participants`: Array of ObjectId (ref: Agent)
- `currentRound`: Number
- `maxRounds`: Number
- `settings`: Object (turn order, timeout, etc.)
- `createdAt`: Date
- `updatedAt`: Date
- `completedAt`: Date (optional)

**Relationships**: Belongs to User, references Agents, has many Messages and Verdicts

#### Messages
- `_id`: ObjectId
- `courtroomId`: ObjectId (ref: Courtroom)
- `agentId`: ObjectId (ref: Agent)
- `round`: Number
- `content`: String (agent's response)
- `role`: String (assistant, user, system)
- `metadata`: Object (tokens used, latency, etc.)
- `parentMessageId`: ObjectId (optional, for threading)
- `createdAt`: Date

**Relationships**: Belongs to Courtroom and Agent

#### Verdicts
- `_id`: ObjectId
- `courtroomId`: ObjectId (ref: Courtroom)
- `summary`: String
- `agreements`: Array of String
- `disagreements`: Array of String
- `recommendations`: Array of String
- `consensusLevel`: Number (0-100%)
- `generatedBy`: String (strategy name)
- `createdAt`: Date

**Relationships**: Belongs to Courtroom

## Important Fields

- **Encrypted Fields**: `Model.apiKey` (never expose decrypted keys to frontend)
- **Required Fields**: All user IDs, email, passwords, model configurations
- **Unique Constraints**: User email
- **Indexed Fields**: userId (on all user-owned collections), courtroomId (on messages)

## Validation Rules

- Email must be valid format
- Password minimum 6 characters (consider increasing)
- Model provider must be from allowed list
- Agent systemPrompt cannot be empty
- Courtroom must have at least 2 participants
- Strategy must be valid enum value
- API keys must be encrypted before storage
- All user operations must be scoped to authenticated user

---

# 7. API Design

## Base URL
- Development: `http://localhost:4000/api`
- Production: `https://your-domain.com/api`

## Authentication

All protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Authentication (`/api/auth`)

#### POST `/api/auth/signup`
Register new user
- **Body**: `{ email: string, password: string, name?: string }`
- **Response**: `{ token: string, user: { id, email, name } }`
- **Errors**: 400 (validation), 409 (email exists)

#### POST `/api/auth/login`
Authenticate user
- **Body**: `{ email: string, password: string }`
- **Response**: `{ token: string, user: { id, email, name } }`
- **Errors**: 401 (invalid credentials)

### Models (`/api/models`) [Protected]

#### GET `/api/models`
List all user's models
- **Response**: `{ models: Model[] }`
- **Note**: API keys returned encrypted or omitted

#### POST `/api/models`
Create new model
- **Body**: `{ name, provider, modelId, apiKey, baseUrl?, parameters? }`
- **Response**: `{ model: Model }`
- **Note**: API key encrypted before storage

#### PUT `/api/models/:id`
Update model
- **Body**: Partial model data
- **Response**: `{ model: Model }`

#### DELETE `/api/models/:id`
Delete model
- **Response**: `{ success: true }`

### Agents (`/api/agents`) [Protected]

#### GET `/api/agents`
List all user's agents
- **Response**: `{ agents: Agent[] }`

#### POST `/api/agents`
Create agent
- **Body**: `{ name, role, systemPrompt, modelId, personality? }`
- **Response**: `{ agent: Agent }`

#### PUT `/api/agents/:id`
Update agent
- **Body**: Partial agent data
- **Response**: `{ agent: Agent }`

#### DELETE `/api/agents/:id`
Delete agent
- **Response**: `{ success: true }`

### Courtrooms (`/api/courtrooms`) [Protected]

#### GET `/api/courtrooms`
List all user's courtrooms
- **Query**: `?status=active` (optional filter)
- **Response**: `{ courtrooms: Courtroom[] }`

#### GET `/api/courtrooms/:id`
Get courtroom details with messages
- **Response**: `{ courtroom: Courtroom, messages: Message[], verdict?: Verdict }`

#### POST `/api/courtrooms`
Create courtroom
- **Body**: `{ name, objective, strategy, participants: agentIds[], maxRounds?, settings? }`
- **Response**: `{ courtroom: Courtroom }`

#### PUT `/api/courtrooms/:id`
Update courtroom
- **Body**: Partial courtroom data
- **Response**: `{ courtroom: Courtroom }`

#### POST `/api/courtrooms/:id/start`
Start debate
- **Response**: `{ courtroom: Courtroom, messages: Message[] }`
- **Note**: Async debate execution begins

#### POST `/api/courtrooms/:id/pause`
Pause active debate
- **Response**: `{ courtroom: Courtroom }`

#### DELETE `/api/courtrooms/:id`
Delete courtroom
- **Response**: `{ success: true }`

## Request Format

- **Content-Type**: `application/json`
- **Authentication**: JWT in Authorization header (except auth endpoints)
- **Body**: JSON payload matching endpoint schema

## Response Format

Success responses:
```json
{
  "data": { /* response data */ },
  "success": true
}
```

Error responses:
```json
{
  "error": "Error message",
  "success": false,
  "code": "ERROR_CODE"
}
```

## Error Handling

- **400 Bad Request**: Invalid input data
- **401 Unauthorized**: Missing or invalid JWT token
- **403 Forbidden**: User doesn't own resource
- **404 Not Found**: Resource doesn't exist
- **409 Conflict**: Duplicate resource (e.g., email)
- **500 Internal Server Error**: Server-side error

## Versioning

Currently no API versioning. Future versions should use URL versioning (`/api/v2/...`)

---

# 8. Business Rules

## Critical Business Logic

### API Key Encryption
- **Rule**: All LLM provider API keys MUST be encrypted using AES-256-GCM before storage
- **Implementation**: `server/src/utils/encryption.ts`
- **Key Source**: `API_KEY_ENCRYPTION_SECRET` environment variable (min 32 characters)
- **Never**: Store or transmit API keys in plaintext
- **Never**: Return decrypted keys to frontend

### User Data Isolation
- **Rule**: Users can ONLY access their own data (models, agents, courtrooms)
- **Implementation**: All queries filtered by `userId` from JWT
- **Enforcement**: Auth middleware extracts user ID, all routes use it in queries
- **Never**: Allow cross-user data access

### Debate Strategy Rules
Each strategy has specific termination and verdict logic:

#### Consensus Strategy
- Minimum 2 rounds required
- Terminates when agents reach agreement or max rounds exceeded
- Consensus calculated based on agreement indicators in responses

#### Majority Vote Strategy
- Each agent votes on options
- Verdict based on majority (>50%)
- Ties result in "no consensus" verdict

#### Devil's Advocate Strategy
- One agent takes opposing view
- Forces critical analysis
- Verdict synthesizes both perspectives

#### Judge Strategy
- One agent acts as moderator/judge
- Judge makes final decision after hearing arguments
- Judge agent must be explicitly designated

#### Open Debate Strategy
- Freeform discussion
- No specific termination criteria except max rounds
- Verdict summarizes key points

### Agent Assignment Rules
- Minimum 2 agents required per courtroom
- Maximum recommended: 10 agents (performance consideration)
- Each agent must have valid, active model with decryptable API key
- Agent's model must be owned by same user

### Round Execution Rules
- Agents take turns in configured order
- Each agent sees previous messages in conversation
- Round increments after all agents respond once
- Debate terminates at max rounds or strategy-specific condition

### Model Integration Rules
- API keys validated on first use (optional test endpoint)
- Failed API calls logged but don't crash debate
- Fallback strategies when model unavailable (skip turn, use default response, pause)
- Rate limiting respected per provider's guidelines

### Message Storage Rules
- All agent responses stored as messages
- Messages include metadata: tokens used, response time, model used
- Messages maintain parent-child relationships for threading
- User can view full message history

### Verdict Generation Rules
- Verdict generated only for completed courtrooms
- Verdict synthesizes all agent responses
- Verdict identifies consensus areas and disagreements
- Recommendations extracted from agent suggestions

---

# 9. User Roles & Permissions

## Role Hierarchy

Currently single-role system: **Authenticated User**

Future considerations:
- Admin (platform management)
- Team Owner (team workspace management)
- Team Member (shared resources)
- Guest (read-only access)

## Permissions

### Authenticated User Can:
- Create, read, update, delete own models
- Create, read, update, delete own agents
- Create, read, update, delete own courtrooms
- Start and pause own debates
- View own debate history and verdicts
- Update own profile and credentials

### Authenticated User Cannot:
- Access other users' data
- View platform-wide statistics (unless admin)
- Bypass API rate limits
- Access unencrypted API keys
- Execute server-side code
- Access admin endpoints

## Access Control Implementation

- **Authentication**: JWT token validation via middleware
- **Authorization**: User ID extracted from JWT, used in all database queries
- **Resource Ownership**: All queries filtered by `userId`
- **Token Expiration**: Configurable (default: 7 days)
- **Password Requirements**: Minimum 6 characters (recommended: 12+ with complexity rules)

## Restrictions

- No cross-user collaboration (yet)
- No public courtrooms or shared templates (yet)
- No role-based access control within teams (yet)
- No API rate limiting per user (consider adding)
- No resource quotas (unlimited models, agents, courtrooms)

---

# 10. Application Flow

## User Journeys

### First-Time User Journey
1. Land on landing page (`/`)
2. Click "Get Started" or "Sign Up"
3. Fill signup form with email and password
4. Redirected to onboarding page (`/onboarding`)
5. Guided through:
   - Connect first AI model (with API key)
   - Create or select first agent
   - Optional: Start first courtroom
6. Arrive at dashboard

### Returning User Journey
1. Navigate to `/login`
2. Enter credentials
3. JWT token issued and stored
4. Redirected to dashboard
5. See overview of models, agents, recent courtrooms
6. Navigate to desired section

### Creating a Debate
1. Navigate to Courtrooms page
2. Click "New Courtroom"
3. Multi-step wizard:
   - **Step 1**: Enter name and objective
   - **Step 2**: Select debate strategy
   - **Step 3**: Choose participating agents
   - **Step 4**: Configure settings (rounds, etc.)
   - **Step 5**: Review and create
4. Courtroom created in "draft" status
5. User clicks "Start Debate"
6. Status changes to "active"
7. Backend begins executing debate rounds
8. User watches messages appear in real-time
9. Debate completes, verdict generated
10. Status changes to "completed"

### Managing Models
1. Navigate to Models page
2. Click "Add Model"
3. Select provider (OpenAI, Anthropic, etc.)
4. Enter model details and API key
5. Click "Test Connection" (optional)
6. Save model
7. Model available for agent assignment

### Creating Agents
1. Navigate to Agents page
2. Click "Create Agent" or use template
3. Enter agent name and role
4. Write system prompt (instructions for LLM)
5. Select assigned model
6. Save agent
7. Agent available for courtroom participation

## Authentication Flow

```
User -> Login Form -> POST /api/auth/login
                         ↓
                    Validate Credentials
                         ↓
                   Generate JWT Token
                         ↓
                    Return Token + User Data
                         ↓
Frontend stores token in AuthContext/localStorage
                         ↓
All subsequent requests include:
Authorization: Bearer <token>
                         ↓
Auth Middleware validates token
                         ↓
Extract user ID from token payload
                         ↓
Pass to route handler as req.userId
```

## Main Workflows

### Debate Execution Workflow
```
User clicks "Start Debate"
  ↓
POST /api/courtrooms/:id/start
  ↓
Debate Engine Initialized
  ↓
FOR each round (1 to maxRounds):
  ↓
  FOR each agent in participants:
    ↓
    Fetch agent config & model
    ↓
    Decrypt API key
    ↓
    Build conversation context (previous messages)
    ↓
    Call LLM API with system prompt + context
    ↓
    Parse response
    ↓
    Store message in database
    ↓
    Emit progress update (if WebSocket implemented)
  ↓
  Check strategy termination condition
  ↓
  IF condition met: break loop
↓
Generate Verdict
  ↓
  Synthesize agreements, disagreements, recommendations
  ↓
  Store verdict in database
  ↓
  Update courtroom status to "completed"
  ↓
Return verdict to user
```

## Background Jobs

Currently not implemented, but considerations:
- Debate execution could be async job (Celery, Bull, etc.)
- Periodic cleanup of old messages
- API key validation checks
- Usage statistics aggregation
- Email notifications for completed debates

## Cron Jobs

None currently implemented. Future possibilities:
- Daily database backups
- Weekly usage reports
- Expired token cleanup
- Model availability checks

## Queues

Not currently implemented. Debate execution is synchronous.
Future: Use message queue (Redis, RabbitMQ) for:
- Async debate execution
- Rate-limited LLM API calls
- Email sending
- Webhook deliveries

---

# 11. Configuration

## Environment Variables

### Backend (server/.env)

```bash
# Required
MONGODB_URI=mongodb://localhost:27017/hathap
# Or MongoDB Atlas: mongodb+srv://user:pass@cluster.mongodb.net/hathap

JWT_SECRET=your-secret-key-here-make-it-long-and-random
# Used for signing JWT tokens

API_KEY_ENCRYPTION_SECRET=your-32plus-character-encryption-secret-here
# MUST be at least 32 characters for AES-256-GCM

# Optional
PORT=4000
# Server port, defaults to 4000

NODE_ENV=development
# Environment: development, production

# A2A Protocol (Optional)
A2A_BASE_URL=http://localhost:4000
A2A_API_KEY=optional-service-api-key
A2A_DEFAULT_USER_ID=optional-mongodb-user-id-for-a2a-requests
```

### Frontend (client/.env.development)

```bash
VITE_API_URL=http://localhost:4000/api
# Backend API base URL

VITE_APP_NAME=Hathap.AI
# Application name for display

# Add other frontend-specific vars as needed
```

## Feature Flags

Not currently implemented. Consider adding:
- `ENABLE_A2A_PROTOCOL`: Toggle A2A endpoints
- `ENABLE_SIGNUP`: Allow new user registration
- `MAX_AGENTS_PER_USER`: Limit resources
- `MAX_COURTROOMS_PER_USER`: Resource quotas
- `ENABLE_EMAIL_NOTIFICATIONS`: Email feature

## Secrets Management

### Development
- Use `.env` files (git-ignored)
- Never commit secrets to repository
- Share `.env.example` with placeholder values

### Production
- Use hosting platform's environment variable management
- Heroku: Config Vars
- AWS: Parameter Store or Secrets Manager
- Vercel/Netlify: Environment Variables in dashboard
- Docker: Environment variables or secrets

## Configuration Files

### Frontend
- `client/vite.config.ts` - Vite build configuration
- `client/tailwind.config.ts` - Tailwind CSS customization
- `client/tsconfig.json` - TypeScript compiler options
- `client/.eslintrc.cjs` - ESLint rules
- `client/postcss.config.js` - PostCSS plugins

### Backend
- `server/tsconfig.json` - TypeScript compiler options
- No explicit config files for Express (configured in code)

## Important Configuration Notes

1. **API_KEY_ENCRYPTION_SECRET**: MUST be consistent across deployments or stored keys become unreadable
2. **JWT_SECRET**: Changing this invalidates all existing tokens
3. **MONGODB_URI**: Use connection pooling for production (handled by Mongoose)
4. **CORS Origins**: Update in `server/src/index.ts` for production domains

---

# 12. Development Guide

## Setup

### Prerequisites
- Node.js 18+ and npm
- MongoDB (local installation or Atlas account)
- Git

### Installation Steps

1. **Clone repository**
```bash
git clone <repository-url>
cd Hathap.ai
```

2. **Install backend dependencies**
```bash
cd server
npm install
```

3. **Configure backend environment**
```bash
cp .env.example .env
# Edit .env with your values:
# - MONGODB_URI (local or Atlas)
# - JWT_SECRET (random string)
# - API_KEY_ENCRYPTION_SECRET (32+ character random string)
```

4. **Install frontend dependencies**
```bash
cd ../client
npm install
```

5. **Configure frontend environment** (optional)
```bash
# Create .env.development if needed
echo "VITE_API_URL=http://localhost:4000/api" > .env.development
```

## Running Locally

### Start Backend Server
```bash
cd server
npm run dev
```
Server runs on `http://localhost:4000` with hot reload.

### Start Frontend Dev Server
```bash
cd client
npm run dev
```
Frontend runs on `http://localhost:5173` with hot reload.

### Access Application
Open browser to `http://localhost:5173`

## Building

### Build Frontend for Production
```bash
cd client
npm run build
```
Output in `client/dist/`

### Build Backend for Production
```bash
cd server
npm run build
```
Output in `server/dist/`

### Run Production Build
```bash
cd server
npm start
```

## Testing

Currently no test suite implemented. Recommended additions:
- Jest for unit tests
- React Testing Library for component tests
- Supertest for API endpoint tests
- Playwright or Cypress for E2E tests

## Linting

### Frontend
```bash
cd client
npm run lint
```

Linting rules in `.eslintrc.cjs`:
- TypeScript ESLint
- React-specific rules
- Max warnings: 0

### Backend
No ESLint configured for backend yet. Recommended to add.

## Formatting

Not configured. Recommended to add Prettier:
```bash
npm install --save-dev prettier
```

## Deployment

### Frontend Deployment (Static Hosting)

**Vercel:**
1. Connect GitHub repository
2. Set build command: `npm run build`
3. Set output directory: `dist`
4. Add environment variables in dashboard
5. Deploy

**Netlify:** Similar process to Vercel

**AWS S3 + CloudFront:**
1. Build locally: `npm run build`
2. Upload `dist/` to S3 bucket
3. Configure S3 for static website hosting
4. Add CloudFront distribution for HTTPS

### Backend Deployment (Node.js Hosting)

**Heroku:**
```bash
# In server directory
heroku create your-app-name
heroku addons:create mongolab:sandbox
heroku config:set JWT_SECRET=your-secret
heroku config:set API_KEY_ENCRYPTION_SECRET=your-encryption-secret
git push heroku main
```

**Railway:**
1. Connect GitHub repository
2. Select server directory as root
3. Add environment variables
4. Railway auto-detects Node.js
5. Deploy

**DigitalOcean App Platform / AWS Elastic Beanstalk:**
Similar process - configure build/start commands and environment variables

### Database

**MongoDB Atlas** (Recommended for production):
1. Create cluster
2. Whitelist IP addresses
3. Create database user
4. Get connection string
5. Set as `MONGODB_URI` environment variable

### Environment Variables in Production
- Never commit `.env` to repository
- Use hosting platform's environment variable management
- Ensure `API_KEY_ENCRYPTION_SECRET` is consistent across deployments

---

# 13. Coding Standards

## Naming Conventions

### Files
- React components: PascalCase (e.g., `CourtroomDetailPage.tsx`)
- Utilities: camelCase (e.g., `encryption.ts`)
- Constants: UPPER_SNAKE_CASE (e.g., `API_BASE_URL`)

### Variables & Functions
- camelCase for variables and functions
- PascalCase for React components and classes
- UPPER_SNAKE_CASE for constants

### Database Models
- PascalCase for model names (e.g., `User`, `Courtroom`)
- camelCase for field names

## Folder Conventions

- Group by feature/domain (e.g., `courtrooms/`, `agents/`)
- Shared utilities in `utils/` or `lib/`
- UI components in `components/ui/`
- Layout components in `components/layout/`
- Pages in `pages/`
- Context providers in `context/`

## Patterns

### React
- Functional components with hooks (no class components)
- Custom hooks for reusable logic (prefix with `use`)
- Context API for global state
- Props interfaces defined above component
- Destructure props in function signature

### TypeScript
- Explicit types for function parameters and return values
- Use interfaces for object shapes
- Use type aliases for unions and primitives
- Avoid `any` - use `unknown` if type truly unknown
- Enable `strict` mode in tsconfig

### Backend
- Async/await over callbacks
- Try-catch for error handling
- Middleware for cross-cutting concerns (auth, logging)
- Service layer for business logic
- Thin route handlers

## Architecture Principles

- **Separation of Concerns**: Clear boundaries between UI, business logic, data access
- **Single Responsibility**: Each module does one thing well
- **DRY (Don't Repeat Yourself)**: Extract common logic into utilities
- **Dependency Injection**: Pass dependencies rather than hardcoding
- **Fail Fast**: Validate early and provide clear error messages
- **Security First**: Never expose sensitive data, always validate input

## Error Handling

### Frontend
- Use try-catch for async operations
- Display user-friendly error messages
- Toast notifications for transient errors
- Log errors to console in development

### Backend
- Use try-catch in route handlers
- Return consistent error response format
- Log errors with context (user ID, operation, timestamp)
- Don't expose stack traces to clients in production

## Logging

### Current State
- Console.log for development
- No structured logging library

### Recommendations
- Add Winston or Pino for backend
- Log levels: error, warn, info, debug
- Include request ID for tracing
- Log API key usage (without exposing keys)

## Testing Expectations

Not currently implemented. When adding tests:

### Unit Tests
- Test pure functions and utilities
- Mock external dependencies
- Aim for 80%+ coverage on business logic

### Integration Tests
- Test API endpoints
- Use test database
- Test authentication and authorization

### E2E Tests
- Test critical user flows
- Signup → model setup → agent creation → debate
- Use Playwright or Cypress

## Documentation Style

- README for project overview and setup
- Inline comments for complex logic only
- JSDoc for public API functions
- Type definitions serve as documentation
- Keep this agent_context.md updated with architecture changes

---

# 14. Design Guidelines

## UI Framework

**Custom Components with shadcn/ui Patterns**
- Built from scratch using Tailwind CSS
- Inspired by shadcn/ui component library
- No external component library dependency
- Fully customizable and maintainable

## Theme

**Dark Mode First**
- Primary theme: Dark with gradient backgrounds
- Background: `slate-950` to `slate-900` gradient
- Text: Light colors (`slate-100`, `slate-200`, `slate-300`)
- Accent colors: Blue and cyan for highlights
- Support for light mode (future enhancement)

## Typography

- **Font Family**: System font stack (default sans-serif)
- **Headings**: Bold weight, larger sizes with proper hierarchy
- **Body Text**: Regular weight, `text-slate-300` for readability
- **Code/Monospace**: Monospace font for technical content

## Spacing

**Tailwind Spacing Scale**
- Consistent use of Tailwind's spacing utilities (p-4, m-6, gap-4, etc.)
- Card padding: `p-6` or `p-8`
- Section gaps: `gap-6` or `gap-8`
- Button padding: `px-4 py-2` (small), `px-6 py-3` (medium)

## Colors

**Color Palette:**
- **Background**: `slate-950`, `slate-900`, `slate-800`
- **Primary**: `blue-500`, `blue-600` (buttons, links)
- **Accent**: `cyan-400`, `cyan-500` (highlights, badges)
- **Text Primary**: `slate-100`, `white`
- **Text Secondary**: `slate-300`, `slate-400`
- **Success**: `green-500`, `emerald-500`
- **Warning**: `yellow-500`, `amber-500`
- **Error**: `red-500`, `rose-500`
- **Info**: `blue-400`, `sky-400`

## Component Philosophy

### Reusability
- Build generic components in `components/ui/`
- Accept props for customization
- Use composition over configuration
- Keep components small and focused

### Consistency
- Consistent button styles across app
- Uniform card designs
- Standard form inputs
- Predictable interactions

### Accessibility
- Semantic HTML elements
- Proper ARIA labels
- Keyboard navigation support
- Focus states visible
- Color contrast ratios meet WCAG AA

## Accessibility Rules

- All interactive elements keyboard accessible
- Form inputs have associated labels
- Images have alt text
- Focus indicators always visible
- Color not sole indicator of state
- Minimum touch target size: 44x44px
- Test with screen readers (recommended)

---

# 15. Performance Considerations

## Caching

### Current State
- No caching implemented
- Every request hits database
- API keys decrypted on each use

### Recommendations
- Cache user models and agents in memory (short TTL)
- Cache decrypted API keys for duration of debate
- Use Redis for session storage and caching
- Implement HTTP cache headers for static assets
- Cache courtroom data during active debates

## Optimization

### Frontend
- Code splitting by route (React.lazy)
- Lazy load images
- Minimize bundle size (tree shaking)
- Use production builds for deployment
- Debounce search and filter inputs
- Virtualize long lists (if needed)

### Backend
- Database indexes on frequently queried fields (userId, courtroomId)
- Use projection to limit returned fields
- Avoid N+1 queries (use populate wisely)
- Stream large responses
- Compress API responses (gzip)

### Database
- Index on `userId` for all user-scoped collections
- Index on `courtroomId` for messages
- Index on `email` (unique) for users
- Compound indexes for complex queries
- Monitor slow queries and optimize

## Large Datasets

### Pagination
- Implement cursor-based or offset pagination for:
  - Messages in courtrooms (can be hundreds)
  - User's courtrooms list
  - Long agent response histories
- Default page size: 50 items
- Include pagination metadata (total, page, hasNext)

### Streaming
- Consider streaming debate messages as they're generated
- Use Server-Sent Events (SSE) or WebSockets for real-time updates
- Stream LLM responses for better UX

## Lazy Loading

- Lazy load pages with React.lazy()
- Load courtroom messages on-demand
- Infinite scroll for long message lists
- Load agent details only when needed

## Rate Limiting

### Current State
- No rate limiting implemented

### Recommendations
- Implement rate limiting middleware (express-rate-limit)
- Per-user limits:
  - API requests: 100 requests/minute
  - Debate starts: 10/hour
  - Signups: 5/hour per IP
- Respect LLM provider rate limits
- Queue requests if limits approached
- Return 429 Too Many Requests with Retry-After header

---

# 16. Security

## Authentication

**JWT-Based:**
- Tokens signed with `JWT_SECRET`
- Token includes user ID and email
- Expiration: 7 days (configurable)
- Tokens stored in frontend (localStorage or memory)
- No refresh token mechanism (yet)

**Recommendations:**
- Implement refresh tokens for better security
- Use httpOnly cookies instead of localStorage
- Shorter access token lifetime (15-30 minutes)
- Implement logout token blacklist

## Authorization

**User-Scoped Data Access:**
- All database queries filtered by `req.userId` from JWT
- Auth middleware extracts user from token
- No resource sharing between users (yet)
- Ownership verified before update/delete operations

## Validation

**Input Validation:**
- Basic validation in route handlers
- Type checking via TypeScript
- Mongoose schema validation for database

**Recommendations:**
- Add express-validator for robust input validation
- Validate all user inputs
- Sanitize HTML/script content
- Validate API keys format before encryption
- Enforce strong password requirements

## Sanitization

**Current State:**
- Limited sanitization
- Relying on TypeScript types and Mongoose schemas

**Recommendations:**
- Sanitize HTML in user-generated content
- Prevent XSS attacks with proper escaping
- Use libraries like DOMPurify for frontend
- Validate and sanitize all text inputs
- Remove or escape special characters in system prompts

## Sensitive Data Handling

**API Keys:**
- ✅ Encrypted with AES-256-GCM before storage
- ✅ Decrypted only when needed (LLM API calls)
- ✅ Never returned to frontend in decrypted form
- ✅ Encryption key from environment variable
- ⚠️ Consider: Key rotation strategy

**Passwords:**
- ✅ Hashed with bcrypt before storage
- ✅ Salt rounds: 10 (default)
- ✅ Never stored in plaintext
- ✅ Never returned in API responses
- ⚠️ Consider: Stronger password requirements

**JWT Tokens:**
- ✅ Signed, not encrypted
- ✅ Don't include sensitive data in payload
- ⚠️ Vulnerable if stolen (no revocation mechanism)
- ⚠️ Consider: Refresh tokens, token blacklist

**Environment Variables:**
- ✅ Stored in .env files (git-ignored)
- ✅ Never hardcoded in source
- ⚠️ Ensure proper permissions on .env files
- ⚠️ Use secrets management in production

## Known Security Assumptions

1. **MongoDB Security**: Assumes MongoDB is properly secured with authentication
2. **HTTPS in Production**: Assumes production deployment uses HTTPS
3. **Trusted Environment**: Assumes server environment is secure
4. **API Key Trust**: Assumes users provide legitimate API keys
5. **No Token Revocation**: Stolen tokens valid until expiration
6. **CORS Configuration**: Currently permissive for development
7. **Rate Limiting**: No protection against abuse/DoS

**Recommendations for Production:**
- Enable HTTPS/TLS for all connections
- Implement rate limiting
- Add CSRF protection for cookie-based auth
- Implement security headers (helmet.js)
- Regular security audits and dependency updates
- Add monitoring for suspicious activity
- Implement proper logging (without sensitive data)
- Add WAF (Web Application Firewall)

---

# 17. Current Status

## Completed

✅ **Core Infrastructure**
- Client-server architecture with TypeScript
- MongoDB database with Mongoose ODM
- JWT authentication system
- API key encryption system

✅ **User Management**
- User registration and login
- JWT token-based authentication
- Per-user data isolation

✅ **Model Management**
- CRUD operations for AI models
- Support for multiple providers (OpenAI, Anthropic, Google, DeepSeek, Ollama, custom)
- Encrypted API key storage
- Model configuration (parameters, base URLs)

✅ **Agent Management**
- CRUD operations for agent templates
- Custom system prompts
- Agent-model assignment
- Default agent templates

✅ **Courtroom Management**
- CRUD operations for courtrooms
- Multi-step courtroom creation wizard
- Agent selection and assignment
- Debate strategy selection
- Status management (draft, active, paused, completed)

✅ **Debate Engine**
- Multi-agent debate orchestration
- Five debate strategies:
  - Consensus building
  - Majority vote
  - Devil's advocate
  - Judge-moderated
  - Open debate
- Round-based execution
- Message threading and history
- Verdict generation with consensus tracking

✅ **Frontend UI**
- Responsive design with Tailwind CSS
- Dark mode interface
- Dashboard with statistics
- Model, agent, and courtroom management pages
- Courtroom detail view with message visualization
- Authentication pages (login, signup)
- Landing page
- Onboarding flow

✅ **A2A Protocol**
- Agent-to-Agent protocol implementation
- External agent integration capability
- Agent card management
- A2A endpoint exposure

## In Progress

🔄 **Real-time Updates**
- WebSocket integration for live debate updates (planned)
- Server-Sent Events for message streaming (planned)

🔄 **Enhanced UX**
- Loading states and progress indicators
- Error boundary components
- Toast notification system (partial)

## Planned

📋 **Testing Infrastructure**
- Unit tests for utilities and services
- Integration tests for API endpoints
- E2E tests for critical user flows
- Test coverage reporting

📋 **Advanced Features**
- Debate export (PDF, Markdown)
- Debate templates and presets
- Agent personality customization
- Model performance analytics
- Cost tracking per debate

📋 **Collaboration Features**
- Team workspaces
- Shared agent templates
- Public courtrooms
- Debate sharing and embedding

📋 **Performance Optimizations**
- Caching layer (Redis)
- Database query optimization
- Response streaming
- Pagination for large datasets

## Blocked

🚫 **WebSocket Implementation**
- Requires infrastructure decision
- Needs fallback for environments without WS support

🚫 **Production Deployment**
- Needs finalized hosting decisions
- Requires production environment configuration

---

# 18. Known Issues

## Bugs

🐛 **Frontend:**
- No proper error boundaries for component crashes
- Toast notifications may stack without proper dismissal
- Modal focus trapping not implemented
- No loading states during debate execution
- Refresh loses debate progress (no state persistence)

🐛 **Backend:**
- Synchronous debate execution can timeout on long debates
- No retry mechanism for failed LLM API calls
- Encryption secret change breaks existing API keys
- JWT secret change invalidates all sessions
- No cleanup for orphaned messages when courtroom deleted

🐛 **Debate Engine:**
- No handling for LLM rate limit errors
- Partial debate state not recoverable if crash occurs
- No timeout for individual agent responses
- Consensus detection logic basic (keyword-based)
- Judge strategy requires explicit judge designation (not enforced)

## Technical Debt

⚠️ **Code Quality:**
- No comprehensive test coverage
- Limited error handling in some routes
- Some duplicate code between strategies
- Frontend state management could be refactored
- No input validation library (manual validation)

⚠️ **Security:**
- No rate limiting
- No CSRF protection
- Permissive CORS for development (needs production config)
- No security headers (helmet.js not configured)
- Password requirements too weak (6 characters minimum)
- No account lockout after failed login attempts

⚠️ **Performance:**
- No caching layer
- No pagination for messages
- No database connection pooling optimization
- API keys decrypted on every use
- No query optimization or indexes beyond defaults

⚠️ **Infrastructure:**
- No monitoring or observability
- No structured logging
- No health check endpoints (basic one exists)
- No graceful shutdown handling
- No database migration system

## Limitations

⛔ **Current Limitations:**
- Single user workspace (no collaboration)
- Synchronous debate execution (blocks server)
- No debate resumption after interruption
- Fixed debate strategies (not customizable)
- No partial results if debate fails mid-way
- No model fallback if primary model fails
- Limited to text-based debates (no images, files)
- No cost estimation before starting debate
- No debate history search or filtering
- Frontend-only error handling (limited backend logging)

## Workarounds

**For long debates:**
- Increase server timeout settings
- Reduce max rounds
- Use faster models (GPT-3.5 instead of GPT-4)

**For API failures:**
- Manually retry debate
- Check API key validity before starting
- Ensure sufficient API credits

**For lost debate progress:**
- Messages stored in database, can be retrieved
- Restart debate from beginning if interrupted

---

# 19. Future Roadmap

## Upcoming Features (Short-term: 1-3 months)

🎯 **Real-time Debate Updates**
- WebSocket integration for live message streaming
- Progress indicators during debate execution
- Ability to pause and resume debates

🎯 **Enhanced Debate Strategies**
- Customizable strategy parameters
- Hybrid strategies (combination of multiple)
- User-defined termination conditions
- Agent voting and polling mechanisms

🎯 **Debate Export & Sharing**
- Export debates as PDF with formatting
- Markdown export for documentation
- Shareable links for completed debates
- Embed widget for external sites

🎯 **Advanced Agent Configuration**
- Temperature and parameter overrides per agent
- Multiple personas per agent template
- Agent memory and context management
- Agent behavior customization (verbosity, formality)

🎯 **Cost Tracking & Analytics**
- Token usage tracking per debate
- Cost estimation before starting
- Model performance analytics
- Response time and quality metrics

## Refactoring Plans (Medium-term: 3-6 months)

🔧 **Backend Refactoring**
- Implement service layer pattern consistently
- Add comprehensive error handling
- Implement event-driven architecture for debates
- Extract debate execution to worker processes
- Add request validation middleware
- Implement repository pattern for database access

🔧 **Frontend Refactoring**
- Migrate to more robust state management (Zustand, Jotai, or Redux Toolkit)
- Implement proper error boundaries
- Add suspense boundaries for lazy loading
- Refactor large components into smaller pieces
- Implement design system tokens
- Add storybook for component documentation

🔧 **Database Optimization**
- Add database migrations system
- Optimize indexes based on query patterns
- Implement soft deletes for audit trail
- Add database versioning
- Implement read replicas for scaling

🔧 **Testing Infrastructure**
- Unit tests with 80%+ coverage
- Integration test suite for API
- E2E test suite for critical flows
- Performance testing for debate engine
- Security testing and penetration testing

## Scaling Plans (Long-term: 6-12 months)

📈 **Horizontal Scaling**
- Containerize with Docker
- Kubernetes deployment
- Load balancing for multiple backend instances
- Separate database read/write instances
- Distributed debate execution

📈 **Microservices Evolution**
- Extract debate engine to separate service
- Separate authentication service
- Dedicated LLM proxy service
- Message queue for async operations (RabbitMQ, AWS SQS)
- Event streaming (Kafka)

📈 **Advanced Features**
- Multi-modal debates (images, documents, code)
- Voice input/output for debates
- Integrations with external tools (Slack, Discord, GitHub)
- API for third-party applications
- Plugin system for custom strategies
- Marketplace for agent templates and strategies

📈 **Enterprise Features**
- Team workspaces and organizations
- Role-based access control (RBAC)
- SSO integration (SAML, OAuth)
- Audit logs and compliance reports
- Custom branding and white-labeling
- SLA guarantees and support tiers
- Data residency options

## Ideas for Exploration

💡 **AI/ML Enhancements**
- Automatic consensus detection using NLP
- Agent personality learning from interactions
- Predictive debate outcomes
- Sentiment analysis of agent responses
- Automatic debate summarization
- Quality scoring for agent contributions

💡 **Collaboration Features**
- Human participants in debates (hybrid human-AI)
- Audience voting and feedback
- Debate tournaments and competitions
- Community-shared agent templates
- Debate challenges and leaderboards

💡 **Integration Possibilities**
- GitHub integration for code reviews
- Jira/Linear integration for decision-making
- Confluence/Notion for documentation
- Email integration for debate summaries
- Calendar integration for scheduled debates
- Analytics platforms (Mixpanel, Amplitude)

---

# 20. Glossary

## Project-Specific Terminology

**Agent**: An AI persona with a specific role, system prompt, and assigned LLM model. Represents a participant in a debate with a particular perspective or expertise.

**Courtroom**: A virtual space where multiple agents engage in structured debates. Named after legal courtrooms where arguments are presented.

**Debate**: A multi-round conversation between agents aimed at exploring a topic, making a decision, or reaching consensus.

**Strategy**: The rules and flow governing how a debate progresses. Defines turn-taking, termination conditions, and verdict generation.

**Verdict**: The final output of a completed debate, synthesizing agent responses into agreements, disagreements, and recommendations.

**System Prompt**: Instructions given to an LLM defining its role, personality, and behavior. Shapes how an agent responds.

**Round**: A complete cycle where all agents in a courtroom get a turn to respond.

**Consensus**: Agreement among agents on key points. Different strategies measure consensus differently.

**Model**: An LLM from a provider (OpenAI, Anthropic, etc.) configured with API credentials and parameters.

**A2A (Agent-to-Agent)**: A protocol enabling external AI agents to communicate with Hathap.AI courtrooms.

**Participant**: An agent assigned to a specific courtroom to participate in debates.

## Abbreviations

- **LLM**: Large Language Model (GPT-4, Claude, etc.)
- **API**: Application Programming Interface
- **JWT**: JSON Web Token (authentication method)
- **CRUD**: Create, Read, Update, Delete (basic operations)
- **ODM**: Object-Document Mapper (Mongoose for MongoDB)
- **REST**: Representational State Transfer (API architecture)
- **UI/UX**: User Interface / User Experience
- **SPA**: Single Page Application
- **SSE**: Server-Sent Events (real-time updates)
- **WS**: WebSocket (bidirectional communication)
- **CORS**: Cross-Origin Resource Sharing
- **RBAC**: Role-Based Access Control
- **SSO**: Single Sign-On
- **A2A**: Agent-to-Agent (protocol)
- **E2E**: End-to-End (testing)

## Definitions

**Mongoose**: Node.js ODM library for MongoDB, providing schema-based modeling.

**Vite**: Modern frontend build tool, faster alternative to Webpack.

**Tailwind CSS**: Utility-first CSS framework for rapid UI development.

**Express.js**: Minimalist web framework for Node.js.

**Context API**: React's built-in state management solution.

**bcrypt**: Library for hashing passwords securely.

**AES-256-GCM**: Advanced Encryption Standard with 256-bit key and Galois/Counter Mode, used for API key encryption.

**OAuth**: Open standard for access delegation, used for third-party authentication.

**Prompt Engineering**: Crafting effective instructions for LLMs to produce desired outputs.

---

# 21. AI Agent Instructions

## Assumptions an AI Agent Should Make

When working with this codebase, an AI agent should assume:

1. **Security First**: All API keys must be encrypted, never expose sensitive data, always validate user ownership
2. **User Isolation**: Every database query must be scoped to the authenticated user
3. **Type Safety**: TypeScript types are enforced, maintain strict typing
4. **Async Operations**: All LLM API calls are asynchronous and may fail
5. **Error Handling**: Failures should be gracefully handled with user-friendly messages
6. **Production Ready**: Code should be production-quality even in development
7. **Backward Compatibility**: Changes should not break existing API contracts
8. **Documentation**: Complex logic requires inline comments or documentation updates

## Things That Should Never Be Modified

🔒 **DO NOT CHANGE:**

1. **Encryption Implementation** (`server/src/utils/encryption.ts`)
   - Changing encryption breaks all stored API keys
   - Only add new encryption methods, never replace existing

2. **JWT Payload Structure** (user ID, email)
   - Changing invalidates existing tokens
   - Only add new claims, don't remove existing

3. **Database Schema Fields** (User.email, Model.apiKey)
   - Core fields relied upon throughout codebase
   - Use migrations for schema changes

4. **API Key Storage Format**
   - Always encrypted, never plaintext
   - Decryption only in LLM client

5. **User Isolation Logic**
   - All queries must filter by userId
   - Never allow cross-user access

6. **API Endpoint URLs** (breaking changes)
   - Frontend depends on these
   - Version API if changing contracts

## Preferred Coding Style

- **Functional over imperative**: Use map/filter/reduce over loops
- **Async/await over callbacks**: Modern Promise handling
- **Destructuring**: Extract props and variables
- **Early returns**: Reduce nesting with guard clauses
- **Const by default**: Use const unless reassignment needed
- **Explicit over implicit**: Clear variable names, avoid abbreviations
- **Comments for why, not what**: Code should be self-documenting
- **Small functions**: Single responsibility, max 50 lines

## Files to Avoid Touching

⚠️ **Minimize changes to:**

1. **`server/src/utils/encryption.ts`**
   - Core security functionality
   - Changes risk data loss
   - Only modify if absolutely necessary with thorough testing

2. **`server/src/middleware/authMiddleware.ts`**
   - Authentication logic
   - Changes affect all protected routes
   - Test thoroughly if modified

3. **Database Models** (`server/src/models/*.ts`)
   - Schema changes require migrations
   - Affects all dependent code
   - Prefer additive changes

4. **A2A Protocol Files** (`server/src/a2a/*`)
   - External integration protocol
   - Changes may break external agents
   - Coordinate with protocol spec

5. **Build Configuration Files**
   - `vite.config.ts`, `tsconfig.json`
   - Working configurations
   - Only change if solving specific build issues

## How to Approach Feature Additions

### Step-by-Step Process

1. **Understand Existing Patterns**
   - Review similar existing features
   - Follow established architecture
   - Maintain consistency with codebase

2. **Start with Types**
   - Define TypeScript interfaces first
   - Add to `types/` or inline
   - Ensures type safety throughout

3. **Backend First**
   - Add database model if needed
   - Create API endpoints with validation
   - Implement business logic in services
   - Add to route handlers

4. **Frontend Integration**
   - Update context if state needed
   - Create UI components
   - Connect to API endpoints
   - Add to routing if new page

5. **Test Manually**
   - Test happy path
   - Test error cases
   - Test with real data
   - Test on different screen sizes

6. **Update Documentation**
   - Update README if user-facing
   - Update agent_context.md if architectural
   - Add inline comments for complex logic

### Example: Adding a New Feature

**Feature: "Debate Templates"**

1. **Types**: Define `DebateTemplate` interface
2. **Model**: Create `Template.ts` schema
3. **Routes**: Add `/api/templates` CRUD endpoints
4. **Service**: Implement template validation logic
5. **Context**: Add templates to `AppContext`
6. **UI**: Create `TemplatesPage` component
7. **Integration**: Connect to API in context
8. **Routing**: Add `/templates` route to App.tsx
9. **Test**: Create, edit, use template
10. **Document**: Update this file and README

## Common Pitfalls

❌ **Avoid:**

1. **Forgetting User Scoping**: Always filter by userId
2. **Exposing Secrets**: Never return decrypted API keys to frontend
3. **Blocking Operations**: Don't block event loop with synchronous operations
4. **Ignoring Errors**: Always handle async errors with try-catch
5. **Hardcoding Values**: Use environment variables for config
6. **Skipping Validation**: Validate all user inputs
7. **Tight Coupling**: Keep components and modules loosely coupled
8. **Premature Optimization**: Optimize after measuring, not before
9. **Inconsistent Naming**: Follow existing naming conventions
10. **Breaking Changes**: Consider backward compatibility

## Expected Quality Standards

✅ **Code should:**

- Compile without TypeScript errors
- Follow existing naming conventions
- Include error handling for async operations
- Be readable without excessive comments
- Have single responsibility per function/component
- Validate user inputs
- Respect user data isolation
- Use types instead of any
- Handle edge cases gracefully
- Be testable (even if tests not written yet)

✅ **PRs/Changes should:**

- Have clear description of what and why
- Not break existing functionality
- Include manual testing notes
- Update relevant documentation
- Follow project structure conventions
- Be reasonably sized (not massive changes)
- Consider security implications
- Consider performance implications

---

# 22. Frequently Asked Questions

## Architectural Decisions

### Q: Why MongoDB instead of PostgreSQL?

**A:** MongoDB chosen for:
- Flexible schema for evolving debate structures
- JSON-like documents match JavaScript/TypeScript naturally
- Easy to store nested structures (messages, metadata)
- Mongoose provides good TypeScript support
- Horizontal scaling capabilities for future growth

However, PostgreSQL would be valid for:
- ACID guarantees if needed
- Complex relational queries
- Better support for traditional SQL tools

### Q: Why Context API instead of Redux?

**A:** Context API chosen for:
- Built into React, no additional dependencies
- Simpler for this application's complexity level
- Good enough for current state management needs
- Less boilerplate than Redux
- Easier for developers to understand

May migrate to Zustand or Redux Toolkit if state complexity grows significantly.

### Q: Why monorepo structure (client + server)?

**A:** 
- Easy local development (single repo clone)
- Shared type definitions possible
- Coordinated versioning
- Simpler for solo/small team development

However, separate repos considered for:
- Independent deployment cycles
- Different teams owning frontend/backend
- Clearer separation of concerns

### Q: Why JWT instead of sessions?

**A:**
- Stateless authentication (no session store needed)
- Easier to scale horizontally
- Works well with SPA architecture
- Simpler infrastructure (no Redis for sessions yet)

Trade-offs:
- Can't revoke tokens easily (no blacklist yet)
- Tokens stored client-side (XSS risk if not careful)
- Larger request size (token in every request)

### Q: Why not use a BaaS like Firebase or Supabase?

**A:** 
- Full control over data and logic
- No vendor lock-in
- Learning opportunity for full-stack development
- Customization flexibility
- Cost predictability

BaaS would offer:
- Faster initial development
- Built-in auth and real-time features
- Managed infrastructure
- Auto-scaling

### Q: Why Vite instead of Create React App or Next.js?

**A:**
- Vite is significantly faster (HMR, build times)
- Modern tooling (native ES modules)
- Simple configuration
- Lightweight compared to Next.js
- No SSR complexity needed (SPA sufficient)

Next.js would add:
- Server-side rendering
- Better SEO (not critical for this app)
- API routes (we have separate backend)
- More opinionated structure

## Why Certain Technologies Were Chosen

### Q: Why TypeScript over JavaScript?

**A:**
- Type safety catches errors at compile time
- Better IDE support (autocomplete, refactoring)
- Self-documenting code through types
- Easier refactoring and maintenance
- Industry standard for modern applications

### Q: Why Express over Fastify or other frameworks?

**A:**
- Mature ecosystem with extensive middleware
- Well-documented and widely understood
- Sufficient performance for current needs
- Easy to find solutions and help
- Simple and unopinionated

Fastify would offer:
- Better performance (benchmarks)
- Built-in schema validation
- More modern architecture

### Q: Why Tailwind CSS over styled-components or CSS modules?

**A:**
- Utility-first approach speeds development
- Consistent design system out of the box
- Excellent IDE support with IntelliSense
- Tree-shaking removes unused styles
- No runtime JavaScript (unlike styled-components)
- Easier to maintain than custom CSS

### Q: Why separate client and server folders?

**A:** (This was the reorganization requested)
- Clear separation of concerns
- Independent build processes
- Easier to deploy separately
- Clearer project structure
- Standard full-stack pattern

### Q: Why no GraphQL?

**A:**
- REST is simpler for this use case
- No need for flexible querying yet
- Smaller learning curve
- Less tooling and setup
- Adequate for current API needs

GraphQL would offer:
- More flexible queries from frontend
- Single endpoint
- Strongly typed API schema
- Better for complex, nested data

## Common Misconceptions

### "Agents are autonomous AI that run continuously"

**Reality:** Agents are templates/personas. They only execute when a debate is started and produce responses based on their system prompt and assigned LLM model. They don't have memory between debates or autonomous behavior.

### "Courtrooms are chat rooms"

**Reality:** Courtrooms are structured debate environments with specific rules (strategies), not free-form chat. The strategy determines how agents interact and how consensus is reached.

### "API keys are stored in frontend"

**Reality:** API keys are NEVER sent to or stored in frontend. They're encrypted in the backend database and only decrypted when making LLM API calls on the server side.

### "All debates happen in real-time"

**Reality:** Currently debates are executed synchronously on the backend. The frontend sees results after completion. Real-time streaming is a planned feature, not current functionality.

### "This is a chatbot builder"

**Reality:** It's a multi-agent debate orchestration platform. The focus is on multiple AI agents collaborating and discussing, not single-agent chat interactions.

### "You need all LLM providers to use it"

**Reality:** You only need API keys for the models you want to use. Can start with just OpenAI, or just Anthropic, or any single provider. The system supports multiple providers but doesn't require all of them.

### "Debates are free"

**Reality:** Debates cost money based on LLM provider pricing (tokens used). Users pay for their own API usage through their provided API keys. The platform itself doesn't charge, but LLM usage does.

---

# 23. References

## Useful Documents

- **Project README**: `README.md` - Setup instructions, feature overview, tech stack
- **This Document**: `agent_context.md` - Comprehensive architecture and context
- **Environment Example**: `server/.env.example` - Required environment variables
- **GitHub Copilot Instructions**: `.github/copilot-instructions.md` - AI assistant guidance

## Architecture Diagrams

Currently no formal diagrams. Recommended additions:
- System architecture diagram (client-server-database)
- Debate execution flow diagram
- Database entity relationship diagram
- API endpoint map
- User journey flowcharts

**Tools for creating diagrams:**
- Mermaid (markdown-based, can embed in docs)
- Draw.io / Excalidraw
- Lucidchart
- PlantUML

## API Documentation

Currently no formal API docs. Recommended:
- OpenAPI/Swagger specification
- Postman collection for testing
- API documentation site (Redoc, Swagger UI)

**Current endpoints documented in:**
- Section 7: API Design (this document)
- Route files: `server/src/routes/*.ts`

## External Documentation

### Technologies
- **React**: https://react.dev/
- **TypeScript**: https://www.typescriptlang.org/docs/
- **Vite**: https://vitejs.dev/guide/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Express.js**: https://expressjs.com/
- **Mongoose**: https://mongoosejs.com/docs/
- **MongoDB**: https://docs.mongodb.com/
- **JWT**: https://jwt.io/introduction

### LLM Providers
- **OpenAI API**: https://platform.openai.com/docs/
- **Anthropic API**: https://docs.anthropic.com/
- **Google AI**: https://ai.google.dev/docs
- **DeepSeek**: https://platform.deepseek.com/api-docs/
- **Ollama**: https://ollama.ai/docs

### Protocols
- **A2A Protocol**: https://a2a.org/
- **A2A JS SDK**: https://github.com/a2a-org/a2a-js

## Design Files

Currently no design files. Recommended additions:
- Figma/Adobe XD designs
- Design system documentation
- Component library (Storybook)
- Brand guidelines (colors, typography, logos)

## Issue Tracker

**Where to track issues:**
- GitHub Issues (if using GitHub)
- Linear, Jira, or similar project management tool
- This document's "Known Issues" section for reference

**Issue categories:**
- Bugs
- Feature requests
- Technical debt
- Documentation improvements
- Security concerns

---

# Appendix

## Sample Requests

### Authentication Request
```bash
# Signup
curl -X POST http://localhost:4000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepass","name":"John Doe"}'

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"securepass"}'
```

### Model Management
```bash
# Create Model
curl -X POST http://localhost:4000/api/models \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "GPT-4 Turbo",
    "provider": "openai",
    "modelId": "gpt-4-turbo-preview",
    "apiKey": "sk-...",
    "parameters": {"temperature": 0.7, "max_tokens": 2000}
  }'

# List Models
curl -X GET http://localhost:4000/api/models \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Courtroom Creation
```bash
# Create Courtroom
curl -X POST http://localhost:4000/api/courtrooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Technical Architecture Review",
    "objective": "Should we use microservices or monolith?",
    "strategy": "consensus",
    "participants": ["agent_id_1", "agent_id_2", "agent_id_3"],
    "maxRounds": 3
  }'

# Start Debate
curl -X POST http://localhost:4000/api/courtrooms/courtroom_id/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Sample Responses

### Successful Authentication
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Model List Response
```json
{
  "models": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "userId": "507f1f77bcf86cd799439011",
      "name": "GPT-4 Turbo",
      "provider": "openai",
      "modelId": "gpt-4-turbo-preview",
      "parameters": {
        "temperature": 0.7,
        "max_tokens": 2000
      },
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```
Note: `apiKey` field is never returned in responses.

### Courtroom with Messages
```json
{
  "courtroom": {
    "_id": "507f1f77bcf86cd799439013",
    "name": "Architecture Review",
    "objective": "Should we use microservices?",
    "strategy": "consensus",
    "status": "completed",
    "currentRound": 3,
    "maxRounds": 3,
    "participants": ["agent_id_1", "agent_id_2"]
  },
  "messages": [
    {
      "_id": "507f1f77bcf86cd799439014",
      "courtroomId": "507f1f77bcf86cd799439013",
      "agentId": "agent_id_1",
      "round": 1,
      "content": "I recommend starting with a monolith...",
      "createdAt": "2024-01-15T10:35:00.000Z"
    }
  ],
  "verdict": {
    "_id": "507f1f77bcf86cd799439015",
    "summary": "The agents reached consensus on starting with monolith...",
    "agreements": ["Start with monolith", "Can migrate later"],
    "disagreements": [],
    "recommendations": ["Use modular architecture", "Plan for future split"],
    "consensusLevel": 85
  }
}
```

### Error Response
```json
{
  "error": "Invalid credentials",
  "success": false,
  "code": "AUTH_FAILED"
}
```

## Example Data

### Sample Agent System Prompt
```
You are a Senior Software Architect with 15 years of experience in distributed systems.

Your role in this debate:
- Provide technical perspective on architecture decisions
- Consider scalability, maintainability, and team capability
- Back your arguments with real-world examples
- Be open to other perspectives but argue your position clearly
- Focus on practical considerations over theoretical ideals

Communication style:
- Professional but conversational
- Use concrete examples
- Acknowledge trade-offs
- Be concise but thorough
```

### Sample Debate Objective
```
Topic: "Should our startup build a mobile app native (Swift/Kotlin) or use React Native?"

Context:
- Team of 5 developers (3 web, 2 backend)
- 6-month timeline to MVP
- Budget: $200k
- Target: iOS and Android
- Need push notifications, camera, and offline capability

Please provide recommendation with rationale.
```

## Useful Commands

### Development

```bash
# Start both servers concurrently (if using concurrently package)
npm run dev:all

# Backend only
cd server && npm run dev

# Frontend only
cd client && npm run dev

# Build both
cd client && npm run build && cd ../server && npm run build

# Type checking
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit

# Linting
cd client && npm run lint
```

### Database

```bash
# Connect to local MongoDB
mongosh mongodb://localhost:27017/hathap

# Import sample data
mongoimport --db hathap --collection agents --file agents.json

# Export backup
mongodump --db hathap --out ./backup

# Restore backup
mongorestore --db hathap ./backup/hathap
```

### Docker (if Dockerized)

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Reset volumes
docker-compose down -v
```

## Useful Scripts

### Backend Health Check
```bash
#!/bin/bash
# check-health.sh
curl -f http://localhost:4000/api/health || exit 1
echo "Backend is healthy"
```

### Database Seed Script
```javascript
// server/scripts/seed.js
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Agent = require('../src/models/Agent');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Create default user
  const user = await User.create({
    email: 'demo@example.com',
    password: 'hashed_password',
    name: 'Demo User'
  });
  
  // Create default agents
  await Agent.create([
    { userId: user._id, name: 'Senior Architect', role: 'Technical Lead', systemPrompt: '...' },
    { userId: user._id, name: 'Product Manager', role: 'Business Perspective', systemPrompt: '...' }
  ]);
  
  console.log('Database seeded');
  process.exit(0);
}

seed().catch(console.error);
```

---

## Document Maintenance

**Last Updated**: January 2024

**Maintained By**: Development Team

**Update Frequency**: After major architectural changes or feature additions

**How to Update**:
1. Edit this file when architecture changes
2. Update relevant sections (don't duplicate in README)
3. Keep examples and code samples current
4. Ensure consistency with actual codebase
5. Review quarterly for accuracy

**Feedback**: Submit issues or PRs for improvements to this documentation.

---

**End of Agent Context Documentation**
