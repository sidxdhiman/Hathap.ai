import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Model, AgentTemplate, Courtroom } from '../types';

// Start with empty arrays — backend will persist data per user

interface AppContextType {
  models: Model[];
  agentTemplates: AgentTemplate[];
  courtrooms: Courtroom[];
  addModel: (model: Model) => void;
  updateModel: (id: string, model: Partial<Model>) => void;
  deleteModel: (id: string) => void;
  addAgentTemplate: (agent: AgentTemplate) => void;
  updateAgentTemplate: (id: string, agent: Partial<AgentTemplate>) => void;
  deleteAgentTemplate: (id: string) => void;
  addCourtroom: (courtroom: Courtroom) => void;
  updateCourtroom: (id: string, courtroom: Partial<Courtroom>) => void;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<Model[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([]);
  const [courtrooms, setCourtrooms] = useState<Courtroom[]>([]);

  const refreshData = async () => {
    try {
      const API = (import.meta.env.VITE_API_URL as string) || '';
      const token = localStorage.getItem('hathap_token');
      const headers: any = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [mRes, aRes, cRes] = await Promise.all([
        fetch(`${API}/api/models`, { headers }).then((r) => r.ok ? r.json() : []),
        fetch(`${API}/api/agents`, { headers }).then((r) => r.ok ? r.json() : []),
        fetch(`${API}/api/courtrooms`, { headers }).then((r) => r.ok ? r.json() : []),
      ]);
      setModels(Array.isArray(mRes) ? mRes.map((m: any) => ({ ...m, id: m._id })) : []);
      setAgentTemplates(Array.isArray(aRes) ? aRes.map((a: any) => ({ ...a, id: a._id })) : []);
      setCourtrooms(Array.isArray(cRes) ? cRes.map((c: any) => ({ ...c, id: c._id })) : []);
    } catch (e) {
      console.error('Failed to refresh data', e);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const addModel = (model: Model) => {
    setModels((prev) => [...prev, model]);
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API}/api/models`, { method: 'POST', headers, body: JSON.stringify(model) }).catch(() => {});
  };

  const updateModel = (id: string, updates: Partial<Model>) => {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API}/api/models/${id}`, { method: 'PUT', headers, body: JSON.stringify(updates) }).catch(() => {});
  };

  const deleteModel = (id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API}/api/models/${id}`, { method: 'DELETE', headers }).catch(() => {});
  };

  const addAgentTemplate = (agent: AgentTemplate) => {
    setAgentTemplates((prev) => [...prev, agent]);
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API}/api/agents`, { method: 'POST', headers, body: JSON.stringify(agent) }).catch(() => {});
  };

  const updateAgentTemplate = (id: string, updates: Partial<AgentTemplate>) => {
    setAgentTemplates((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API}/api/agents/${id}`, { method: 'PUT', headers, body: JSON.stringify(updates) }).catch(() => {});
  };

  const deleteAgentTemplate = (id: string) => {
    setAgentTemplates((prev) => prev.filter((a) => a.id !== id));
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: any = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API}/api/agents/${id}`, { method: 'DELETE', headers }).catch(() => {});
  };

  const addCourtroom = (courtroom: Courtroom) => {
    setCourtrooms((prev) => [...prev, courtroom]);
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API}/api/courtrooms`, { method: 'POST', headers, body: JSON.stringify(courtroom) }).catch(() => {});
  };

  const updateCourtroom = (id: string, updates: Partial<Courtroom>) => {
    setCourtrooms((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: any = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${API}/api/courtrooms/${id}`, { method: 'PUT', headers, body: JSON.stringify(updates) }).catch(() => {});
  };

  return (
    <AppContext.Provider
      value={{
        models,
        agentTemplates,
        courtrooms,
        addModel,
        updateModel,
        deleteModel,
        addAgentTemplate,
        updateAgentTemplate,
        deleteAgentTemplate,
        addCourtroom,
        updateCourtroom,
        refreshData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
