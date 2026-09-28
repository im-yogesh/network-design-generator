import { useState } from 'react';
import { api } from '../api.js';
import Topology from './Topology.jsx';

const TABS = ['HLD', 'Topology', 'IP Plan', 'Configurations', 'BOM'];

const download = (name, text) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
};

const Table = ({ cols, rows }) => (
  <table>
    <thead>
      <tr>{cols.map(([, label]) => <th key={label}>{label}</th>)}</tr>
    </thead>
    <tbody>
      {rows.map((r, i) => (
        <tr key={i}>{cols.map(([key, label]) => <td key={label}>{r[key]}</td>)}</tr>
      ))}
    </tbody>
  </table>
);

export default function DesignView({ design: doc }) {
  const [tab, setTab] = useState('HLD');
  const [device, setDevice] = useState(Object.keys(doc.configs)[0]);
  const { design, ipPlan, configs, bom } = doc;
  const slug = doc.customerName.replace(/\W+/g, '_');

  return (
    <div className="design">
      <div className="design-head">
        <div>
          <h2>{doc.customerName}</h2>
          <span className="hint">{new Date(doc.createdAt).toLocaleString()} · {design.designUsers} users · {ipPlan.lanBlock}</span>
        </div>
        <a className="primary" href={api.pdfUrl(doc._id)}>Download PDF Report</a>
      </div>

      <div className="tabs">
        {TABS.map((t) => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'HLD' && (
        <div className="cards">
          <div className="card">
            <h3>Recommended Devices</h3>
            <ul>
              <li>{design.router.count} × Cisco {design.router.model} (Edge)</li>
              {design.firewall && <li>{design.firewall.count} × Cisco {design.firewall.model} (Firewall)</li>}
              <li>{design.core.count} × Cisco {design.core.model} (Core)</li>
              <li>{design.access.count} × Cisco {design.access.model} (Access)</li>
              {design.servers.length > 0 && <li>{design.servers.length} Servers ({design.servers.join(', ')})</li>}
            </ul>
          </div>
          <div className="card">
            <h3>Architecture</h3>
            <ul>
              <li>Routing: internal <b>{design.routing.internal}</b>, external <b>{design.routing.external}</b></li>
              <li>Redundancy: {design.redundancy ? 'HSRP on core + edge, dual ISP' : 'None'}</li>
              <li>NAT: {design.nat ? 'Yes (PAT on edge)' : 'No'}</li>
              <li>{design.vlans.length} VLANs</li>
            </ul>
          </div>
          <div className="card wide">
            <h3>Design Decisions</h3>
            <ul>{design.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
          {design.warnings.length > 0 && (
            <div className="card wide warn">
              <h3>Risks / Warnings</h3>
              <ul>{design.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {tab === 'Topology' && <Topology key={doc._id} topology={doc.topology} />}

      {tab === 'IP Plan' && (
        <div>
          <h3>VLAN & IP Plan ({ipPlan.lanBlock})</h3>
          <Table cols={[['id', 'VLAN'], ['name', 'Name'], ['users', 'Hosts'], ['network', 'Network'], ['gateway', 'Gateway'], ['range', 'Host range']]} rows={ipPlan.vlans} />
          <h3>WAN Links</h3>
          <Table cols={[['isp', 'Link'], ['cidr', 'Network'], ['pe', 'Provider PE'], ['ce', 'Customer CE']]} rows={ipPlan.wan} />
          <h3>Transit Networks</h3>
          <Table cols={[['name', 'Segment'], ['network', 'Network']]} rows={ipPlan.transits} />
          {ipPlan.public && (
            <>
              <h3>Public IP Block</h3>
              <p>{ipPlan.public.network} (usable {ipPlan.public.usable})
                {ipPlan.public.staticNat && <> · Static NAT {ipPlan.public.staticNat.outside} → {ipPlan.public.staticNat.inside} (Web)</>}</p>
            </>
          )}
          {ipPlan.servers.length > 0 && (
            <>
              <h3>Servers</h3>
              <Table cols={[['hostname', 'Server'], ['ip', 'IP'], ['core', 'Core']]} rows={ipPlan.servers.map((s) => ({ ...s, core: `CORE${s.core + 1}` }))} />
            </>
          )}
          <h3>Management IPs</h3>
          <Table cols={[['device', 'Device'], ['ip', 'IP']]} rows={ipPlan.managementIps} />
        </div>
      )}

      {tab === 'Configurations' && (
        <div className="configs">
          <div className="device-list">
            {Object.keys(configs).map((h) => (
              <button key={h} className={device === h ? 'active' : ''} onClick={() => setDevice(h)}>{h}</button>
            ))}
            <button className="secondary" onClick={() => download(`${slug}_all_configs.txt`, Object.values(configs).join('\n\n'))}>Download all</button>
          </div>
          <div className="config-pane">
            <div className="config-actions">
              <button className="secondary" onClick={() => navigator.clipboard.writeText(configs[device])}>Copy</button>
              <button className="secondary" onClick={() => download(`${device}.txt`, configs[device])}>Download {device}.txt</button>
            </div>
            <pre>{configs[device]}</pre>
          </div>
        </div>
      )}

      {tab === 'BOM' && (
        <div>
          <Table
            cols={[['item', 'Item'], ['model', 'Model'], ['qty', 'Qty'], ['unit', 'Unit'], ['total', 'Total']]}
            rows={[...bom.rows, { item: <b>TOTAL</b>, total: bom.total }].map((r) => ({
              ...r,
              unit: r.unit && `$${r.unit.toLocaleString()}`,
              total: `$${r.total.toLocaleString()}`,
            }))}
          />
          <p className="hint">{bom.currency}</p>
        </div>
      )}
    </div>
  );
}
