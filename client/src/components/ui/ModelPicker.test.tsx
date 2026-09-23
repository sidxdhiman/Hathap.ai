import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelPicker, ProviderPicker } from './ModelPicker';

describe('ModelPicker', () => {
  it('renders the catalog models for a known provider as select options', () => {
    render(<ModelPicker provider="OpenAI" value="gpt-4o" onChange={vi.fn()} />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('gpt-4o');
    expect(screen.getByRole('option', { name: 'GPT-4o — gpt-4o' })).toBeInTheDocument();
  });

  it('clears the selection when the custom option is chosen', () => {
    const onChange = vi.fn();
    render(<ModelPicker provider="OpenAI" value="gpt-4o" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '__custom__' } });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('reveals a free-text input for values that are not in the catalog', () => {
    const onChange = vi.fn();
    render(<ModelPicker provider="OpenAI" value="my-custom-model" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Enter custom model ID');
    fireEvent.change(input, { target: { value: 'my-other-model' } });
    expect(onChange).toHaveBeenCalledWith('my-other-model');
  });

  it('falls back to a free-text input for unknown providers', () => {
    const onChange = vi.fn();
    render(<ModelPicker provider="Acme Cloud" value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('e.g., my-custom-model');
    fireEvent.change(input, { target: { value: 'acme-7b' } });
    expect(onChange).toHaveBeenCalledWith('acme-7b');
  });
});

describe('ProviderPicker', () => {
  it('renders preset providers and clears the selection for a custom provider', () => {
    const onChange = vi.fn();
    render(<ProviderPicker value="OpenAI" onChange={onChange} />);
    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('OpenAI');
    fireEvent.change(select, { target: { value: '__custom_provider__' } });
    expect(onChange).toHaveBeenCalledWith('');
  });
});