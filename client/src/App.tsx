import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { EvaluationProvider } from './context/EvaluationContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ModelsPage } from './pages/ModelsPage';
import { AgentsPage } from './pages/AgentsPage';
import { CourtroomsPage } from './pages/CourtroomsPage';
import { CourtroomDetailPage } from './pages/CourtroomDetailPage';
import { CreateCourtroomPage } from './pages/CreateCourtroomPage';
import { DecisionsPage } from './pages/DecisionsPage';
import { DecisionDetailPage } from './pages/DecisionDetailPage';
import { CreateDecisionPage } from './pages/CreateDecisionPage';
import { EvaluationPage } from './pages/EvaluationPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfilePage } from './pages/ProfilePage';
import { ToastContainer } from './components/ui/Toast';
import { Loading } from './components/ui/Alert';
import './index.css';

/**
 * Placeholder shown while a stored credential is being verified.
 *
 * Rendering this instead of redirecting is what keeps a page load from
 * bouncing: a guard that redirects while the session is still resolving sends
 * the user to `/login` for a split second and then back again.
 */
const SessionPending: React.FC = () => <Loading message="Checking your session..." />;

/**
 * Gates a route that requires a session.
 *
 * Three outcomes, and the pending one must not navigate:
 *   pending  -> wait; the credential may yet prove valid
 *   anonymous -> no usable credential, go to the login page
 *   otherwise -> render the route
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, status } = useAuth();

  if (status === 'loading') return <SessionPending />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

/**
 * Gates a route that only makes sense while signed out.
 *
 * Symmetrically, it must also wait rather than render the login form for a
 * credential that is still being verified — otherwise a valid session would be
 * shown the login page and then redirected, i.e. the same flicker in reverse.
 */
const LoggedInRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, status } = useAuth();

  if (status === 'loading') return <SessionPending />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppProvider>
            <EvaluationProvider>
              <Routes>
            <Route path="/" element={<LoggedInRoute><LandingPage /></LoggedInRoute>} />
            <Route path="/login" element={<LoggedInRoute><LoginPage /></LoggedInRoute>} />
            <Route path="/signup" element={<LoggedInRoute><SignupPage /></LoggedInRoute>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/models"
              element={
                <ProtectedRoute>
                  <ModelsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agents"
              element={
                <ProtectedRoute>
                  <AgentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courtrooms"
              element={
                <ProtectedRoute>
                  <CourtroomsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courtrooms/new"
              element={
                <ProtectedRoute>
                  <CreateCourtroomPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/courtrooms/:id"
              element={
                <ProtectedRoute>
                  <CourtroomDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/decisions"
              element={
                <ProtectedRoute>
                  <DecisionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/decisions/new"
              element={
                <ProtectedRoute>
                  <CreateDecisionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/decisions/:id"
              element={
                <ProtectedRoute>
                  <DecisionDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/evaluation"
              element={
                <ProtectedRoute>
                  <EvaluationPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            <ToastContainer />
            </EvaluationProvider>
          </AppProvider>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
