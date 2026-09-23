import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactNode } from 'react';
import { AppProvider } from '../context/AppContext';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import { DashboardPage } from './DashboardPage';
import { DecisionDetailPage } from './DecisionDetailPage';
import { DecisionsPage } from './DecisionsPage';
import { LoginPage } from './LoginPage';

const fetchMock = vi.fn();

interface HttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function jsonResponse(body: unknown, ok = true, status = 200): HttpResponse {
  return { ok, status, json: async () => body };
}

const mockResearchStatus = () =>
  jsonResponse({ provider: 'mock', real: false, mock: true, configured: false, mode: 'mock' });

// Mirrors the guard wiring in App.tsx.
const ProtectedRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useAuth();
  if (!auth?.token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const LoggedInRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useAuth();
  if (auth?.token) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

function renderApp(initialPath: string) {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/login" element={<LoggedInRoute><LoginPage /></LoggedInRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/onboarding" element={<ProtectedRoute><div>Onboarding protected page</div></ProtectedRoute>} />
              <Route path="/decisions" element={<ProtectedRoute><DecisionsPage /></ProtectedRoute>} />
              <Route path="/decisions/:id" element={<ProtectedRoute><DecisionDetailPage /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </MemoryRouter>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function mockCollections(
  models: unknown[],
  agents: unknown[],
  courtrooms: unknown[],
  options: { researchStatus?: HttpResponse } = {}
) {
  fetchMock.mockImplementation((input: any, init?: any) => {
    const url = String(input);
    if (init?.method === 'POST' && url.endsWith('/api/auth/login')) {
      return Promise.resolve(
        jsonResponse({ token: 'jwt-login', user: { id: 'u1', email: 'analyst@hathap.ai', name: 'Analyst' } })
      );
    }
    if (url.endsWith('/api/models')) return Promise.resolve(jsonResponse(models));
    if (url.endsWith('/api/agents')) return Promise.resolve(jsonResponse(agents));
    if (url.endsWith('/api/courtrooms')) return Promise.resolve(jsonResponse(courtrooms));
    if (url.endsWith('/api/research/status')) return Promise.resolve(options.researchStatus ?? mockResearchStatus());
    return Promise.resolve(jsonResponse({}));
  });
}

const baseModel = {
  provider: 'OpenAI',
  displayName: 'GPT-4o',
  modelName: 'gpt-4o',
  baseUrl: '',
  status: 'connected',
  enabled: true,
  hasApiKey: true,
};

const completedDecision = {
  _id: 'dec-1',
  title: 'Hire a Senior Engineer',
  objective: 'Evaluate candidates for the open senior engineering role',
  status: 'completed',
  confidence: 0.82,
  context: '',
  createdAt: '2026-01-15T10:00:00.000Z',
};

const completedSnapshot = {
  status: 'completed',
  confidence: 0.82,
  claims: [],
  evidence: [],
  evidenceRelationships: [],
  verifications: [],
  redTeamFindings: [],
  reconciliation: null,
  tasks: [],
  executions: [],
};

function mockDecisionDetail(id: string, decision: unknown, snapshot: HttpResponse, extra: Record<string, unknown> = {}) {
  fetchMock.mockImplementation((input: any) => {
    const url = String(input);
    if (url.endsWith(`/api/decisions/${id}/snapshot`)) return Promise.resolve(snapshot);
    if (url.endsWith(`/api/decisions/${id}/research`)) return Promise.resolve(jsonResponse([]));
    if (url.endsWith(`/api/decisions/${id}/plans`)) return Promise.resolve(jsonResponse([]));
    if (url.endsWith(`/api/decisions/${id}/events`)) return Promise.resolve(jsonResponse([]));
    if (url.endsWith(`/api/decisions/${id}/memory`)) return Promise.resolve(jsonResponse({ memory: null, quality: null }));
    if (url.endsWith(`/api/decisions/${id}/outcomes`)) {
      return Promise.resolve(jsonResponse({ outcomes: [], expectedVsActual: { metricComparisons: [], qualityComputed: false } }));
    }
    if (url.endsWith(`/api/decisions/${id}/feedback`)) return Promise.resolve(jsonResponse(null));
    if (url.endsWith(`/api/decisions/${id}/lessons`)) return Promise.resolve(jsonResponse([]));
    if (url.endsWith(`/api/decisions/${id}/related`)) return Promise.resolve(jsonResponse([]));
    if (url.endsWith(`/api/decisions/${id}`)) return Promise.resolve(jsonResponse(decision));
    if (url.endsWith('/api/models')) return Promise.resolve(jsonResponse(extra.models ?? []));
    if (url.endsWith('/api/agents')) return Promise.resolve(jsonResponse([]));
    if (url.endsWith('/api/courtrooms')) return Promise.resolve(jsonResponse([]));
    if (url.endsWith('/api/research/status')) return Promise.resolve(mockResearchStatus());
    return Promise.resolve(jsonResponse({}));
  });
}

describe('App page-flow integration', () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends an unauthenticated user visiting a protected route to the login page', async () => {
    mockCollections([], [], []);
    renderApp('/dashboard');

    expect(await screen.findByText('Hathap.AI')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In/i })).toBeInTheDocument();
    expect(screen.queryByText(/Manage your courtrooms, models, and agents/)).not.toBeInTheDocument();
  });

  it('submits the login form, stores the session, and lands on the dashboard', async () => {
    mockCollections([{ ...baseModel, _id: 'm1' }], [], []);
    renderApp('/login');

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'analyst@hathap.ai' } });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: 's3cret' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('Web-grounded research')).toBeInTheDocument();
    expect(screen.getByText('Mock (labeled)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Courtroom/i })).toBeInTheDocument();
    expect(localStorage.getItem('hathap_token')).toBe('jwt-login');
    expect(screen.queryByRole('button', { name: /Sign In/i })).not.toBeInTheDocument();

    const loginCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/api/auth/login'));
    expect(loginCall).toBeTruthy();
    expect(loginCall?.[1]?.method).toBe('POST');
    expect(JSON.parse(loginCall?.[1]?.body ?? '{}')).toMatchObject({ email: 'analyst@hathap.ai', password: 's3cret' });
  });

  it('restores an existing session and renders dashboard data fetched from the API', async () => {
    localStorage.setItem('hathap_token', 'jwt-123');
    localStorage.setItem('hathap_user', JSON.stringify({ id: 'u1', email: 'analyst@hathap.ai', name: 'Analyst' }));
    mockCollections(
      [
        { ...baseModel, _id: 'm1' },
        { _id: 'm2', provider: 'Anthropic', displayName: 'Claude', modelName: 'claude', baseUrl: '', status: 'disconnected', enabled: true },
      ],
      [{ _id: 'a1', name: 'Devil Advocate' }],
      [
        { _id: 'c1', name: 'Alpha Court', status: 'active', description: 'The alpha courtroom', participants: [], createdAt: '2026-01-10T08:00:00.000Z' },
        { _id: 'c2', name: 'Beta Court', status: 'paused', description: 'The beta courtroom', participants: [], createdAt: '2026-01-11T08:00:00.000Z' },
      ]
    );
    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(await screen.findByText('Web-grounded research')).toBeInTheDocument();

    const overview = screen.getByText('Overview').parentElement as HTMLElement;
    const connected = within(overview).getByText('Connected Models').parentElement as HTMLElement;
    expect(within(connected).getByText('1')).toBeInTheDocument();
    const courtrooms = within(overview).getByText('Total Courtrooms').parentElement as HTMLElement;
    expect(within(courtrooms).getByText('2')).toBeInTheDocument();
    const agents = within(overview).getByText('Agent Templates').parentElement as HTMLElement;
    expect(within(agents).getByText('1')).toBeInTheDocument();

    expect(await screen.findByText('Alpha Court')).toBeInTheDocument();
    expect(screen.getByText('Beta Court')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create Courtroom/i })).toBeInTheDocument();
  });

  it('routes an authenticated user with no configured models from the dashboard to onboarding', async () => {
    localStorage.setItem('hathap_token', 'jwt-123');
    mockCollections([], [], []);
    renderApp('/dashboard');

    expect(await screen.findByText('Onboarding protected page')).toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });

  it('deep-links into a decision detail route, loads the decision, and renders the page', async () => {
    localStorage.setItem('hathap_token', 'jwt-123');
    mockDecisionDetail('dec-1', completedDecision, jsonResponse(completedSnapshot));
    renderApp('/decisions/dec-1');

    expect(await screen.findByRole('heading', { name: 'Hire a Senior Engineer' })).toBeInTheDocument();
    expect(screen.getByText(/Evaluate candidates for the open senior engineering role/i)).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('Executive Summary')).toBeInTheDocument();
    expect(screen.getByText('Export Report')).toBeInTheDocument();
    expect(screen.getByText('Copy Report')).toBeInTheDocument();
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
    expect(screen.queryByText('Live updates')).not.toBeInTheDocument();

    const deepLinkCall = fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/decisions/dec-1'));
    expect(deepLinkCall).toBe(true);
  });

  it('shows an error state with back navigation when the decision snapshot fails to load', async () => {
    localStorage.setItem('hathap_token', 'jwt-123');
    mockDecisionDetail('dec-2', { ...completedDecision, _id: 'dec-2', title: 'Broken Science' }, jsonResponse({ error: 'Snapshot unavailable' }, false));
    renderApp('/decisions/dec-2');

    expect(await screen.findByText('Snapshot unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to Decisions/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back to Decisions/i }));

    // fetchDecision populated the context, so the decisions list shows the decision.
    expect(await screen.findByRole('heading', { name: 'Broken Science' })).toBeInTheDocument();
  });
});