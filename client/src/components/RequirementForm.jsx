import { useState } from 'react';
import { api } from '../api.js';

const DEPLOYMENT_TYPES = ['Enterprise LAN', 'Enterprise WAN', 'ISP MPLS VPN'];
const DEPT_TYPES = ['User VLAN', 'Server VLAN', 'Guest VLAN', 'Management VLAN', 'Voice VLAN'];
const HA_MODES = ['None', 'Device Redundancy', 'ISP Redundancy', 'Full HA'];
const DEFAULTS = {
  customerName: 'ABC Bank',
  customerId: '',
  industry: 'Banking',
  sites: { count: 1, drSite: false },
  users: { current: 100, growthPct: 0 },
  connectionType: 'Internet',
  bandwidthMbps: 1000,
  deploymentType: 'Enterprise LAN',
  haMode: 'Full HA',
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

export default function RequirementForm({ onCreated }) {
  const [f, setF] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
      onCreated(await api.create(f));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const growthUsers = Math.ceil((f.users.current || 0) * (1 + (f.users.growthPct || 0) / 100));

  return (
    <form className="form" onSubmit={submit}>
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
            <select value={f.connectionType} onChange={set('connectionType')}>
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
      <button className="primary" disabled={busy}>{busy ? 'Generating...' : 'Generate Design'}</button>
    </form>
  );
}
