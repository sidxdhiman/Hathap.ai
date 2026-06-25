import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Model, AgentTemplate, Courtroom } from '../types';

export type Toast = {
  id: string;
  variant: 'success' | 'error' | 'info' | 'warning';
  message: string;
};

interface AppContextType {
  models: Model[];
  agentTemplates: AgentTemplate[];
  courtrooms: Courtroom[];
  isLoading: boolean;
  needsOnboarding: boolean;
  toasts: Toast[];
  showToast: (variant: Toast['variant'], message: string) => void;
  dismissToast: (id: string) => void;
  addModel: (model: Omit<Model, 'id' | 'status'> & { apiKey: string }) => Promise<Model>;
  updateModel: (id: string, model: Partial<Model> & { apiKey?: string }) => Promise<void>;
  deleteModel: (id: string) => void;
  testModel: (id: string) => Promise<{ success: boolean; error?: string }>;
  addAgentTemplate: (agent: AgentTemplate) => void;
  updateAgentTemplate: (id: string, agent: Partial<AgentTemplate>) => void;
  deleteAgentTemplate: (id: string) => void;
  addCourtroom: (courtroom: Omit<Courtroom, 'id'>) => Promise<Courtroom>;
  updateCourtroom: (id: string, courtroom: Partial<Courtroom>) => void;
  deleteCourtroom: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const mapModel = (m: any): Model => ({
  ...m,
  id: m._id || m.id,
  apiKey: m.apiKey || 'Not set',
  hasApiKey: m.hasApiKey ?? Boolean(m.apiKey && m.apiKey !== 'Not set'),
});

const mapAgent = (a: any): AgentTemplate => ({ ...a, id: a._id || a.id });
const mapCourtroom = (c: any): Courtroom => ({ ...c, id: c._id || c.id });

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<Model[]>([]);
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>([]);
  const [courtrooms, setCourtrooms] = useState<Courtroom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const getHeaders = () => {
    const API = (import.meta.env.VITE_API_URL as string) || '';
    const token = localStorage.getItem('hathap_token');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return { API, headers };
  };

  const showToast = useCallback((variant: Toast['variant'], message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, variant, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshData = async () => {
    try {
      const { API, headers } = getHeaders();
      const [mRes, aRes, cRes] = await Promise.all([
        fetch(`${API}/api/models`, { headers }).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API}/api/agents`, { headers }).then((r) => (r.ok ? r.json() : [])),
        fetch(`${API}/api/courtrooms`, { headers }).then((r) => (r.ok ? r.json() : [])),
      ]);
      setModels(Array.isArray(mRes) ? mRes.map(mapModel) : []);
      setAgentTemplates(Array.isArray(aRes) ? aRes.map(mapAgent) : []);
      setCourtrooms(Array.isArray(cRes) ? cRes.map(mapCourtroom) : []);
    } catch (e) {
      console.error('Failed to refresh data', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, []);

  const needsOnboarding =
    !isLoading && (models.length === 0 || models.every((model) => !model.hasApiKey));

  const addModel = async (model: Omit<Model, 'id' | 'status'> & { apiKey: string }) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/models`, {
      method: 'POST',
      headers,
      body: JSON.stringify(model),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add model');
    const saved = mapModel(data);
    setModels((prev) => [...prev, saved]);
    return saved;
  };

  const updateModel = async (id: string, updates: Partial<Model> & { apiKey?: string }) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/models/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update model');
    const saved = mapModel(data);
    setModels((prev) => prev.map((m) => (m.id === id ? saved : m)));
  };

  const testModel = async (id: string) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/models/${id}/test`, { method: 'POST', headers });
    const data = await res.json();
    if (data.model) {
      const saved = mapModel(data.model);
      setModels((prev) => prev.map((m) => (m.id === id ? saved : m)));
    }
    return { success: Boolean(data.success), error: data.error };
  };

  const deleteModel = (id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
    const { API, headers } = getHeaders();
    fetch(`${API}/api/models/${id}`, { method: 'DELETE', headers }).catch(() => {});
  };

  const addAgentTemplate = (agent: AgentTemplate) => {
    setAgentTemplates((prev) => [...prev, agent]);
    const { API, headers } = getHeaders();
    fetch(`${API}/api/agents`, { method: 'POST', headers, body: JSON.stringify(agent) }).catch(() => {});
  };

  const updateAgentTemplate = (id: string, updates: Partial<AgentTemplate>) => {
    setAgentTemplates((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    const { API, headers } = getHeaders();
    fetch(`${API}/api/agents/${id}`, { method: 'PUT', headers, body: JSON.stringify(updates) }).catch(
      () => {}
    );
  };

  const deleteAgentTemplate = (id: string) => {
    setAgentTemplates((prev) => prev.filter((a) => a.id !== id));
    const { API, headers } = getHeaders();
    fetch(`${API}/api/agents/${id}`, { method: 'DELETE', headers }).catch(() => {});
  };

  const addCourtroom = async (courtroom: Omit<Courtroom, 'id'>) => {
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/courtrooms`, {
      method: 'POST',
      headers,
      body: JSON.stringify(courtroom),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create courtroom');
    const saved = mapCourtroom(data);
    setCourtrooms((prev) => [...prev, saved]);
    return saved;
  };

  const updateCourtroom = (id: string, updates: Partial<Courtroom>) => {
    setCourtrooms((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)));
    const { API, headers } = getHeaders();
    fetch(`${API}/api/courtrooms/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates),
    })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          showToast('error', data.error || 'Failed to update courtroom');
          await refreshData();
        }
      })
      .catch(() => {});
  };

  const deleteCourtroom = async (id: string) => {
    setCourtrooms((prev) => prev.filter((c) => c.id !== id));
    const { API, headers } = getHeaders();
    const res = await fetch(`${API}/api/courtrooms/${id}`, { method: 'DELETE', headers });
    if (!res.ok) {
      await refreshData();
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to delete courtroom');
    }
  };

  return (
    <AppContext.Provider
      value={{
        models,
        agentTemplates,
        courtrooms,
        isLoading,
        needsOnboarding,
        toasts,
        showToast,
        dismissToast,
        addModel,
        updateModel,
        deleteModel,
        testModel,
        addAgentTemplate,
        updateAgentTemplate,
        deleteAgentTemplate,
        addCourtroom,
        updateCourtroom,
        deleteCourtroom,
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
