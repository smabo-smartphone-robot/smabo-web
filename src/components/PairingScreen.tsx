import { useState } from 'react';
import { useBrain } from '../store/useBrain';
import { browserName } from '../ws/auth';

// Shown while the brain refuses this browser (status 'unpaired'): enter the
// code from the brain's log (first browser) or an invite from a paired browser.
const REASONS: Record<string, string> = {
  unauthorized: 'This brain only accepts paired browsers.',
  timeout: 'This brain only accepts paired browsers.',
  wrong_code: 'That code is not valid. It may be mistyped, already used or expired.',
  expired: 'That code has expired. The brain’s log shows a new one every 5 minutes.',
  wrong_role: 'That code is for a phone or an ESP32, not a browser.',
};

export function PairingScreen() {
  const host = useBrain(s => s.host);
  const refusal = useBrain(s => s.brainRefusal);
  const status = useBrain(s => s.status);
  const pairBrowser = useBrain(s => s.pairBrowser);
  const [code, setCode] = useState('');
  const [name, setName] = useState(browserName());

  const tried = refusal && refusal.reason !== 'unauthorized' && refusal.reason !== 'timeout';
  const busy = status === 'connecting';

  return (
    <main className="pairing-screen">
      <form
        className="card pairing-card"
        onSubmit={e => { e.preventDefault(); if (code.trim()) pairBrowser(code.trim(), name.trim()); }}
      >
        <h1 className="pairing-title">Pair this browser with the brain</h1>
        <p className="pairing-lead">
          {REASONS[refusal?.reason ?? 'unauthorized'] ?? refusal?.message}
        </p>
        <ol className="pairing-steps">
          <li><b>First browser:</b> enter the code in the log of the brain at <code>{host}</code>
            {' '}(<code>最初のブラウザ用のペアリングコード: ABCD-EFGH</code>).</li>
          <li><b>Another browser:</b> in a paired browser, open <b>Devices → Add browser</b> and enter that code here.</li>
        </ol>
        <label className="pairing-field">
          Code
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ABCD-EFGH"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={tried ? true : undefined}
            autoFocus
          />
        </label>
        <label className="pairing-field">
          Name for this browser
          <input value={name} onChange={e => setName(e.target.value)} maxLength={40} />
        </label>
        {tried && <div className="pairing-error" role="alert">{REASONS[refusal.reason] ?? refusal.message}</div>}
        <button type="submit" className="primary" disabled={busy || !code.trim()}>
          {busy ? 'Pairing…' : 'Pair'}
        </button>
        <p className="pairing-note">
          Lost every paired browser? Restart the brain with <code>--reset-pairing</code> on the computer that runs it.
        </p>
      </form>
    </main>
  );
}
