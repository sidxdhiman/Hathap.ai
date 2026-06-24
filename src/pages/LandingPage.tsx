import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Play,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  UserCheck,
  ShieldAlert,
  Layers,
  Briefcase,
  DollarSign,
  Database,
  Code,
  Sparkles,
  Menu,
  X,
  Moon,
  Sun,
  FileText,
  Gavel
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(0);

  const faqData = [
    {
      q: "How do the AI agents collaborate on Hathap?",
      a: "Hathap creates a dedicated environment where multiple expert agents—representing roles like Product Management, Engineering Architecture, Finance, and Strategy—receive your proposal. They engage in a structured debate, challenging each other's assumptions and analyzing risks from their specific functional viewpoints."
    },
    {
      q: "Can we customize the AI Advisory Board templates?",
      a: "Yes. In the Hathap dashboard, you can define custom roles, specify focus guidelines, select target models (such as GPT-4o, Claude 3.5 Sonnet, or Llama 3), and set personality traits for each agent to match your organization's standards."
    },
    {
      q: "Does Hathap integrate with our existing tools?",
      a: "Absolutely. Hathap can connect to your project management tools, document repos, and CI/CD pipelines to pull relevant context, code structures, or financial spreadsheets directly into the decision workspace."
    },
    {
      q: "Is our business data kept secure and private?",
      a: "Security is our top priority. We use isolated workspaces, enterprise-grade encryption, and offer strict data residency controls. Your submissions and discussion histories are never used to train public LLM models."
    },
    {
      q: "What is the format of the Decision Report?",
      a: "Each discussion generates a clean, downloadable Decision Report. It contains a calculated risk score (0-100), consensus summary, individual agent critiques, potential failure modes, compliance gaps, and a list of structured action items."
    }
  ];

  const agentBoard = [
    {
      role: "Business Strategist",
      name: "Sarah Chen",
      icon: Briefcase,
      color: "border-purple-500 text-purple-400 bg-purple-500/10",
      description: "Evaluates market fit, customer acquisition pipelines, pricing models, and macro business strategy.",
      quote: "TAM analysis and pricing strategy must align. If customer onboarding friction is high, we will struggle with high churn before reaching enterprise contracts."
    },
    {
      role: "Financial Analyst",
      name: "David Vance",
      icon: DollarSign,
      color: "border-emerald-500 text-emerald-400 bg-emerald-500/10",
      description: "Inspects LTV:CAC ratios, runway runway impact, sales-cycle cash flow gaps, and budget constraints.",
      quote: "An enterprise outbound sales motion requires 9+ months of runway just to bridge the cash-flow gap of the sales cycle. We need a minimum ACV of $24k to sustain it."
    },
    {
      role: "Product Owner",
      name: "Elena Rostova",
      icon: Layers,
      color: "border-amber-500 text-amber-400 bg-amber-500/10",
      description: "Assesses user experience friction, onboarding velocity, core feature readiness, and product-led growth loops.",
      quote: "Enterprise clients demand self-serve Single Sign-On (SSO), Role-Based Access Control (RBAC), and detailed audit logs. We cannot pitch outbound without these."
    },
    {
      role: "Principal Architect",
      name: "Marcus Brody",
      icon: Database,
      color: "border-blue-500 text-blue-400 bg-blue-500/10",
      description: "Audits system scale, database schemas, security compliance (SOC 2), data isolation, and architecture limits.",
      quote: "Retiring the multi-tenant shard to meet SOC 2 compliance will require a complete database overhaul. We should support custom VPC data residency."
    },
    {
      role: "Technical Lead",
      name: "Alex Mercer",
      icon: Code,
      color: "border-rose-500 text-rose-400 bg-rose-500/10",
      description: "Evaluates dev effort, technical debt, third-party API dependencies, complexity, and sprint velocities.",
      quote: "Refactoring the application for RBAC and audit logs will consume at least two full quarters of core development. We must pause our consumer roadmap."
    }
  ];

  return (
    <div className="min-h-screen bg-theme-bg-primary text-theme-text-primary overflow-x-hidden transition-colors duration-200">
      
      {/* 1. Header / Navbar */}
      <header className="sticky top-0 z-50 bg-theme-header-bg backdrop-blur-md border-b border-theme-border transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-[8px] flex items-center justify-center shadow-lg shadow-blue-500/10">
              <Gavel className="text-white" size={22} />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Hathap.AI</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-theme-text-secondary">
            <a href="#features" className="hover:text-theme-text-primary transition-colors">Features</a>
            <a href="#board" className="hover:text-theme-text-primary transition-colors">Advisory Board</a>
            <a href="#how-it-works" className="hover:text-theme-text-primary transition-colors">How It Works</a>
            <a href="#discussion" className="hover:text-theme-text-primary transition-colors">Example Debate</a>
            <a href="#faq" className="hover:text-theme-text-primary transition-colors">FAQ</a>
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className="p-2 border border-theme-border rounded-[8px] hover:bg-theme-bg-secondary text-theme-text-secondary hover:text-theme-text-primary transition-all animate-none"
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button 
              onClick={() => navigate('/login')}
              className="text-sm font-semibold text-theme-text-secondary hover:text-theme-text-primary px-4 py-2 transition-colors"
            >
              Sign In
            </button>
            <button 
              onClick={() => navigate('/signup')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-[8px] border border-blue-500 shadow-sm hover:shadow-md transition-all"
            >
              Start Free
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex items-center gap-3 md:hidden">
            <button 
              onClick={toggleTheme}
              className="p-2 border border-theme-border rounded-[8px] hover:bg-theme-bg-secondary text-theme-text-secondary"
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 border border-theme-border rounded-[8px] hover:bg-theme-bg-secondary"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Nav */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-theme-border bg-theme-bg-primary px-6 py-6 space-y-4">
            <nav className="flex flex-col gap-4 text-base font-medium text-theme-text-secondary">
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="hover:text-theme-text-primary transition-colors">Features</a>
              <a href="#board" onClick={() => setMobileMenuOpen(false)} className="hover:text-theme-text-primary transition-colors">Advisory Board</a>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="hover:text-theme-text-primary transition-colors">How It Works</a>
              <a href="#discussion" onClick={() => setMobileMenuOpen(false)} className="hover:text-theme-text-primary transition-colors">Example Debate</a>
              <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="hover:text-theme-text-primary transition-colors">FAQ</a>
            </nav>
            <div className="h-px bg-theme-border my-4" />
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => { setMobileMenuOpen(false); navigate('/login'); }}
                className="w-full text-center py-2.5 font-semibold text-theme-text-secondary hover:text-theme-text-primary border border-theme-border rounded-[8px]"
              >
                Sign In
              </button>
              <button 
                onClick={() => { setMobileMenuOpen(false); navigate('/signup'); }}
                className="w-full text-center py-2.5 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-[8px]"
              >
                Start Free Discussion
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 2. Hero Section */}
      <section className="relative pt-16 pb-24 px-6 max-w-7xl mx-auto text-center">
        {/* Background glow effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] pointer-events-none -z-10" />
        
        {/* Tagline Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/5 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-8">
          <Sparkles size={14} className="animate-pulse" />
          Collaborative Decision Intelligence
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-5xl mx-auto leading-[1.1] mb-6 text-theme-text-primary">
          Get Expert Perspectives <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-cyan-400 bg-clip-text text-transparent">
            Before Making Important Decisions
          </span>
        </h1>

        {/* Subheadline */}
        <p className="text-lg md:text-xl text-theme-text-secondary max-w-3xl mx-auto leading-relaxed mb-10">
          Hathap brings together AI Product Owners, Architects, Engineers, Financial Analysts, and Business Strategists to review your ideas, challenge assumptions, and help you make smarter decisions.
        </p>

        {/* Hero CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <button 
            onClick={() => navigate('/signup')}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-4 rounded-[8px] shadow-lg hover:shadow-xl flex items-center justify-center gap-2 group transition-all"
          >
            Start Free Discussion
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <a 
            href="#discussion"
            className="w-full sm:w-auto border border-theme-border bg-theme-bg-secondary hover:bg-theme-bg-tertiary text-theme-text-primary font-bold px-8 py-4 rounded-[8px] flex items-center justify-center gap-2 transition-all"
          >
            <Play size={18} className="text-theme-text-muted fill-current" />
            Watch Demo
          </a>
        </div>

        {/* Hero Collaboration Visual */}
        <div className="max-w-4xl mx-auto p-6 md:p-8 rounded-[8px] border border-theme-border bg-theme-bg-card backdrop-blur-sm relative shadow-xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-500 rounded-t-[8px]" />
          
          <div className="flex flex-col md:flex-row items-center gap-8 justify-between">
            {/* Visual left side - Agents map */}
            <div className="w-full md:w-1/2 space-y-4">
              <div className="text-left mb-6">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Active Board Workspace</span>
                <h3 className="text-lg font-bold mt-1 text-theme-text-primary">AI Advisory Cross-Examination</h3>
              </div>

              {/* Agent Nodes */}
              <div className="space-y-3">
                {[
                  { name: "Business Strategist", status: "Challenging pricing strategy", color: "bg-purple-500" },
                  { name: "Financial Analyst", status: "Calculating runway impact", color: "bg-emerald-500" },
                  { name: "Principal Architect", status: "Auditing compliance requirements", color: "bg-blue-500" },
                  { name: "Product Owner", status: "Evaluating enterprise SSO friction", color: "bg-amber-500" }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 rounded-[8px] bg-theme-bg-secondary border border-theme-border text-left">
                    <span className={`w-2 h-2 rounded-full ${item.color} animate-pulse`} />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-theme-text-primary">{item.name}</p>
                      <p className="text-xs text-theme-text-secondary">{item.status}</p>
                    </div>
                    <span className="text-xs bg-theme-bg-tertiary px-2.5 py-1 rounded-full text-theme-text-muted">Reviewing</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Visual right side - Collaborative diagram */}
            <div className="w-full md:w-1/2 flex flex-col justify-center items-center py-6 px-4">
              <div className="relative w-64 h-64 flex items-center justify-center">
                {/* Central Node */}
                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex flex-col items-center justify-center p-3 text-center shadow-xl border border-blue-400/30 z-10">
                  <span className="text-xs font-semibold text-blue-200">PROPOSAL</span>
                  <span className="text-sm font-bold text-white leading-tight mt-1">Enterprise Pivot</span>
                </div>

                {/* Satellite Nodes */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border border-purple-500/40 bg-purple-500/10 flex items-center justify-center text-purple-400 shadow-md">
                  <Briefcase size={20} />
                </div>
                <div className="absolute top-1/3 right-0 w-12 h-12 rounded-full border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-center text-emerald-400 shadow-md">
                  <DollarSign size={20} />
                </div>
                <div className="absolute bottom-4 right-8 w-12 h-12 rounded-full border border-blue-500/40 bg-blue-500/10 flex items-center justify-center text-blue-400 shadow-md">
                  <Database size={20} />
                </div>
                <div className="absolute bottom-4 left-8 w-12 h-12 rounded-full border border-amber-500/40 bg-amber-500/10 flex items-center justify-center text-amber-400 shadow-md">
                  <Layers size={20} />
                </div>
                <div className="absolute top-1/3 left-0 w-12 h-12 rounded-full border border-rose-500/40 bg-rose-500/10 flex items-center justify-center text-rose-400 shadow-md">
                  <Code size={20} />
                </div>

                {/* Connecting lines SVG overlay */}
                <svg className="absolute inset-0 w-full h-full text-theme-border/80 pointer-events-none" viewBox="0 0 256 256">
                  <line x1="128" y1="128" x2="128" y2="24" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4" />
                  <line x1="128" y1="128" x2="212" y2="100" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4" />
                  <line x1="128" y1="128" x2="190" y2="210" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4" />
                  <line x1="128" y1="128" x2="66" y2="210" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4" />
                  <line x1="128" y1="128" x2="44" y2="100" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4" />
                </svg>
              </div>
              
              <div className="text-center mt-6">
                <p className="text-sm font-semibold text-theme-text-primary">Consolidated Decision Score</p>
                <div className="flex items-center gap-2 justify-center mt-1 text-amber-400 font-extrabold text-xl">
                  <AlertTriangle size={18} />
                  68 / 100 — Medium Risk
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Problem Section */}
      <section id="features" className="py-24 px-6 bg-theme-bg-secondary border-y border-theme-border transition-colors duration-200">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4 text-theme-text-primary">The Cost of Isolated Decisions</h2>
            <p className="text-lg text-theme-text-secondary">
              In business, the most expensive mistakes are the ones that could have been avoided. Making key product or strategic pivots without cross-examination leads to failure.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-[8px] border border-theme-border bg-theme-bg-card hover:bg-theme-bg-card-hover transition-all duration-150">
              <div className="w-12 h-12 rounded-[8px] bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-6">
                <ShieldAlert size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-theme-text-primary">Execution Blindspots</h3>
              <p className="text-theme-text-secondary leading-relaxed">
                Pivots often fail because technical compliance, engineering constraints, or scaling issues are discovered too late in the implementation cycle.
              </p>
            </div>

            <div className="p-8 rounded-[8px] border border-theme-border bg-theme-bg-card hover:bg-theme-bg-card-hover transition-all duration-150">
              <div className="w-12 h-12 rounded-[8px] bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-6">
                <DollarSign size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-theme-text-primary">Financial Oversights</h3>
              <p className="text-theme-text-secondary leading-relaxed">
                Strategic moves like shifting to enterprise contracts can spike Customer Acquisition Cost (CAC) and drain cash reserves faster than anticipated.
              </p>
            </div>

            <div className="p-8 rounded-[8px] border border-theme-border bg-theme-bg-card hover:bg-theme-bg-card-hover transition-all duration-150">
              <div className="w-12 h-12 rounded-[8px] bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-6">
                <UserCheck size={24} />
              </div>
              <h3 className="text-xl font-bold mb-3 text-theme-text-primary">Confirmation Bias</h3>
              <p className="text-theme-text-secondary leading-relaxed">
                Leadership teams often run with exciting ideas without an objective, multi-disciplinary review to challenge underlying operational assumptions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. AI Advisory Board Section */}
      <section id="board" className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4 text-theme-text-primary">Your AI Advisory Board</h2>
          <p className="text-lg text-theme-text-secondary">
            Meet the specialized expert agents that instantly analyze your proposals from every angle.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {agentBoard.map((agent, index) => {
            const Icon = agent.icon;
            return (
              <div 
                key={index} 
                className="p-6 rounded-[8px] border border-theme-border bg-theme-bg-card flex flex-col justify-between hover:bg-theme-bg-card-hover hover:border-theme-text-muted transition-all duration-150"
              >
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`p-2.5 rounded-[8px] border ${agent.color}`}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-theme-text-primary">{agent.role}</h3>
                      <p className="text-xs text-theme-text-secondary">Agent: {agent.name}</p>
                    </div>
                  </div>
                  <p className="text-sm text-theme-text-secondary mb-6 leading-relaxed">
                    {agent.description}
                  </p>
                </div>
                <div className="pt-4 border-t border-theme-border">
                  <p className="text-xs font-semibold text-theme-text-muted uppercase tracking-wider mb-2">Signature Critique Focus</p>
                  <p className="text-xs italic text-theme-text-secondary font-medium bg-theme-bg-secondary p-3 rounded-[8px] border border-theme-border">
                    "{agent.quote}"
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. How It Works */}
      <section id="how-it-works" className="py-24 px-6 bg-theme-bg-secondary border-y border-theme-border transition-colors duration-200">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4 text-theme-text-primary">How Hathap Works</h2>
            <p className="text-lg text-theme-text-secondary">
              Go from a raw idea to a comprehensive risk analysis in three simple steps.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12 relative">
            {[
              {
                step: "01",
                title: "Define the Decision",
                desc: "Input your proposal, background data, target audience, and key business constraints into the platform."
              },
              {
                step: "02",
                title: "AI Advisory Debate",
                desc: "The expert agents cross-examine your idea, challenge each other's parameters, and highlight hidden risks."
              },
              {
                step: "03",
                title: "Access Decision Report",
                desc: "Receive a consolidated risk score, consensus verdict, individual critiques, and concrete action items."
              }
            ].map((step, idx) => (
              <div key={idx} className="relative space-y-4">
                <span className="text-5xl font-extrabold bg-gradient-to-b from-blue-500/40 to-transparent bg-clip-text text-transparent">{step.step}</span>
                <h3 className="text-xl font-bold text-theme-text-primary">{step.title}</h3>
                <p className="text-theme-text-secondary leading-relaxed text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Static Example Discussion */}
      <section id="discussion" className="py-24 px-6 max-w-5xl mx-auto">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest bg-blue-500/5 px-3 py-1.5 rounded-full border border-blue-500/20">Case Study</span>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mt-4 mb-4 text-theme-text-primary">See a Discussion in Action</h2>
          <p className="text-lg text-theme-text-secondary">
            A realistic look at how Hathap agents analyze a pivotal startup business decision.
          </p>
        </div>

        {/* Outer Frame */}
        <div className="rounded-[8px] border border-theme-border bg-theme-bg-card shadow-xl overflow-hidden">
          
          {/* Header Panel */}
          <div className="bg-theme-bg-secondary px-6 py-4 border-b border-theme-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3.5 h-3.5 rounded-full bg-amber-500/20 border border-amber-600 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              </div>
              <span className="text-sm font-semibold text-theme-text-primary">Discussion #1042 — PLG vs. Enterprise Sales Pivot</span>
            </div>
            <span className="text-xs bg-theme-bg-tertiary border border-theme-border text-theme-text-muted px-2.5 py-1 rounded-full">Static View</span>
          </div>

          {/* Proposal Details */}
          <div className="p-6 border-b border-theme-border bg-theme-bg-primary text-left">
            <p className="text-xs font-bold text-theme-text-muted uppercase tracking-wider mb-2">Initial Proposal from Founder & CEO</p>
            <h3 className="text-lg font-bold mb-2 text-theme-text-primary">Pivot entirely from self-serve PLG to an enterprise sales-led model</h3>
            <p className="text-sm text-theme-text-secondary leading-relaxed">
              "We have hit a growth plateau on our self-serve $29/month plan. We are considering retiring the self-serve subscription plan entirely to focus on signing enterprise clients with contracts starting at $20k/year. We plan to hire an outbound sales team immediately to accelerate outbound lead generation."
            </p>
          </div>

          {/* Agent Debate Responses */}
          <div className="p-6 space-y-6 text-left">
            <p className="text-xs font-bold text-theme-text-muted uppercase tracking-wider">Expert Feedback & Critique</p>
            
            {/* 1. Business Strategist */}
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-[8px] border border-purple-500/30 bg-purple-500/10 flex items-center justify-center text-purple-400 flex-shrink-0">
                <Briefcase size={20} />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-theme-text-primary">Sarah Chen</span>
                  <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded-full font-semibold">Business Strategist</span>
                </div>
                <p className="text-sm text-theme-text-secondary leading-relaxed">
                  "The TAM is definitely present, but a total pivot threatens our overall momentum. A hybrid model (Product-Led Sales) mitigates this risk. Pure enterprise transitions fail when self-serve signs are cut off before the enterprise outbound engine achieves repeatable metrics."
                </p>
              </div>
            </div>

            {/* 2. Financial Analyst */}
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-[8px] border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <DollarSign size={20} />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-theme-text-primary">David Vance</span>
                  <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">Financial Analyst</span>
                </div>
                <p className="text-sm text-theme-text-secondary leading-relaxed">
                  "Our current CAC is $45 with an LTV of $350. An enterprise model will spike CAC to $8,000+ for sales commissions, requiring a minimum contract value of $24,000 to maintain a 3:1 LTV:CAC ratio. We need 9 months of runway just to cover the cash-flow gap of the sales cycle."
                </p>
              </div>
            </div>

            {/* 3. Product Owner */}
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-[8px] border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0">
                <Layers size={20} />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-theme-text-primary">Elena Rostova</span>
                  <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">Product Owner</span>
                </div>
                <p className="text-sm text-theme-text-secondary leading-relaxed">
                  "Enterprise buyers expect self-serve SSO, RBAC, and audit logs on day one. Our current product is built for single users. We must allocate at least 2 quarters to developer-platform readiness before sales reps can promise delivery."
                </p>
              </div>
            </div>

            {/* 4. Principal Architect */}
            <div className="flex gap-4">
              <div className="w-10 h-10 rounded-[8px] border border-blue-500/30 bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0">
                <Database size={20} />
              </div>
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-theme-text-primary">Marcus Brody</span>
                  <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-semibold">Principal Architect</span>
                </div>
                <p className="text-sm text-theme-text-secondary leading-relaxed">
                  "From an infrastructure standpoint, enterprise contracts require dedicated VPCs or strict data isolation (tenant isolation). Moving away from our shared multi-tenant database to meet SOC 2 Type II compliance will require a database schema overhaul. We should support custom data residency."
                </p>
              </div>
            </div>
          </div>

          {/* Decision Report summary */}
          <div className="p-6 bg-theme-bg-secondary border-t border-theme-border text-left">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h4 className="font-bold text-base flex items-center gap-2 text-amber-500">
                  <AlertTriangle size={18} />
                  Consensus: Hybrid PLS Recommended (Medium Risk)
                </h4>
                <p className="text-xs text-theme-text-secondary mt-1">
                  Overall Score: 68/100. Retaining self-serve as a lead magnet reduces cash flow drain.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="px-4 py-2 border border-theme-border rounded-[8px] bg-theme-bg-primary text-xs font-semibold text-theme-text-primary">
                  Risk Level: 68%
                </div>
                <div className="px-4 py-2 bg-blue-600 text-white rounded-[8px] text-xs font-bold flex items-center gap-1.5">
                  <FileText size={14} />
                  Download Report
                </div>
              </div>
            </div>

            {/* Action Items List */}
            <div className="mt-4 p-4 rounded-[8px] border border-theme-border bg-theme-bg-primary space-y-2">
              <span className="text-xs font-bold text-theme-text-muted uppercase tracking-wider">Structured Action Items</span>
              <div className="grid sm:grid-cols-2 gap-3 mt-1.5">
                <div className="flex items-start gap-2 text-xs text-theme-text-secondary">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Implement enterprise features (SSO, SOC 2) in parallel.</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-theme-text-secondary">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Test a $10k/yr 'Team Plan' before hiring sales reps.</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-theme-text-secondary">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Maintain PLG funnel to feed warm leads to sales.</span>
                </div>
                <div className="flex items-start gap-2 text-xs text-theme-text-secondary">
                  <CheckCircle2 size={14} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                  <span>Set 9-month budget buffer for outbound validation.</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* 7. Benefits Section */}
      <section className="py-24 px-6 bg-theme-bg-secondary border-y border-theme-border transition-colors duration-200">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4 text-theme-text-primary">Why Strategic Teams Choose Hathap</h2>
            <p className="text-lg text-theme-text-secondary">
              Accelerate decision speed and eliminate costly alignment meetings.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="p-8 rounded-[8px] border border-theme-border bg-theme-bg-card flex gap-4">
              <div className="w-12 h-12 rounded-[8px] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2 text-theme-text-primary">Accelerated Alignment</h3>
                <p className="text-theme-text-secondary leading-relaxed text-sm">
                  Align product roadmap priorities, engineering constraints, and financial resources in hours rather than waiting for bi-weekly steering meetings.
                </p>
              </div>
            </div>

            <div className="p-8 rounded-[8px] border border-theme-border bg-theme-bg-card flex gap-4">
              <div className="w-12 h-12 rounded-[8px] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2 text-theme-text-primary">Unmatched Risk Reduction</h3>
                <p className="text-theme-text-secondary leading-relaxed text-sm">
                  Surface critical system compatibility gaps, data privacy leaks, and budget runway drains before committing engineers or marketing capital.
                </p>
              </div>
            </div>

            <div className="p-8 rounded-[8px] border border-theme-border bg-theme-bg-card flex gap-4">
              <div className="w-12 h-12 rounded-[8px] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                <UserCheck size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2 text-theme-text-primary">Objective, Unbiased Reviews</h3>
                <p className="text-theme-text-secondary leading-relaxed text-sm">
                  Our specialized expert agents do not have egos or workplace politics. They evaluate parameters purely based on data, logic, and operational feasibility.
                </p>
              </div>
            </div>

            <div className="p-8 rounded-[8px] border border-theme-border bg-theme-bg-card flex gap-4">
              <div className="w-12 h-12 rounded-[8px] bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 flex-shrink-0">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2 text-theme-text-primary">Systematic Decision Auditing</h3>
                <p className="text-theme-text-secondary leading-relaxed text-sm">
                  Maintain an immutable, clear record of all strategic proposals, critique history, and resolved trade-offs for compliance audits and new hires.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. FAQ Section */}
      <section id="faq" className="py-24 px-6 max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4 text-theme-text-primary">Frequently Asked Questions</h2>
          <p className="text-lg text-theme-text-secondary">
            Find answers to common questions about the Hathap collaborative intelligence platform.
          </p>
        </div>

        <div className="space-y-4">
          {faqData.map((faq, idx) => {
            const isOpen = activeFaq === idx;
            return (
              <div 
                key={idx} 
                className="border border-theme-border rounded-[8px] bg-theme-bg-card overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => setActiveFaq(isOpen ? null : idx)}
                  className="w-full text-left px-6 py-5 flex justify-between items-center font-bold text-base md:text-lg hover:bg-theme-bg-secondary/50 transition-colors text-theme-text-primary"
                >
                  <span>{faq.q}</span>
                  {isOpen ? <ChevronUp size={20} className="text-theme-text-muted" /> : <ChevronDown size={20} className="text-theme-text-muted" />}
                </button>
                {isOpen && (
                  <div className="px-6 pb-6 pt-2 text-sm md:text-base text-theme-text-secondary leading-relaxed border-t border-theme-border bg-theme-bg-primary">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 9. Final CTA */}
      <section className="py-24 px-6 max-w-6xl mx-auto">
        <div className="relative rounded-[8px] border cta-gradient-box px-6 py-16 md:py-24 text-center overflow-hidden shadow-2xl">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/15 rounded-full blur-[80px] pointer-events-none -z-10" />
          
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-6 max-w-3xl mx-auto leading-tight text-theme-text-primary">
            Make Your Next Strategic Move with Confidence
          </h2>
          <p className="text-lg text-theme-text-secondary max-w-2xl mx-auto leading-relaxed mb-10">
            Stop guessing. Run your critical project blueprints, pricing models, and architectures through Hathap's objective, multi-agent critique boards today.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
            <button 
              onClick={() => navigate('/signup')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-4 rounded-[8px] shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              Start Free Discussion
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </section>

      {/* 10. Footer */}
      <footer className="border-t border-theme-border bg-theme-bg-primary py-12 px-6 transition-colors duration-200">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-sm text-theme-text-secondary">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-[8px] flex items-center justify-center">
              <Gavel size={18} className="text-white" />
            </div>
            <span className="font-bold tracking-tight text-theme-text-primary">Hathap.AI</span>
          </div>

          <div className="flex flex-wrap justify-center gap-8 font-medium">
            <a href="#features" className="hover:text-theme-text-primary transition-colors">Features</a>
            <a href="#board" className="hover:text-theme-text-primary transition-colors">Board</a>
            <a href="#how-it-works" className="hover:text-theme-text-primary transition-colors">How It Works</a>
            <a href="#discussion" className="hover:text-theme-text-primary transition-colors">Example</a>
          </div>

          <div className="text-xs text-theme-text-muted">
            &copy; {new Date().getFullYear()} Hathap AI, Inc. All rights reserved.
          </div>
        </div>
      </footer>

    </div>
  );
};
