import React, { useState } from 'react';
import { ArrowLeft, Moon, Sun, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { Layout, Container, PageHeader } from '../components/layout/Layout';
import { Card, CardBody, CardHeader, CardFooter } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isSaved, setIsSaved] = useState(false);

  const [profile, setProfile] = useState({
    name: 'Alex Johnson',
    email: 'alex@hathap.ai',
    organization: 'AI Research Lab',
    role: 'Researcher',
  });

  const { models, agentTemplates, courtrooms } = useApp();

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
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
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-200">Full Name</label>
                  <Input
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-200">Email</label>
                  <Input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-200">Organization</label>
                  <Input
                    value={profile.organization}
                    onChange={(e) => setProfile({ ...profile, organization: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-200">Role</label>
                  <Input
                    value={profile.role}
                    onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                  />
                </div>
              </CardBody>
              <CardFooter>
                <Button onClick={handleSave} className="flex-1 justify-center">
                  <Save size={18} />
                  {isSaved ? 'Saved!' : 'Save Changes'}
                </Button>
              </CardFooter>
            </Card>
          </div>

          {/* Theme Settings */}
          <div>
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

        {/* Account Actions */}
        <div className="mt-8 max-w-4xl">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-bold">Account Actions</h3>
            </CardHeader>
            <CardBody className="space-y-3">
              <Button variant="secondary" className="w-full justify-center">
                Change Password
              </Button>
              <Button variant="secondary" className="w-full justify-center">
                Download Data
              </Button>
              <Button variant="danger" className="w-full justify-center">
                Delete Account
              </Button>
            </CardBody>
          </Card>
        </div>
      </Container>
    </Layout>
  );
};
