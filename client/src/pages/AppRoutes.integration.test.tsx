import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

// Mirrors the guard wiring in App.tsx, including the pending branch: a guard
// that redirects while session validation is in flight would bounce the user off
// a deep link and back, which is the exact regression this file guards.
const SessionPending: React.FC = () => <div>Checking session</div>;

const ProtectedRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, status } = useAuth();
  if (status === 'loading') return <SessionPending />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const LoggedInRoute: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, status } = useAuth();
  if (status === 'loading') return <SessionPending />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
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

const storedProfile = { id: 'u1', email: 'analyst@hathap.ai', name: 'Analyst' };

/** Seeds storage as a returning visitor whose credential the server accepts. */
function seedStoredSession(token = 'jwt-123') {
  localStorage.setItem('hathap_token', token);
  localStorage.setItem('hathap_user', JSON.stringify(storedProfile));
}

/** Response for the startup session-validation request. */
function sessionCheckResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return { ...jsonResponse(storedProfile), ...overrides };
}

function mockCollections(
  models: unknown[],
  agents: unknown[],
  courtrooms: unknown[],
  options: { researchStatus?: HttpResponse; sessionCheck?: HttpResponse } = {}
) {
  fetchMock.mockImplementation((input: any, init?: any) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) {
      return Promise.resolve(options.sessionCheck ?? sessionCheckResponse());
    }
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

function mockDecisionDetail(
  id: string,
  decision: unknown,
  snapshot: HttpResponse,
  extra: Record<string, unknown> = {},
  sessionCheck: HttpResponse = sessionCheckResponse()
) {
  fetchMock.mockImplementation((input: any) => {
    const url = String(input);
    if (url.endsWith('/api/auth/me')) return Promise.resolve(sessionCheck);
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

  it('deep-links into a decision detail route without bouncing through the login page', async () => {
    seedStoredSession();
    mockDecisionDetail('dec-3', { ...completedDecision, _id: 'dec-3' }, jsonResponse(completedSnapshot));
    renderApp('/decisions/dec-3');

    // A stored session must be known on the first render. If the app briefly
    // looked signed out, the guard would redirect to /login and then, once the
    // token appeared, bounce to /dashboard instead of the deep link.
    expect(await screen.findByRole('heading', { name: 'Hire a Senior Engineer' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument();
  });

  it('waits on the pending state instead of redirecting while the session is validated', async () => {
    seedStoredSession();
    // A validation response the test releases by hand, so the pending branch is
    // observable rather than a race against a resolved promise. Every other
    // endpoint is served by the shared decision-detail mock, so the page behind
    // the guard is the same one the other deep-link test asserts on.
    let releaseCheck: () => void = () => {};
    const checkGate = new Promise<void>((resolve) => {
      releaseCheck = resolve;
    });
    const gatedSessionCheck: HttpResponse = {
      ok: true,
      status: 200,
      json: () => checkGate.then(() => storedProfile),
    };

    mockDecisionDetail(
      'dec-9',
      { ...completedDecision, _id: 'dec-9' },
      jsonResponse(completedSnapshot),
      {},
      gatedSessionCheck
    );

    renderApp('/decisions/dec-9');

    // The credential exists but has not been verified yet. The guard must hold
    // its ground: redirecting here is precisely what produces the login bounce.
    expect(screen.getByText('Checking session')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument();

    releaseCheck();

    // Once verified, the deep link resolves normally with no intermediate login
    // visit and no reload.
    expect(await screen.findByRole('heading', { name: 'Hire a Senior Engineer' })).toBeInTheDocument();
    expect(screen.queryByText('Checking session')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument();
  });

  it('lands on the login page when validation rejects the stored credential', async () => {
    seedStoredSession('expired-token');
    mockCollections([], [], [], { sessionCheck: jsonResponse({ error: 'Unauthorized' }, false, 401) });
    renderApp('/dashboard');

    // An expired credential must never present the authenticated shell, and the
    // sign-out must clear the cached profile with the credential.
    expect(await screen.findByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('hathap_token')).toBeNull());
    expect(localStorage.getItem('hathap_user')).toBeNull();

    // No retry loop: the rejected credential is asked about exactly once.
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/auth/me')).length).toBe(1)
    );
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  });

  it('keeps a protected route usable when validation cannot reach the server', async () => {
    seedStoredSession();
    mockCollections([{ ...baseModel, _id: 'm1' }], [], [], {
      sessionCheck: jsonResponse({ error: 'Authentication service unavailable.' }, false, 500),
    });
    renderApp('/dashboard');

    // An outage is not a verdict. Signing out on one would discard a valid
    // session every time the server hiccups.
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(localStorage.getItem('hathap_token')).toBe('jwt-123');
  });

  it('signs the device out and returns to login when an authenticated request is rejected', async () => {
    seedStoredSession('stale-token');
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.endsWith('/api/auth/me')) return Promise.resolve(sessionCheckResponse());
      if (url.endsWith('/api/models')) {
        return Promise.resolve(jsonResponse({ error: 'Unauthorized.' }, false, 401));
      }
      if (url.endsWith('/api/decisions')) return Promise.resolve(jsonResponse([]));
      if (url.endsWith('/api/research/status')) return Promise.resolve(mockResearchStatus());
      return Promise.resolve(jsonResponse({}));
    });
    renderApp('/dashboard');

    expect(await screen.findByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(localStorage.getItem('hathap_token')).toBeNull();
    expect(localStorage.getItem('hathap_user')).toBeNull();

    // No redirect loop: the rejected credential is not resent, so the app
    // settles on the login page instead of cycling between routes.
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/models')).length
      ).toBe(1)
    );
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
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