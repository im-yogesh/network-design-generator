export default function History({ list, onOpen, onDelete }) {
  if (!list.length) return <p className="hint">No designs yet.</p>;
  return (
    <table>
      <thead>
        <tr><th>Customer</th><th>Users</th><th>LAN Block</th><th>Created</th><th /></tr>
      </thead>
      <tbody>
        {list.map((d) => (
          <tr key={d._id}>
            <td><button className="link" onClick={() => onOpen(d._id)}>{d.customerName}</button></td>
            <td>{d.design?.designUsers}</td>
            <td>{d.ipPlan?.lanBlock}</td>
            <td>{new Date(d.createdAt).toLocaleString()}</td>
            <td>
              <button className="link danger" onClick={() => confirm(`Delete ${d.customerName} and release its IPs?`) && onDelete(d._id)}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
