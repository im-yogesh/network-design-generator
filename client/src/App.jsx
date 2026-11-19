import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import AuthForm from './components/AuthForm.jsx';
import RequirementForm from './components/RequirementForm.jsx';
import DesignView from './components/DesignView.jsx';
import History from './components/History.jsx';
import IpamView from './components/IpamView.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!getToken());
  const [page, setPage] = useState('new');
  const [design, setDesign] = useState(null);
  const [list, setList] = useState([]);

  const logout = () => {
    setToken(null);
    setUser(null);
    setDesign(null);
    setList([]);
    setPage('new');
  };

  const refresh = () => api.list().then(setList).catch(() => {});

  useEffect(() => {
    const onLogout = () => logout();
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setBooting(false);
      return;
    }
    api.me()
      .then((d) => {
        setUser(d.user);
        return refresh();
      })
      .catch(() => logout())
      .finally(() => setBooting(false));
  }, []);

  const open = async (id) => {
    setDesign(await api.get(id));
    setPage('design');
  };

  if (booting) {
    return (
      <div className="auth-shell">
        <p className="hint">Checking session…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app">
        <header>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <p className="brand-kicker">ENTERPRISE · L2/L3 · IPAM</p>
              <h1>NetDesign</h1>
            </div>
          </div>
        </header>
        <AuthForm onAuth={(u) => { setUser(u); refresh(); }} />
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-kicker">ENTERPRISE · L2/L3 · IPAM</p>
            <h1>NetDesign</h1>
          </div>
        </div>
        <nav>
          <button className={page === 'new' ? 'active' : ''} onClick={() => setPage('new')}>New Design</button>
          <button className={page === 'history' ? 'active' : ''} onClick={() => { refresh(); setPage('history'); }}>Designs ({list.length})</button>
          <button className={page === 'ipam' ? 'active' : ''} onClick={() => setPage('ipam')}>IPAM</button>
          {design && <button className={page === 'design' ? 'active' : ''} onClick={() => setPage('design')}>{design.customerName}</button>}
          <span className="nav-user">{user.name}</span>
          <button type="button" onClick={logout}>Logout</button>
        </nav>
      </header>
      <main>
        {page === 'new' && <RequirementForm onCreated={(d) => { setDesign(d); refresh(); setPage('design'); }} />}
        {page === 'design' && design && <DesignView design={design} />}
        {page === 'history' && (
          <History
            list={list}
            onOpen={open}
            onDelete={async (id) => {
              await api.remove(id);
              if (design?._id === id) setDesign(null);
              refresh();
            }}
          />
        )}
        {page === 'ipam' && <IpamView />}
      </main>
    </div>
  );
}
