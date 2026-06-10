import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Model, AgentTemplate, Courtroom } from '../types';
import { mockModels, mockAgentTemplates, mockCourtrooms } from '../data/mockData';

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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [models, setModels] = useState<Model[]>(mockModels);
  const [agentTemplates, setAgentTemplates] = useState<AgentTemplate[]>(mockAgentTemplates);
  const [courtrooms, setCourtrooms] = useState<Courtroom[]>(mockCourtrooms);

  const addModel = (model: Model) => {
    setModels([...models, model]);
  };

  const updateModel = (id: string, updates: Partial<Model>) => {
    setModels(models.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  };

  const deleteModel = (id: string) => {
    setModels(models.filter((m) => m.id !== id));
  };

  const addAgentTemplate = (agent: AgentTemplate) => {
    setAgentTemplates([...agentTemplates, agent]);
  };

  const updateAgentTemplate = (id: string, updates: Partial<AgentTemplate>) => {
    setAgentTemplates(agentTemplates.map((a) => (a.id === id ? { ...a, ...updates } : a)));
  };

  const deleteAgentTemplate = (id: string) => {
    setAgentTemplates(agentTemplates.filter((a) => a.id !== id));
  };

  const addCourtroom = (courtroom: Courtroom) => {
    setCourtrooms([...courtrooms, courtroom]);
  };

  const updateCourtroom = (id: string, updates: Partial<Courtroom>) => {
    setCourtrooms(courtrooms.map((c) => (c.id === id ? { ...c, ...updates } : c)));
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
