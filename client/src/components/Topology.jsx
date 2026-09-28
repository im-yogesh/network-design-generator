import { useMemo } from 'react';
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';

export const COLORS = { isp: '#64748b', router: '#2563eb', firewall: '#dc2626', core: '#7c3aed', access: '#059669', server: '#d97706', users: '#94a3b8' };

export default function Topology({ topology }) {
  const { nodes, edges } = useMemo(
    () => ({
      nodes: topology.nodes.map((n) => ({
        id: n.id,
        position: { x: n.x, y: n.y },
        data: {
          label: (
            <div>
              <b>{n.label}</b>
              <div className="sub">{n.sub}</div>
            </div>
          ),
        },
        style: { background: COLORS[n.type], color: 'white', border: 'none', borderRadius: 6, width: 150, fontSize: 12 },
      })),
      edges: topology.edges.map((e) => ({ ...e, style: { stroke: '#94a3b8' }, labelStyle: { fontSize: 10 } })),
    }),
    [topology]
  );

  return (
    <div className="topology">
      <ReactFlow defaultNodes={nodes} defaultEdges={edges} fitView>
        <Background />
        <Controls />
        <MiniMap nodeColor={(n) => n.style.background} />
      </ReactFlow>
    </div>
  );
}
