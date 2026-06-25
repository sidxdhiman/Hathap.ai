import React from 'react';
import { PROVIDER_PRESETS, CUSTOM_OPTION_ID, getPresetForProvider, ModelOption } from '../../utils/modelCatalog';
import { Input } from './Input';

interface ModelPickerProps {
  provider: string;
  value: string;
  onChange: (modelId: string) => void;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({ provider, value, onChange }) => {
  const preset = getPresetForProvider(provider);

  if (!preset) {
    // Unknown provider — fall back to a free-text input so users can still enter custom identifiers.
    return (
      <Input
        placeholder="e.g., my-custom-model"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const isCustom = value && !preset.models.some((m) => m.id === value);

  const handleSelectChange = (selected: string) => {
    if (selected === CUSTOM_OPTION_ID) {
      onChange('');
    } else {
      onChange(selected);
    }
  };

  return (
    <div className="space-y-2">
      <select
        className="input-field"
        value={isCustom ? CUSTOM_OPTION_ID : value || ''}
        onChange={(e) => handleSelectChange(e.target.value)}
      >
        <option value="" disabled>
          Select a model…
        </option>
        {preset.models.map((model: ModelOption) => (
          <option key={model.id} value={model.id}>
            {model.label} — {model.id}
          </option>
        ))}
        <option value={CUSTOM_OPTION_ID}>Custom model ID…</option>
      </select>
      {(isCustom || !value) && (
        <Input
          placeholder={
            isCustom
              ? 'Enter custom model ID'
              : 'Or type a model ID manually (e.g. gpt-4o, claude-3-5-sonnet-20241022)'
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
};

interface ProviderPickerProps {
  value: string;
  onChange: (provider: string) => void;
}

export const ProviderPicker: React.FC<ProviderPickerProps> = ({ value, onChange }) => {
  const isCustom = value && !PROVIDER_PRESETS.some((p) => p.provider === value);
  return (
    <div className="space-y-2">
      <select
        className="input-field"
        value={isCustom ? '__custom_provider__' : value || ''}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === '__custom_provider__' ? '' : v);
        }}
      >
        <option value="" disabled>
          Select a provider…
        </option>
        {PROVIDER_PRESETS.map((preset) => (
          <option key={preset.provider} value={preset.provider}>
            {preset.provider}
          </option>
        ))}
        <option value="__custom_provider__">Custom provider…</option>
      </select>
      {isCustom && (
        <Input
          placeholder="Custom provider name"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
};