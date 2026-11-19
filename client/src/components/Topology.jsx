import { useMemo, memo } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position } from '@xyflow/react';

export const COLORS = { isp: '#64748b', router: '#2563eb', firewall: '#dc2626', core: '#7c3aed', access: '#059669', server: '#d97706', users: '#94a3b8' };

const ICONS = {
  isp: (c) => (
    <svg viewBox="0 0 64 48" width="56" height="42">
      <ellipse cx="32" cy="24" rx="26" ry="14" fill={c} opacity="0.2" stroke={c} strokeWidth="2" />
      <path d="M12 24c4-8 12-12 20-12s16 4 20 12M12 24c4 8 12 12 20 12s16-4 20-12" fill="none" stroke={c} strokeWidth="2" />
      <ellipse cx="32" cy="24" rx="6" ry="12" fill="none" stroke={c} strokeWidth="2" />
    </svg>
  ),
  router: (c) => (
    <svg viewBox="0 0 64 48" width="56" height="42">
      <rect x="8" y="14" width="48" height="24" rx="4" fill={c} />
      <circle cx="20" cy="26" r="3" fill="#fff" />
      <circle cx="32" cy="26" r="3" fill="#fff" />
      <circle cx="44" cy="26" r="3" fill="#fff" />
      <path d="M18 14V8M32 14V6M46 14V8" stroke={c} strokeWidth="2" strokeLinecap="round" />
      <circle cx="18" cy="6" r="2" fill={c} />
      <circle cx="32" cy="4" r="2" fill={c} />
      <circle cx="46" cy="6" r="2" fill={c} />
    </svg>
  ),
  firewall: (c) => (
    <svg viewBox="0 0 64 48" width="56" height="42">
      <rect x="10" y="6" width="44" height="36" rx="2" fill={c} />
      {[14, 22, 30, 38].map((y) => (
        <rect key={y} x="10" y={y} width="44" height="4" fill="#fff" opacity="0.35" />
      ))}
      <rect x="18" y="10" width="10" height="6" fill="#fff" opacity="0.9" />
      <rect x="36" y="18" width="10" height="6" fill="#fff" opacity="0.9" />
      <rect x="18" y="26" width="10" height="6" fill="#fff" opacity="0.9" />
      <rect x="36" y="34" width="10" height="6" fill="#fff" opacity="0.9" />
    </svg>
  ),
  core: (c) => (
    <svg viewBox="0 0 64 48" width="56" height="42">
      <rect x="6" y="8" width="52" height="10" rx="2" fill={c} />
      <rect x="6" y="20" width="52" height="10" rx="2" fill={c} opacity="0.85" />
      <rect x="6" y="32" width="52" height="10" rx="2" fill={c} opacity="0.7" />
      {[14, 26, 38].map((y) => (
        <g key={y}>
          <circle cx="16" cy={y} r="2" fill="#fff" />
          <circle cx="24" cy={y} r="2" fill="#fff" />
          <circle cx="32" cy={y} r="2" fill="#fff" />
          <circle cx="40" cy={y} r="2" fill="#fff" />
          <circle cx="48" cy={y} r="2" fill="#fff" />
        </g>
      ))}
    </svg>
  ),
  access: (c) => (
    <svg viewBox="0 0 64 48" width="56" height="42">
      <rect x="4" y="16" width="56" height="16" rx="2" fill={c} />
      {[12, 20, 28, 36, 44, 52].map((x) => (
        <rect key={x} x={x} y="20" width="4" height="8" rx="1" fill="#fff" />
      ))}
    </svg>
  ),
  server: (c) => (
    <svg viewBox="0 0 48 56" width="40" height="48">
      <rect x="8" y="4" width="32" height="48" rx="3" fill={c} />
      <rect x="14" y="10" width="20" height="8" rx="1" fill="#fff" opacity="0.9" />
      <rect x="14" y="22" width="20" height="8" rx="1" fill="#fff" opacity="0.7" />
      <rect x="14" y="34" width="20" height="8" rx="1" fill="#fff" opacity="0.5" />
      <circle cx="30" cy="46" r="2" fill="#4ade80" />
    </svg>
  ),
  users: (c) => (
    <svg viewBox="0 0 64 48" width="56" height="42">
      <rect x="18" y="8" width="28" height="20" rx="2" fill={c} />
      <rect x="28" y="28" width="8" height="6" fill={c} />
      <rect x="20" y="34" width="24" height="4" rx="1" fill={c} />
      <circle cx="14" cy="18" r="6" fill={c} opacity="0.55" />
      <circle cx="50" cy="18" r="6" fill={c} opacity="0.55" />
    </svg>
  ),
};

const DeviceNode = memo(({ data }) => {
  const color = COLORS[data.type] || '#64748b';
  const Icon = ICONS[data.type] || ICONS.users;
  return (
    <div className="topo-node">
      <Handle type="target" position={Position.Top} className="topo-handle" />
      <div className="topo-icon">{Icon(color)}</div>
      <div className="topo-label">{data.label}</div>
      {data.sub && <div className="topo-sub">{data.sub}</div>}
      <Handle type="source" position={Position.Bottom} className="topo-handle" />
    </div>
  );
});

const nodeTypes = { device: DeviceNode };

export default function Topology({ topology }) {
  const { nodes, edges } = useMemo(
    () => ({
      nodes: topology.nodes.map((n) => ({
        id: n.id,
        type: 'device',
        position: { x: n.x, y: n.y },
        data: { label: n.label, sub: n.sub, type: n.type },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      })),
      edges: topology.edges.map((e) => ({
        ...e,
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fill: '#64748b' },
        labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
      })),
    }),
    [topology]
  );

  return (
    <div className="topology">
      <ReactFlow defaultNodes={nodes} defaultEdges={edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}>
        <Background gap={18} color="#e2e8f0" />
        <Controls />
        <MiniMap nodeColor={(n) => COLORS[n.data?.type] || '#94a3b8'} />
      </ReactFlow>
    </div>
  );
}
