import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Lightbulb, AlertTriangle } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Layout, Container } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, TextArea, Select } from '../components/ui/Input';
import { useApp } from '../context/AppContext';
import { PlanningMode, RoutingMode } from '../types';

const STARTER_PROMPTS = [
  {
    title: 'Adopt or pass on a new tool',
    objective:
      'Should our team adopt CRM software over the next quarter, and if so, which rollout path minimizes disruption to our existing sales workflow?',
    context:
      'We are a 40-person team. Two options are on the table: adopt a cloud CRM in a staged rollout, or postpone for six months.',
  },
  {
    title: 'Evaluate a strategic decision',
    objective:
      'Should we expand into the European market this year, or focus on strengthening our domestic share first?',
    context:
      'Budget and headcount are limited; expansion carries regulatory and hiring risks.',
  },
  {
    title: 'Prioritize a fix',
    objective:
      'Which of our two reported production issues should we fix first: the checkout latency regression or the intermittent auth failures?',
    context:
      'Both are customer-facing, but we only have capacity to ship one fix this sprint.',
  },
];

const DEFAULT_QUERIES =
  'What are the common failure modes teams report for this type of decision?\nWhat evidence exists for the options under consideration?';

export const CreateDecisionPage: React.FC = () => {
  const navigate = useNavigate();
  const { models, createDecision, showToast } = useApp();

  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [context, setContext] = useState('');
  const [researchQueries, setResearchQueries] = useState('');
  const [planningMode, setPlanningMode] = useState<PlanningMode>('fixed');
  const [routingMode, setRoutingMode] = useState<RoutingMode>('auto');
  const [routingModelId, setRoutingModelId] = useState('');
  const [verificationEnabled, setVerificationEnabled] = useState(true);
  const [errors, setErrors] = useState<{ title?: string; objective?: string }>({});
  const [isCreating, setIsCreating] = useState(false);

  const readyModels = useMemo(
    () => models.filter((m) => m.hasApiKey && m.enabled !== false),
    [models]
  );
  const needsModel = readyModels.length === 0;

  const fillStarter = (starter: (typeof STARTER_PROMPTS)[number]) => {
    setTitle(starter.title);
    setObjective(starter.objective);
    setContext(starter.context);
    setResearchQueries(DEFAULT_QUERIES);
    setErrors({});
  };

  const handleCreate = async () => {
    const nextErrors: { title?: string; objective?: string } = {};
    if (!title.trim()) nextErrors.title = 'A title is required.';
    if (!objective.trim()) nextErrors.objective = 'An objective is required — tell Hathap what you want decided.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (needsModel) {
      showToast('warning', 'Connect an API key first — the decision engine needs a model to run.');
      return;
    }

    setIsCreating(true);
    try {
      const queries = researchQueries
        .split('\n')
        .map((q) => q.trim())
        .filter(Boolean)
        .slice(0, 5)
        .map((query) => ({ query }));
      const decision = await createDecision({
        title: title.trim(),
        objective: objective.trim(),
        context: context.trim() || undefined,
        configuration: {
          verificationEnabled,
          maxRounds: 3,
        },
      });
      showToast('success', 'Decision created — starting the engine…');
      // Hand execution settings to the detail page, which auto-starts on load.
      sessionStorage.setItem(
        'hathap_pending_start',
        JSON.stringify({ researchQueries: queries, planningMode, routingMode, routingModelId })
      );
      navigate(`/decisions/${decision.id}?autostart=1`);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to create decision');
      setIsCreating(false);
    }
  };

  return (
    <Layout>
      <Header />
      <Container>
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate('/decisions')}
            className="p-2 hover:bg-theme-bg-secondary transition-colors text-theme-text-secondary"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-theme-text-primary">Create a Decision</h1>
            <p className="text-theme-text-secondary text-sm">
              Define a problem, then run the research + multi-agent debate engine on it.
            </p>
          </div>
        </div>

        {needsModel && (
          <Card className="border-amber-500/40 mb-6">
            <CardBody className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <AlertTriangle size={20} className="text-amber-400 shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-theme-text-primary">
                  You need a connected model to run decisions
                </p>
                <p className="text-sm text-theme-text-secondary">
                  The decision engine routes research and debate tasks to your models. Add an API key
                  before creating a decision.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => navigate('/models')}>
                Manage Models
              </Button>
            </CardBody>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Problem</h2>
              </CardHeader>
              <CardBody>
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Should we adopt CRM software this quarter?"
                    disabled={isCreating}
                  />
                  {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Objective</label>
                  <TextArea
                    rows={4}
                    value={objective}
                    onChange={(e) => setObjective(e.target.value)}
                    placeholder="What decision do you need made, and what outcome are you aiming for?"
                    disabled={isCreating}
                  />
                  {errors.objective && (
                    <p className="text-red-400 text-xs mt-1">{errors.objective}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Context (optional)</label>
                  <TextArea
                    rows={3}
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Constraints, budgets, stakeholders, or background the debate should consider."
                    disabled={isCreating}
                  />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Execution Settings</h2>
              </CardHeader>
              <CardBody>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Research queries (one per line, optional)
                  </label>
                  <TextArea
                    rows={4}
                    value={researchQueries}
                    onChange={(e) => setResearchQueries(e.target.value)}
                    placeholder="What external evidence should the engine gather before debating?"
                    disabled={isCreating}
                  />
                  <p className="text-xs text-theme-text-secondary mt-1">
                    Without queries the engine debates from context alone — add queries to ground it in evidence.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Planning mode</label>
                    <Select
                      value={planningMode}
                      onChange={(e) => setPlanningMode(e.target.value as PlanningMode)}
                      disabled={isCreating}
                    >
                      <option value="fixed">Fixed pipeline</option>
                      <option value="intelligent">Intelligent planning</option>
                    </Select>
                    <p className="text-xs text-theme-text-secondary mt-1">
                      Intelligent planning uses a model to design the task graph first.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Routing</label>
                    <Select
                      value={routingMode}
                      onChange={(e) => setRoutingMode(e.target.value as RoutingMode)}
                      disabled={isCreating}
                    >
                      <option value="auto">Auto routing</option>
                      <option value="manual">Manual model</option>
                    </Select>
                    {routingMode === 'manual' && (
                      <Select
                        className="mt-2"
                        value={routingModelId}
                        onChange={(e) => setRoutingModelId(e.target.value)}
                        disabled={isCreating}
                      >
                        <option value="">Select a model…</option>
                        {readyModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.displayName} ({m.provider})
                          </option>
                        ))}
                      </Select>
                    )}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={verificationEnabled}
                    onChange={(e) => setVerificationEnabled(e.target.checked)}
                    disabled={isCreating}
                    className="accent-sky-500"
                  />
                  Verify claims against retrieved evidence
                </label>
              </CardBody>
              <CardFooter>
                <Button onClick={handleCreate} isLoading={isCreating} disabled={isCreating}>
                  Create Decision
                </Button>
                <Button variant="ghost" onClick={() => navigate('/decisions')} disabled={isCreating}>
                  Cancel
                </Button>
              </CardFooter>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Lightbulb size={18} className="text-amber-400" /> Starter prompts
                </h2>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-theme-text-secondary">
                  Not sure what to decide? Pick a starter to see the flow end-to-end. Results are
                  computed live from your models — nothing is pre-filled or fabricated.
                </p>
                <div className="space-y-2">
                  {STARTER_PROMPTS.map((s) => (
                    <button
                      key={s.title}
                      className="w-full text-left p-3 rounded border border-theme-border hover:border-sky-600 transition-colors"
                      onClick={() => fillStarter(s)}
                    >
                      <span className="font-medium text-theme-text-primary">{s.title}</span>
                    </button>
                  ))}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Connected models</h2>
              </CardHeader>
              <CardBody>
                {readyModels.length === 0 ? (
                  <p className="text-sm text-theme-text-secondary">
                    No connected models yet.{' '}
                    <Link to="/models" className="text-sky-400 underline">
                      Add one
                    </Link>{' '}
                    to run decisions.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {readyModels.slice(0, 5).map((m) => (
                      <li key={m.id} className="flex items-center justify-between text-sm">
                        <span className="text-theme-text-primary">{m.displayName}</span>
                        <span className="text-theme-text-secondary">{m.provider}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      </Container>
    </Layout>
  );
};

export default CreateDecisionPage;