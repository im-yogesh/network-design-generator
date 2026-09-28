import { useEffect, useState } from 'react';
import { api } from './api.js';
import RequirementForm from './components/RequirementForm.jsx';
import DesignView from './components/DesignView.jsx';
import History from './components/History.jsx';
import IpamView from './components/IpamView.jsx';

export default function App() {
  const [page, setPage] = useState('new');
  const [design, setDesign] = useState(null);
  const [list, setList] = useState([]);

  const refresh = () => api.list().then(setList).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const open = async (id) => {
    setDesign(await api.get(id));
    setPage('design');
  };

  return (
    <div className="app">
      <header>
        <h1>AI-Assisted Network Design Generator</h1>
        <nav>
          <button className={page === 'new' ? 'active' : ''} onClick={() => setPage('new')}>New Design</button>
          <button className={page === 'history' ? 'active' : ''} onClick={() => { refresh(); setPage('history'); }}>Designs ({list.length})</button>
          <button className={page === 'ipam' ? 'active' : ''} onClick={() => setPage('ipam')}>IPAM</button>
          {design && <button className={page === 'design' ? 'active' : ''} onClick={() => setPage('design')}>{design.customerName}</button>}
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
