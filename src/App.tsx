import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ModelsPage } from './pages/ModelsPage';
import { AgentsPage } from './pages/AgentsPage';
import { CourtroomsPage } from './pages/CourtroomsPage';
import { CourtroomDetailPage } from './pages/CourtroomDetailPage';
import { CreateCourtroomPage } from './pages/CreateCourtroomPage';
import './index.css';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated] = useState(true);

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<LoginPage />} />
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
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  );
};

export default App;
