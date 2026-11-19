import { useState } from 'react';
import { api, setToken } from '../api.js';

export default function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = mode === 'signup'
        ? await api.signup({ name, email, password })
        : await api.login({ email, password });
      setToken(data.token);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <form className="auth-card form" onSubmit={submit}>
        <p className="brand-kicker">SECURE ACCESS</p>
        <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
        <p className="hint">{mode === 'login' ? 'Access your network designs and IPAM.' : 'Register to generate and save designs.'}</p>

        {mode === 'signup' && (
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
        )}
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>

        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Sign up'}
        </button>

        <p className="auth-switch">
          {mode === 'login' ? (
            <>No account? <button type="button" className="link" onClick={() => { setMode('signup'); setError(''); }}>Sign up</button></>
          ) : (
            <>Have an account? <button type="button" className="link" onClick={() => { setMode('login'); setError(''); }}>Sign in</button></>
          )}
        </p>
      </form>
    </div>
  );
}
