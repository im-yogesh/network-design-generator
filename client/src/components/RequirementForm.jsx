import { useState } from 'react';
import { api } from '../api.js';

const SERVERS = ['DHCP', 'DNS', 'NTP', 'Web', 'Mail', 'Application', 'Database'];

const DEFAULTS = {
  customerName: 'ABC Bank',
  customerId: '',
  industry: 'Banking',
  contact: '',
  siteAddress: '',
  projectType: 'New Installation',
  sites: { multiSite: false, branches: 0, drSite: false },
  users: { current: 100, growthPct: 0 },
  connectionType: 'Internet',
  bandwidthMbps: 1000,
  ispPeering: false,
  redundancy: true,
  departments: [
    { name: 'HR', users: 20 },
    { name: 'Finance', users: 25 },
    { name: 'Sales', users: 30 },
    { name: 'IT', users: 25 },
  ],
  ipMethod: 'auto',
  customerNetwork: '',
  publicIps: { needed: true, count: 5 },
  servers: ['DHCP', 'DNS', 'Web'],
  security: { firewall: false, vpn: 'none', acl: true },
  monitoring: { snmp: true, syslog: true, netflow: false },
  notes: '',
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
    setF((p) => ({ ...p, departments: p.departments.map((d, j) => (j === i ? { ...d, [key]: key === 'users' ? Number(e.target.value) : e.target.value } : d)) }));
  const toggleServer = (s) => setF((p) => ({ ...p, servers: p.servers.includes(s) ? p.servers.filter((x) => x !== s) : [...p.servers, s] }));

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
          <label>Primary Contact<input value={f.contact} onChange={set('contact')} /></label>
          <label>Site Address<input value={f.siteAddress} onChange={set('siteAddress')} /></label>
          <label>Project Type
            <select value={f.projectType} onChange={set('projectType')}>
              {['New Installation', 'Migration', 'Upgrade'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section>
        <h2>2. Sites & Routing Needs</h2>
        <div className="grid">
          <label>Multiple internal sites?<YesNo path="sites.multiSite" /></label>
          {f.sites.multiSite && <label>Branch count<input type="number" min="0" value={f.sites.branches} onChange={set('sites.branches')} /></label>}
          {f.sites.multiSite && <label>DR site required?<YesNo path="sites.drSite" /></label>}
          <label>ISP peering required?<YesNo path="ispPeering" /></label>
        </div>
        <p className="hint">Routing protocol is chosen automatically: single site = Static, multi-site = OSPF, ISP peering = BGP.</p>
      </section>

      <section>
        <h2>3. Users</h2>
        <div className="grid">
          <label>Current users<input type="number" min="1" value={f.users.current} onChange={set('users.current')} /></label>
          <label>Future growth %<input type="number" min="0" value={f.users.growthPct} onChange={set('users.growthPct')} /></label>
        </div>
        <p className="hint">Design will be sized for <b>{growthUsers}</b> users.</p>
      </section>

      <section>
        <h2>4. WAN / Internet</h2>
        <div className="grid">
          <label>Connection type
            <select value={f.connectionType} onChange={set('connectionType')}>
              {['Internet', 'MPLS', 'SD-WAN', 'Internet + MPLS'].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label>Bandwidth
            <select value={f.bandwidthMbps} onChange={set('bandwidthMbps')}>
              {[[100, '100 Mbps'], [500, '500 Mbps'], [1000, '1 Gbps'], [10000, '10 Gbps']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>High availability (dual router / ISP / core)?<YesNo path="redundancy" /></label>
        </div>
      </section>

      <section>
        <h2>5. Departments (VLANs auto-created)</h2>
        {f.departments.map((d, i) => (
          <div className="row" key={i}>
            <span className="tag">VLAN {(i + 1) * 10}</span>
            <input placeholder="Department" value={d.name} onChange={setDept(i, 'name')} />
            <input type="number" min="0" placeholder="Users (optional)" value={d.users || ''} onChange={setDept(i, 'users')} />
            <button type="button" className="link" onClick={() => setF((p) => ({ ...p, departments: p.departments.filter((_, j) => j !== i) }))}>Remove</button>
          </div>
        ))}
        {f.departments.length < 9 && (
          <button type="button" className="secondary" onClick={() => setF((p) => ({ ...p, departments: [...p.departments, { name: '', users: 0 }] }))}>+ Add department</button>
        )}
        <p className="hint">Name a department "Guest" to get automatic guest isolation when ACLs are enabled.</p>
      </section>

      <section>
        <h2>6. IP Addressing</h2>
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
          <label>Public IPs needed?<YesNo path="publicIps.needed" /></label>
          {f.publicIps.needed && (
            <label>How many
              <select value={f.publicIps.count} onChange={set('publicIps.count')}>
                {[1, 5, 10, 20].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          )}
        </div>
      </section>

      <section>
        <h2>7. Servers</h2>
        <div className="checks">
          {SERVERS.map((s) => (
            <label key={s}><input type="checkbox" checked={f.servers.includes(s)} onChange={() => toggleServer(s)} />{s}</label>
          ))}
        </div>
      </section>

      <section>
        <h2>8. Security</h2>
        <div className="grid">
          <label>Firewall required?<YesNo path="security.firewall" /></label>
          <label>VPN
            <select value={f.security.vpn} onChange={set('security.vpn')}>
              <option value="none">None</option>
              <option value="site-to-site">Site-to-Site</option>
              <option value="remote-access">Remote Access</option>
            </select>
          </label>
          <label>ACLs required?<YesNo path="security.acl" /></label>
        </div>
      </section>

      <section>
        <h2>9. Monitoring</h2>
        <div className="checks">
          {['snmp', 'syslog', 'netflow'].map((m) => (
            <label key={m}><input type="checkbox" checked={f.monitoring[m]} onChange={set(`monitoring.${m}`)} />{m.toUpperCase()}</label>
          ))}
        </div>
      </section>

      <section>
        <h2>10. Special Requirements</h2>
        <textarea rows="3" value={f.notes} onChange={set('notes')} placeholder="e.g. Need segregation for PCI systems" />
      </section>

      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Generating...' : 'Generate Design'}</button>
    </form>
  );
}
