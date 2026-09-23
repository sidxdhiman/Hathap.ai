import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeContext';

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.classList.remove('theme-light');
  });

  it('defaults to dark when no preference is stored and persists it', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('hathap-theme')).toBe('dark');
    expect(document.body.classList.contains('theme-light')).toBe(false);
  });

  it('restores a stored light preference and applies the light theme class', () => {
    localStorage.setItem('hathap-theme', 'light');
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    expect(result.current.theme).toBe('light');
    expect(document.body.classList.contains('theme-light')).toBe(true);
  });

  it('toggles between themes and keeps storage and the document class in sync', () => {
    const { result } = renderHook(() => useTheme(), { wrapper: ThemeProvider });
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('hathap-theme')).toBe('light');
    expect(document.body.classList.contains('theme-light')).toBe(true);
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('hathap-theme')).toBe('dark');
    expect(document.body.classList.contains('theme-light')).toBe(false);
  });

  it('throws when used outside of a ThemeProvider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useTheme())).toThrow(
        'useTheme must be used within ThemeProvider'
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});