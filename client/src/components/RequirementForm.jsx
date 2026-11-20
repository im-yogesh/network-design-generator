import { useEffect, useState } from 'react';
import { api } from '../api.js';

const DEPT_TYPES = ['User VLAN', 'Server VLAN', 'Guest VLAN', 'Management VLAN', 'Voice VLAN'];
const HA_MODES = ['None', 'Device Redundancy', 'ISP Redundancy', 'Full HA'];
const GEN_STEPS = [
  'Validating requirements',
  'Running design engine (AI may take a minute)',
  'Allocating IP addressing',
  'Building topology & device configs',
  'Packaging design report',
];
const DEFAULTS = {
  customerName: '',
  customerId: '',
  industry: 'Banking',
  sites: { count: 1, drSite: false },
  users: { current: 10, growthPct: 0 },
  connectionType: 'Internet',
  bandwidthMbps: 50,
  deploymentType: 'Enterprise LAN',
  haMode: 'None',
  departments: [],
  servers: { dhcp: false, dns: false },
  ipMethod: 'auto',
  customerNetwork: '',
};

// set(obj, 'a.b', v) -> immutable nested update
const setPath = (obj, path, value) => {
  const [k, ...rest] = path.split('.');
  return { ...obj, [k]: rest.length ? setPath(obj[k] || {}, rest.join('.'), value) : value };
};

function formatElapsed(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export default function RequirementForm({ onCreated }) {
  const [f, setF] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [pct, setPct] = useState(0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!busy) return undefined;
    setElapsed(0);
    setPct(4);
    setStep(0);
    const t0 = Date.now();
    const id = setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      setElapsed(sec);
      // Asymptotic progress so long AI waits still feel alive (caps ~92% until done)
      setPct(Math.min(92, Math.round(4 + 88 * (1 - Math.exp(-sec / 45)))));
      setStep(Math.min(GEN_STEPS.length - 1, Math.floor(sec / 12)));
    }, 400);
    return () => clearInterval(id);
  }, [busy]);

  const set = (path) => (e) => {
    const t = e.target;
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value;
    setF((prev) => setPath(prev, path, v));
  };
  const yesNo = (path) => (e) => setF((prev) => setPath(prev, path, e.target.value === 'yes'));
  const val = (path) => path.split('.').reduce((o, k) => o?.[k], f);
  const YesNo = ({ path }) => (
    <select value={val(path) ? 'yes' : 'no'} onChange={yesNo(path)}>
      <option value="no">No</option>
      <option value="yes">Yes</option>
    </select>
  );

  const setDept = (i, key) => (e) =>
    setF((p) => ({ ...p, departments: p.departments.map((d, j) => (j === i ? { ...d, [key]: e.target.value } : d)) }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const doc = await api.create(f);
      setPct(100);
      setStep(GEN_STEPS.length - 1);
      onCreated(doc);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      {busy && (
        <div className="gen-overlay" role="status" aria-live="polite">
          <div className="gen-card">
            <div className="gen-spinner" aria-hidden="true" />
            <h3>Generating design</h3>
            <p className="hint">This can take 1–3 minutes while the AI and IPAM run. Please keep this tab open.</p>
            <div className="gen-bar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="gen-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="gen-meta">
              <span>{pct}%</span>
              <span>{formatElapsed(elapsed)}</span>
            </div>
            <ul className="gen-steps">
              {GEN_STEPS.map((label, i) => (
                <li key={label} className={i < step ? 'done' : i === step ? 'active' : ''}>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <section>
        <h2>1. Customer Information</h2>
        <div className="grid">
          <label>Customer Name<input value={f.customerName} onChange={set('customerName')} required /></label>
          <label>Customer ID<input value={f.customerId} onChange={set('customerId')} /></label>
          <label>Industry
            <select value={f.industry} onChange={set('industry')}>
              {['Banking', 'Healthcare', 'Retail', 'Manufacturing', 'Government', 'Other'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2>2. Business Requirements</h2>
        <div className="grid">
          <label>Number of Sites<input type="number" min="1" value={f.sites.count} onChange={set('sites.count')} /></label>
          {f.sites.count > 1 && <label>DR site required?<YesNo path="sites.drSite" /></label>}
          <label>Current users<input type="number" min="1" value={f.users.current} onChange={set('users.current')} /></label>
          <label>Future growth %<input type="number" min="0" value={f.users.growthPct} onChange={set('users.growthPct')} /></label>
        </div>
      </section>

      <section>
        <h2>3. Service Requirements</h2>
        <div className="grid">
          <label>Connection type
            <select
              value={f.connectionType}
              onChange={(e) => {
                const connectionType = e.target.value;
                setF((p) => ({
                  ...p,
                  connectionType,
                  deploymentType: connectionType === 'MPLS' ? 'ISP MPLS VPN' : 'Enterprise LAN',
                }));
              }}
            >
              {['Internet', 'MPLS'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>Bandwidth
            <select value={f.bandwidthMbps} onChange={set('bandwidthMbps')}>
              {[[50, '50 Mbps'], [100, '100 Mbps'], [500, '500 Mbps'], [1000, '1 Gbps'], [2000, '2 Gbps'], [5000, '5 Gbps'], [10000, '10 Gbps']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>High Availability
            <select value={f.haMode} onChange={set('haMode')}>
              {HA_MODES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2>4. Department Requirements</h2>
        {f.departments.map((d, i) => (
          <div className="row" key={i}>
            <input type="number" min="1" max="4094" placeholder={`VLAN ID (${(i + 1) * 10})`} value={d.vlanId} onChange={setDept(i, 'vlanId')} />
            <input placeholder="Department Name" value={d.name} onChange={setDept(i, 'name')} />
            <select value={d.type} onChange={setDept(i, 'type')} required>
              <option value="" disabled>Department Type</option>
              {DEPT_TYPES.map((x) => <option key={x}>{x}</option>)}
            </select>
            <button type="button" className="link" onClick={() => setF((p) => ({ ...p, departments: p.departments.filter((_, j) => j !== i) }))}>Remove</button>
          </div>
        ))}
        {f.departments.length < 9 && (
          <button type="button" className="secondary" onClick={() => setF((p) => ({ ...p, departments: [...p.departments, { name: '', type: '', vlanId: '' }] }))}>+ Add department</button>
        )}
      </section>

      <section>
        <h2>5. IP Addressing</h2>
        <div className="grid">
          <label>Allocation method
            <select value={f.ipMethod} onChange={set('ipMethod')}>
              <option value="auto">Auto allocate (IPAM)</option>
              <option value="customer">Customer provided</option>
            </select>
          </label>
          {f.ipMethod === 'customer' && (
            <label>Customer LAN network (CIDR)<input placeholder="192.168.100.0/24" value={f.customerNetwork} onChange={set('customerNetwork')} required /></label>
          )}
        </div>
      </section>

      <section>
        <h2>6. Servers</h2>
        <div className="checks">
          <label><input type="checkbox" checked={f.servers.dhcp} onChange={set('servers.dhcp')} />DHCP</label>
          <label><input type="checkbox" checked={f.servers.dns} onChange={set('servers.dns')} />DNS</label>
        </div>
      </section>

      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Generating…' : 'Generate Design'}</button>
    </form>
  );
}
