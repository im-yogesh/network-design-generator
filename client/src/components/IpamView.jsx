import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function IpamView() {
  const [pools, setPools] = useState([]);
  useEffect(() => {
    api.pools().then(setPools);
  }, []);

  return (
    <div>
      <h2>IP Address Management</h2>
      {['private', 'wan', 'public'].map((type) => (
        <div key={type}>
          <h3>{type.toUpperCase()} pools</h3>
          <table>
            <thead>
              <tr><th>Network</th><th>Status</th><th>Assigned To</th></tr>
            </thead>
            <tbody>
              {pools.filter((p) => p.type === type).map((p) => (
                <tr key={p._id}>
                  <td>{p.network}</td>
                  <td><span className={`status ${p.status}`}>{p.status}</span></td>
                  <td>{p.assignedTo || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
