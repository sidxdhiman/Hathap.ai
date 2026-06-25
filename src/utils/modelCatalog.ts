// Curated list of well-known model identifiers per provider.
// Use these to populate the model picker in the UI so users don't have to
// memorize exact API identifiers. Add new entries here when providers ship new models.

export interface ModelOption {
  id: string;          // The actual API identifier sent to the provider
  label: string;       // Human-friendly display name
  description?: string;
}

export interface ProviderPreset {
  provider: string;          // Free-form provider name (e.g. "OpenAI", "Anthropic")
  defaultBaseUrl?: string;
  models: ModelOption[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    provider: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', description: 'Latest multimodal flagship, fast + cheap.' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', description: 'Small, low-cost, great for most tasks.' },
      { id: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: '128k context, high quality.' },
      { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: 'Cheapest, decent for simple tasks.' },
      { id: 'o1', label: 'o1', description: 'Reasoning model, slow but accurate.' },
      { id: 'o1-mini', label: 'o1 mini', description: 'Smaller reasoning model.' },
    ],
  },
  {
    provider: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    models: [
      { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', description: 'Best balance of speed and quality.' },
      { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', description: 'Fastest, low cost.' },
      { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus', description: 'Highest quality, slower.' },
      { id: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet', description: 'Mid-tier legacy model.' },
    ],
  },
  {
    // Note: Google's OpenAI-compat endpoint is unreliable (404 premature close).
    // For Gemini models, use OpenRouter (see below) — same models, stable API.
    provider: 'Google',
    models: [
      { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', description: 'Google flagship. Use OpenRouter for a working connection.' },
      { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', description: 'Fast and cheap. Use OpenRouter for a working connection.' },
    ],
  },
  {
    provider: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    models: [
      // Models confirmed available on OpenRouter with the ":free" tier — usable
      // with a brand-new free OpenRouter API key. OpenRouter requires the
      // ":free" suffix to opt into the free-tier endpoint for these models.
      { id: 'google/gemini-2.0-flash-exp:free', label: 'Google Gemini 2.0 Flash (free)', description: 'Free tier — works with a fresh OpenRouter key.' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Meta Llama 3.3 70B (free)', description: 'Free tier.' },
      { id: 'qwen/qwen-2.5-72b-instruct:free', label: 'Qwen 2.5 72B (free)', description: 'Free tier.' },
      { id: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B Instruct (free)', description: 'Free tier, fast.' },
      // Paid tier (requires OpenRouter credits)
      { id: 'openai/gpt-4o', label: 'OpenAI GPT-4o (paid)', description: 'Requires OpenRouter credits.' },
      { id: 'anthropic/claude-3.5-sonnet', label: 'Anthropic Claude 3.5 Sonnet (paid)', description: 'Requires OpenRouter credits.' },
      { id: 'google/gemini-1.5-pro', label: 'Google Gemini 1.5 Pro (paid)', description: 'Requires OpenRouter credits.' },
    ],
  },
  {
    provider: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    models: [
      { id: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B Versatile' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
      { id: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
    ],
  },
  {
    provider: 'Ollama (local)',
    defaultBaseUrl: 'http://localhost:11434/v1',
    models: [
      { id: 'llama3.1', label: 'Llama 3.1 (local)' },
      { id: 'qwen2.5', label: 'Qwen 2.5 (local)' },
      { id: 'mistral', label: 'Mistral (local)' },
    ],
  },
];

export const CUSTOM_OPTION_ID = '__custom__';

export function getPresetForProvider(provider: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(
    (preset) => preset.provider.toLowerCase() === provider.toLowerCase()
  );
}