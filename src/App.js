import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
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
import { ProfilePage } from './pages/ProfilePage';
import './index.css';
const ProtectedRoute = ({ children }) => {
    const auth = useAuth();
    if (!auth?.token)
        return _jsx(Navigate, { to: "/login", replace: true });
    return _jsx(_Fragment, { children: children });
};
export const App = () => {
    return (_jsx(ThemeProvider, { children: _jsx(AuthProvider, { children: _jsx(BrowserRouter, { children: _jsx(AppProvider, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(LandingPage, {}) }), _jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsx(Route, { path: "/signup", element: _jsx(SignupPage, {}) }), _jsx(Route, { path: "/dashboard", element: _jsx(ProtectedRoute, { children: _jsx(DashboardPage, {}) }) }), _jsx(Route, { path: "/models", element: _jsx(ProtectedRoute, { children: _jsx(ModelsPage, {}) }) }), _jsx(Route, { path: "/agents", element: _jsx(ProtectedRoute, { children: _jsx(AgentsPage, {}) }) }), _jsx(Route, { path: "/courtrooms", element: _jsx(ProtectedRoute, { children: _jsx(CourtroomsPage, {}) }) }), _jsx(Route, { path: "/courtrooms/new", element: _jsx(ProtectedRoute, { children: _jsx(CreateCourtroomPage, {}) }) }), _jsx(Route, { path: "/courtrooms/:id", element: _jsx(ProtectedRoute, { children: _jsx(CourtroomDetailPage, {}) }) }), _jsx(Route, { path: "/profile", element: _jsx(ProtectedRoute, { children: _jsx(ProfilePage, {}) }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/dashboard", replace: true }) })] }) }) }) }) }));
};
export default App;
