// Face expressions of the phone (smabo-app, or smabo-sim's phone), edited
// over its REST API. The form is built from the phone's own schema
// (GET /face/schema): which fields exist, their type and range, and which eye
// shapes use them. So a field added in the app shows up here without a web
// change. Expressions are known to others by their (unique) name; the id is
// only the handle in these URLs and is not shown. Edits go out as they happen (throttled); the preview is the phone's
// own drawing of the expression (GET /face/preview.png), re-fetched after
// each edit, and the phone can also show the expression being edited.
//   GET    /face/schema
//   GET    /face/expressions             {active, expressions: [...]}
//   POST   /face/expressions/<id>        partial expression
//   POST   /face/expressions             {copy_of?} → {id}
//   DELETE /face/expressions/<id>
//   GET    /face/preview.png?id=<id>&w=<px>&h=<px>
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { phone } from '../../ws/esp32';
import { useBrain } from '../../store/useBrain';
import { InlineStr, SectionHeader } from './fields';

interface Field {
  key: string;
  type: 'bool' | 'number' | 'color' | 'string' | 'enum';
  label: string;
  group?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  shapes?: string[];
  when?: string;           // a bool field of the same object that must be true
}
interface Schema { schema: number; expression: Field[]; eye: Field[]; eyes: string[] }
type Obj = Record<string, unknown>;
interface Expr extends Obj { id: number; name: string }

const SEND_EVERY_MS = 120;     // while dragging a slider
const QUIET_MS = 1200;         // after a local edit, don't let a refresh overwrite it
// the preview's size on the page; the phone draws it at twice that for sharpness
// (about a phone held sideways)
const PREVIEW_W = 216;
const PREVIEW_H = 100;

function deepMerge(a: Obj, b: Obj): Obj {
  const out: Obj = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object'
      ? deepMerge(out[k] as Obj, v as Obj) : v;
  }
  return out;
}

const lbl = { fontSize: '.75rem', color: 'var(--dim)', whiteSpace: 'nowrap' } as const;
const grid = {
  display: 'grid', gridTemplateColumns: 'minmax(110px, max-content) minmax(0, 1fr)',
  columnGap: 16, rowGap: 8, alignItems: 'center', marginBottom: 10,
} as const;

function FieldInput({ f, value, onChange }: { f: Field; value: unknown; onChange: (v: unknown) => void }) {
  switch (f.type) {
    case 'bool':
      return <input type="checkbox" aria-label={f.label} checked={value === true}
        onChange={e => onChange(e.target.checked)} style={{ justifySelf: 'start' }} />;
    case 'color':
      return <input type="color" aria-label={f.label} value={typeof value === 'string' ? value.toLowerCase() : '#000000'}
        onChange={e => onChange(e.target.value.toUpperCase())}
        style={{ width: 44, height: 22, padding: 0, border: '1px solid var(--line)', background: 'transparent' }} />;
    case 'enum':
      return (
        <select aria-label={f.label} value={String(value ?? '')} onChange={e => onChange(e.target.value)}
          style={{ fontSize: '.72rem', width: 'fit-content' }}>
          {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'string':
      return <InlineStr label={f.label} value={String(value ?? '')} w={150} onChange={v => v.trim() && onChange(v)} />;
    case 'number': {
      const v = typeof value === 'number' ? value : 0;
      const digits = (f.step ?? 0.01) >= 1 ? 0 : 2;
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <input type="range" aria-label={f.label} min={f.min} max={f.max} step={f.step ?? 0.01} value={v}
            onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1, minWidth: 60 }} />
          <span style={{ fontSize: '.68rem', fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>
            {v.toFixed(digits)}
          </span>
        </span>
      );
    }
  }
}

function Fields({ fields, values, onChange }: {
  fields: Field[]; values: Obj; onChange: (key: string, v: unknown) => void;
}) {
  const rows: ReactNode[] = [];
  let group: string | undefined;
  for (const f of fields) {
    if (f.when && values[f.when] !== true) continue;
    if (f.group !== group) {
      group = f.group;
      if (group) rows.push(<div key={`g-${group}`} style={{ gridColumn: '1 / -1', ...lbl, fontWeight: 600, marginTop: 4 }}>{group}</div>);
    }
    rows.push(<span key={`l-${f.key}`} style={lbl}>{f.label}</span>);
    rows.push(<FieldInput key={`v-${f.key}`} f={f} value={values[f.key]} onChange={v => onChange(f.key, v)} />);
  }
  return <div style={grid}>{rows}</div>;
}

export function ExpressionEditor() {
  const host = useBrain(st => st.phoneHost);
  const phoneConfig = useBrain(st => st.phoneConfig);
  const patchPhoneConfig = useBrain(st => st.patchPhoneConfig);
  const addToast = useBrain(st => st.addToast);

  const [schema, setSchema] = useState<Schema | null>(null);
  const [exprs, setExprs] = useState<Expr[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [showOnPhone, setShowOnPhone] = useState(true);
  const [rev, setRev] = useState(0);          // bumped when the preview should be re-fetched
  const [previewFailed, setPreviewFailed] = useState(false);
  const [previewSrc, setPreviewSrc] = useState('');
  const lastEdit = useRef(0);
  const pending = useRef<{ id: number; patch: Obj } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((force = false): Promise<Expr[] | null> => {
    if (!host) return Promise.resolve(null);
    return phone.request<{ active: number; expressions: Expr[] }>('GET', '/face/expressions')
      .then(j => {
        if (!force && Date.now() - lastEdit.current < QUIET_MS) return null;
        setExprs(j.expressions);
        setRev(r => r + 1);
        setSelected(sel => (sel !== null && j.expressions.some(e => e.id === sel)) ? sel : j.active);
        return j.expressions;
      })
      .catch(() => null);   // the phone may not be reachable yet
  }, [host]);

  useEffect(() => setPreviewFailed(false), [host, selected]);

  useEffect(() => {
    if (!host) return;
    phone.request<Schema>('GET', '/face/schema').then(setSchema).catch(() => setSchema(null));
  }, [host]);

  // the phone sends /phone/config after every change (also from its own screen)
  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
  }, [load, phoneConfig]);

  const flush = useCallback(() => {
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    phone.request<{ ignored: string[] }>('POST', `/face/expressions/${p.id}`, p.patch)
      .then(j => {
        setRev(r => r + 1);
        const ignored = j.ignored ?? [];
        if (ignored.includes('name')) {
          addToast(`The name "${String(p.patch['name'])}" is already used`, 'err');
          void load(true);                       // show the name the phone kept
        }
        const rest = ignored.filter(k => k !== 'name');
        if (rest.length) addToast(`Phone ignored: ${rest.join(', ')}`, 'err');
      })
      .catch(e => addToast(`Expression not saved: ${e.message}`, 'err'));
  }, [addToast, load]);

  const edit = (id: number, patch: Obj) => {
    lastEdit.current = Date.now();
    setExprs(xs => xs.map(x => x.id === id ? deepMerge(x, patch) as Expr : x));
    pending.current = pending.current && pending.current.id === id
      ? { id, patch: deepMerge(pending.current.patch, patch) } : (flush(), { id, patch });
    if (!timer.current) timer.current = setTimeout(flush, SEND_EVERY_MS);
  };

  const showName = (name: string | undefined) => {
    if (showOnPhone && name) patchPhoneConfig({ face: { expression: name } });
  };

  const select = (x: Expr) => {
    setSelected(x.id);
    showName(x.name);
  };

  const add = (copyOf?: number) => {
    phone.request<{ id: number }>('POST', '/face/expressions', copyOf !== undefined ? { copy_of: copyOf } : {})
      .then(async j => {
        setSelected(j.id);
        const list = await load(true);
        showName(list?.find(e => e.id === j.id)?.name);
      })
      .catch(e => addToast(`Could not add: ${e.message}`, 'err'));
  };

  const remove = (x: Expr) => {
    if (!confirm(`Delete expression "${x.name}" on the phone?`)) return;
    phone.request('DELETE', `/face/expressions/${x.id}`)
      .then(() => { setSelected(null); load(true); })
      .catch(e => addToast(`Could not delete: ${e.message}`, 'err'));
  };

  // Through the brain the preview needs our token: fetch it as a blob URL.
  const previewId = selected !== null && exprs.some(e => e.id === selected) ? selected : null;
  useEffect(() => {
    if (!host || previewId === null) { setPreviewSrc(''); return; }
    let url = '';
    let live = true;
    phone.imageUrl(`/face/preview.png?id=${previewId}&w=${PREVIEW_W * 2}&h=${PREVIEW_H * 2}&v=${rev}`)
      .then(u => {
        url = u;
        if (live) setPreviewSrc(u); else if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      })
      .catch(() => { if (live) setPreviewFailed(true); });
    return () => {
      live = false;
      if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 1000);   // after the next image loaded
    };
  }, [host, previewId, rev]);

  if (!host) return null;
  if (!schema) {
    return <div className="expr-hint">This phone has no expression API (update smabo-app).</div>;
  }
  const x = exprs.find(e => e.id === selected);
  const eyesShown = x ? (x['per_eye'] === true ? schema.eyes : schema.eyes.slice(0, 1)) : [];

  // Layout (index.css .expr-*): the expression list, actions and preview on
  // one side, the fields in their own scroll box on the other (below on a
  // narrow pane), so the preview stays in view whichever field is changed.
  return (
    <div className="expr-editor">
      <div className="expr-body">
        <div className="expr-side">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {exprs.map(e => (
              <button key={e.id} onClick={() => select(e)} aria-pressed={e.id === selected}
                style={{ fontSize: '.72rem', padding: '2px 8px',
                         ...(e.id === selected ? { background: 'var(--accent)', color: '#000' } : {}) }}>
                {e.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button style={{ fontSize: '.72rem', padding: '2px 8px' }} onClick={() => add()}>+ New</button>
            <button style={{ fontSize: '.72rem', padding: '2px 8px' }} disabled={!x}
              onClick={() => x && add(x.id)}>Duplicate</button>
            <button className="danger" style={{ fontSize: '.72rem', padding: '2px 8px' }}
              disabled={!x || exprs.length <= 1} onClick={() => x && remove(x)}>Delete</button>
          </div>
          {x && (previewFailed ? (
            <div className="expr-hint">No preview from this phone (update smabo-app).</div>
          ) : (
            <img className="expr-preview" src={previewSrc || undefined} alt={`Expression "${x.name}" as drawn on the phone`}
              width={PREVIEW_W} height={PREVIEW_H} onError={() => setPreviewFailed(true)}
              onLoad={() => setPreviewFailed(false)} />
          ))}
          <label style={{ ...lbl, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showOnPhone} onChange={e => setShowOnPhone(e.target.checked)} />
            show on the phone while editing
          </label>
        </div>

        {x && (
          <div className="expr-fields" tabIndex={-1} aria-label={`Settings of "${x.name}"`}>
            <Fields fields={schema.expression} values={x} onChange={(k, v) => edit(x.id, { [k]: v })} />
            {eyesShown.map(side => {
              const eye = (x[side] ?? {}) as Obj;
              const shape = String(eye['shape'] ?? '');
              return (
                <div key={side}>
                  <SectionHeader>{side === 'left_eye' ? (eyesShown.length > 1 ? 'Left eye' : 'Eyes') : 'Right eye'}</SectionHeader>
                  <Fields fields={schema.eye.filter(f => !f.shapes || f.shapes.includes(shape))} values={eye}
                    onChange={(k, v) => edit(x.id, { [side]: { [k]: v } })} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
