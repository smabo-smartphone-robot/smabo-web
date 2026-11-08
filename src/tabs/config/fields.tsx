// Small inputs and value helpers used by the Config panel.
import React, { useState, useEffect } from 'react';


// ── type helpers ─────────────────────────────────────────────

export function rec(v: unknown): Record<string, unknown> {
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
}
export function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? v as T[] : [];
}
export function n(v: unknown, def = 0): number {
  return typeof v === 'number' ? v : def;
}
export function b(v: unknown, def = false): boolean {
  return typeof v === 'boolean' ? v : def;
}
export function s(v: unknown, def = ''): string {
  return typeof v === 'string' ? v : def;
}

// ── SectionHeader ────────────────────────────────────────────
// Section heading that acts as a visual table-of-contents marker

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '.72rem', fontWeight: 700, color: 'var(--ink)',
      borderLeft: '3px solid var(--accent)', paddingLeft: 8,
      marginTop: 10, marginBottom: 6,
    }}>
      {children}
    </div>
  );
}

// ── InlineStr ────────────────────────────────────────────────

export function InlineStr({ value, onChange, isPassword, w = 120, label }: {
  value: string; onChange: (v: string) => void; isPassword?: boolean; w?: number; label?: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  return (
    <input
      type={isPassword ? 'password' : 'text'} value={local} aria-label={label}
      style={{ width: w, fontSize: '.72rem', padding: '1px 4px',
               background: 'transparent', border: '1px solid var(--line)',
               borderRadius: 3, color: 'var(--ink)', boxSizing: 'border-box' }}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => { if (local !== value) onChange(local); }}
      onKeyDown={e => { if (e.key === 'Enter' && local !== value) onChange(local); }}
    />
  );
}

// ── InlineNum ────────────────────────────────────────────────
// Number input that commits on blur or Enter — no Send button needed.

export function InlineNum({ value, onChange, isInt, w = 50 }: {
  value: number; onChange: (v: number) => void; isInt?: boolean; w?: number | string;
}) {
  const [local, setLocal] = useState(String(value));
  useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = () => {
    const v = isInt ? parseInt(local, 10) : parseFloat(local);
    if (!isNaN(v) && v !== value) onChange(v);
  };
  return (
    <input
      type="text" inputMode={isInt ? 'numeric' : 'decimal'} value={local}
      style={{ width: w, fontSize: '.72rem', padding: '1px 4px', textAlign: 'right',
               background: 'transparent', border: '1px solid var(--line)',
               borderRadius: 3, color: 'var(--ink)', boxSizing: 'border-box' }}
      onChange={e => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); }}
    />
  );
}
