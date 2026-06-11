import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { DashboardPage } from './pages/DashboardPage';
import { ModelsPage } from './pages/ModelsPage';
import { AgentsPage } from './pages/AgentsPage';
import { CourtroomsPage } from './pages/CourtroomsPage';
import { CourtroomDetailPage } from './pages/CourtroomDetailPage';
import { CreateCourtroomPage } from './pages/CreateCourtroomPage';
import { ProfilePage } from './pages/ProfilePage';
import './index.css';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();

  if (!auth?.token) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppProvider>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
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
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppProvider>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
