import React, { useState } from 'react';
import { ArrowLeft, Moon, Sun, KeyRound, Download, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

type FormState = 'idle' | 'loading' | 'error' | 'success';

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, changePassword, exportData, deleteAccount, logout } = useAuth();
  const { models, agentTemplates, courtrooms, decisions } = useApp();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwForm, setPwForm] = useState<FormState>('idle');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const [exportState, setExportState] = useState<FormState>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<FormState>('idle');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePhrase, setDeletePhrase] = useState('');

  const handleChangePassword = async () => {
    setPwError(null);
    setPwSuccess(false);
    if (!currentPassword || !newPassword) {
      setPwError('Both current and new password are required.');
      setPwForm('error');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters.');
      setPwForm('error');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('New password confirmation does not match.');
      setPwForm('error');
      return;
    }
    setPwForm('loading');
    try {
      await changePassword(currentPassword, newPassword);
      setPwForm('success');
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      setPwError(e.message || 'Password change failed.');
      setPwForm('error');
    }
  };

  const handleExportData = async () => {
    setExportError(null);
    setExportState('loading');
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hathap-export-${user?.id || 'data'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportState('success');
    } catch (e: any) {
      setExportError(e.message || 'Data export failed.');
      setExportState('error');
    }
  };

  const handleDeleteAccount = async () => {
    if (deletePhrase !== 'DELETE') return;
    setDeleteError(null);
    setDeleteState('loading');
    try {
      await deleteAccount();
      setDeleteConfirmOpen(false);
      logout();
      navigate('/');
    } catch (e: any) {
      setDeleteError(e.message || 'Account deletion failed.');
      setDeleteState('error');
    }
  };

  return (
    <Layout>
      <Header />
      <Container>
        <PageHeader
          title="Profile Settings"
          description="Manage your account and preferences"
          action={
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <ArrowLeft size={18} />
              Back
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-4xl">
          {/* Profile Info */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <h3 className="text-xl font-bold">Account Information</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="flex items-center gap-4 p-4 bg-slate-800 border border-slate-700">
                  <div className="w-14 h-14 rounded-full bg-blue-500/20 border border-blue-600 flex items-center justify-center">
                    <span className="text-xl font-bold text-blue-400">
                      {(user?.name || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                      {user?.name || '—'}
                    </p>
                    <p className="text-sm text-slate-400">{user?.email || '—'}</p>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Change Password */}
            <Card className="mt-6">
              <CardHeader>
                <h3 className="text-xl font-bold">Change Password</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-200">Current Password</label>
                  <Input
                    type="password"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-200">New Password</label>
                  <Input
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-200">Confirm New Password</label>
                  <Input
                    type="password"
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {pwError && <p className="text-sm text-red-400">{pwError}</p>}
                {pwSuccess && <p className="text-sm text-green-400">Password updated successfully.</p>}
              </CardBody>
              <CardFooter>
                <Button
                  onClick={handleChangePassword}
                  className="flex-1 justify-center"
                  isLoading={pwForm === 'loading'}
                  disabled={pwForm === 'loading'}
                >
                  <KeyRound size={18} />
                  Update Password
                </Button>
              </CardFooter>
            </Card>
          </div>

          <div>
            {/* Theme Settings */}
            <Card>
              <CardHeader>
                <h3 className="text-lg font-bold">Theme</h3>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="space-y-3">
                  <div
                    className={`p-4 border cursor-pointer transition-all ${
                      theme === 'dark'
                        ? 'bg-blue-500/20 border-blue-600'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}
                    onClick={() => theme !== 'dark' && toggleTheme()}
                  >
                    <div className="flex items-center gap-3">
                      <Moon size={24} className={theme === 'dark' ? 'text-blue-400' : 'text-slate-400'} />
                      <div>
                        <p className="font-semibold text-slate-100">Dark Mode</p>
                        <p className="text-xs text-slate-400">Professional and comfortable</p>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 border cursor-pointer transition-all ${
                      theme === 'light'
                        ? 'bg-blue-500/20 border-blue-600'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}
                    onClick={() => theme !== 'light' && toggleTheme()}
                  >
                    <div className="flex items-center gap-3">
                      <Sun size={24} className={theme === 'light' ? 'text-blue-400' : 'text-slate-400'} />
                      <div>
                        <p className="font-semibold text-slate-100">Light Mode</p>
                        <p className="text-xs text-slate-400">Clean and bright</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Quick Stats */}
            <Card className="mt-6">
              <CardHeader>
                <h3 className="text-lg font-bold">Quick Stats</h3>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="flex justify-between items-center p-2 bg-slate-800 border border-slate-700">
                  <span className="text-slate-400">Decisions Created</span>
                  <span className="font-bold">{decisions.length}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-slate-800 border border-slate-700">
                  <span className="text-slate-400">Debates Created</span>
                  <span className="font-bold">{courtrooms.length}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-slate-800 border border-slate-700">
                  <span className="text-slate-400">Models Connected</span>
                  <span className="font-bold">{models.length}</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-slate-800 border border-slate-700">
                  <span className="text-slate-400">Agents Created</span>
                  <span className="font-bold">{agentTemplates.length}</span>
                </div>
              </CardBody>
            </Card>
          </div>
        </div>

        {/* Data & Account Actions */}
        <div className="mt-8 max-w-4xl">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-bold">Data & Account</h3>
            </CardHeader>
            <CardBody className="space-y-3">
              <Button
                variant="secondary"
                className="w-full justify-center"
                isLoading={exportState === 'loading'}
                disabled={exportState === 'loading'}
                onClick={handleExportData}
              >
                <Download size={18} />
                Download My Data (JSON)
              </Button>
              {exportError && <p className="text-sm text-red-400">{exportError}</p>}
              {exportState === 'success' && (
                <p className="text-sm text-green-400">Export download started.</p>
              )}
              <Button
                variant="danger"
                className="w-full justify-center"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteState('idle');
                  setDeletePhrase('');
                  setDeleteConfirmOpen(true);
                }}
              >
                <Trash2 size={18} />
                Delete Account
              </Button>
            </CardBody>
          </Card>
        </div>
      </Container>

      {/* Delete-account confirmation */}
      <Modal isOpen={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} title="Delete Account">
        <div className="space-y-4">
          <p className="text-slate-300">
            This permanently deletes your account and all of your data (decisions, debates, models,
            agents, evaluations and history). This action cannot be undone.
          </p>
          <p className="text-slate-300">
            Type <span className="font-mono font-bold text-white">DELETE</span> to confirm.
          </p>
          <Input
            placeholder="DELETE"
            value={deletePhrase}
            onChange={(e) => setDeletePhrase(e.target.value)}
          />
          {deleteError && <p className="text-sm text-red-400">{deleteError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              disabled={deletePhrase !== 'DELETE' || deleteState === 'loading'}
              isLoading={deleteState === 'loading'}
            >
              <Trash2 size={18} />
              Permanently Delete
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};