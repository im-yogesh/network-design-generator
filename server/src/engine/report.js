import PDFDocument from 'pdfkit';
import { SERVER } from './profiles.js';

export function buildBom(design) {
  const rows = [
    { item: 'Edge Router', model: design.router.model, qty: design.router.count, unit: design.router.price },
    ...(design.firewall ? [{ item: 'Firewall', model: design.firewall.model, qty: design.firewall.count, unit: design.firewall.price }] : []),
    { item: 'Core Switch', model: design.core.model, qty: design.core.count, unit: design.core.price },
    { item: 'Access Switch', model: design.access.model, qty: design.access.count, unit: design.access.price },
    ...(design.servers.length ? [{ item: `Servers (${design.servers.join(', ')})`, model: SERVER.model, qty: design.servers.length, unit: SERVER.price }] : []),
  ].map((r) => ({ ...r, total: r.qty * r.unit }));
  return { rows, total: rows.reduce((s, r) => s + r.total, 0), currency: 'USD (list price estimate)' };
}

const COLORS = { isp: '#64748b', router: '#2563eb', firewall: '#dc2626', core: '#7c3aed', access: '#059669', server: '#d97706', users: '#94a3b8' };

export function streamReport(doc, res) {
  const pdf = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  pdf.pipe(res);
  const W = pdf.page.width - 80;
  const { input, design, ipPlan, topology, configs, bom } = doc;

  const h1 = (t) => {
    pdf.moveDown(0.8).font('Helvetica-Bold').fontSize(15).fillColor('#1e3a8a').text(t).moveDown(0.3);
    pdf.font('Helvetica').fontSize(10).fillColor('black');
  };
  const h2 = (t) => pdf.moveDown(0.4).font('Helvetica-Bold').fontSize(11).text(t).font('Helvetica').fontSize(10);
  const kv = (pairs) => pairs.forEach(([k, v]) => pdf.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(String(v ?? '-')));
  const bullets = (items) => items.forEach((t) => pdf.text(`•  ${t}`, { indent: 8 }));
  const table = (cols, rows) => {
    const widths = cols.map((c) => c.w * W);
    const drawRow = (cells, bold) => {
      if (pdf.y > pdf.page.height - 70) pdf.addPage();
      const y = pdf.y;
      pdf.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      let x = 40;
      let h = 0;
      cells.forEach((c, i) => {
        pdf.text(String(c ?? ''), x + 3, y + 3, { width: widths[i] - 6 });
        h = Math.max(h, pdf.y - y);
        x += widths[i];
      });
      h += 3;
      if (bold) pdf.rect(40, y, W, h).fillOpacity(0.08).fill('#1e3a8a').fillOpacity(1).fillColor('black');
      pdf.moveTo(40, y + h).lineTo(40 + W, y + h).strokeColor('#cbd5e1').stroke();
      pdf.x = 40;
      pdf.y = y + h;
    };
    drawRow(cols.map((c) => c.label), true);
    rows.forEach((r) => drawRow(cols.map((c) => r[c.key])));
    pdf.fontSize(10).moveDown(0.5);
  };

  // Cover
  pdf.font('Helvetica-Bold').fontSize(24).fillColor('#1e3a8a').text('Network Design Document', { align: 'center' }).moveDown(0.5);
  pdf.fontSize(16).fillColor('black').text(input.customerName, { align: 'center' });
  pdf.font('Helvetica').fontSize(10).text(`Generated ${new Date(doc.createdAt).toLocaleString()}`, { align: 'center' }).moveDown(2);

  h1('1. Customer Requirements');
  kv([
    ['Industry', input.industry],
    ['Project type', input.projectType],
    ['Site address', input.siteAddress],
    ['Users', `${input.users?.current} current, ${input.users?.growthPct || 0}% growth -> designed for ${design.designUsers}`],
    ['Sites', design.multiSite ? `Multiple (${input.sites?.branches || 0} branches)` : 'Single site'],
    ['WAN', `${input.bandwidthMbps} Mbps ${input.connectionType}`],
    ['High availability', design.redundancy ? 'Yes' : 'No'],
    ['Departments', input.departments.map((d) => d.name).join(', ')],
    ['Servers', design.servers.join(', ') || 'None'],
    ['Firewall / VPN / ACL', `${input.security?.firewall ? 'Yes' : 'No'} / ${design.vpn} / ${design.acl ? 'Yes' : 'No'}`],
  ]);
  if (input.notes) kv([['Notes', input.notes]]);

  h1('2. High Level Design (HLD)');
  h2('Architecture');
  bullets([
    `${design.redundancy ? 'Redundant' : 'Single-path'} Core/Access (collapsed core) architecture`,
    `Edge: ${design.router.count} x ${design.router.model}${design.dualIsp ? ' on dual ISP links' : ''}`,
    ...(design.firewall ? [`Security: ${design.firewall.count} x ${design.firewall.model}${design.firewall.count === 2 ? ' (active/standby)' : ''}`] : []),
    `Core: ${design.core.count} x ${design.core.model}${design.redundancy ? ' with HSRP gateway redundancy' : ''}`,
    `Access: ${design.access.count} x ${design.access.model}`,
    `Routing: internal ${design.routing.internal}, external ${design.routing.external}`,
  ]);
  h2('Design decisions');
  bullets(design.reasons);
  if (design.warnings.length) {
    h2('Risks / warnings');
    pdf.fillColor('#b91c1c');
    bullets(design.warnings);
    pdf.fillColor('black');
  }

  pdf.addPage();
  h1('3. Topology');
  drawTopology(pdf, topology, W);

  pdf.addPage();
  h1('4. Low Level Design (LLD)');
  h2(`VLAN & IP plan (customer block ${ipPlan.lanBlock})`);
  table(
    [
      { key: 'id', label: 'VLAN', w: 0.08 },
      { key: 'name', label: 'Name', w: 0.15 },
      { key: 'users', label: 'Hosts', w: 0.08 },
      { key: 'network', label: 'Network', w: 0.2 },
      { key: 'gateway', label: 'Gateway', w: 0.17 },
      { key: 'range', label: 'Host range', w: 0.32 },
    ],
    ipPlan.vlans
  );
  h2('WAN links');
  table(
    [
      { key: 'isp', label: 'Link', w: 0.2 },
      { key: 'cidr', label: 'Network', w: 0.3 },
      { key: 'pe', label: 'Provider PE', w: 0.25 },
      { key: 'ce', label: 'Customer CE', w: 0.25 },
    ],
    ipPlan.wan
  );
  h2('Transit networks');
  table([{ key: 'name', label: 'Segment', w: 0.5 }, { key: 'network', label: 'Network', w: 0.5 }], ipPlan.transits);
  if (ipPlan.public) {
    h2('Public IP block');
    kv([['Block', ipPlan.public.network], ['Usable', ipPlan.public.usable]]);
    if (ipPlan.public.staticNat) kv([['Static NAT', `${ipPlan.public.staticNat.outside} -> ${ipPlan.public.staticNat.inside} (Web)`]]);
  }
  if (ipPlan.servers.length) {
    h2('Server placement (VLAN 100)');
    table([{ key: 'hostname', label: 'Server', w: 0.4 }, { key: 'ip', label: 'IP', w: 0.3 }, { key: 'core', label: 'Core switch', w: 0.3 }],
      ipPlan.servers.map((s) => ({ ...s, core: `CORE${s.core + 1}` })));
  }
  h2('Management IPs (VLAN 99)');
  table([{ key: 'device', label: 'Device', w: 0.5 }, { key: 'ip', label: 'IP', w: 0.5 }], ipPlan.managementIps);

  h1('5. Bill of Materials');
  table(
    [
      { key: 'item', label: 'Item', w: 0.34 },
      { key: 'model', label: 'Model', w: 0.2 },
      { key: 'qty', label: 'Qty', w: 0.1 },
      { key: 'unit', label: 'Unit', w: 0.16 },
      { key: 'total', label: 'Total', w: 0.2 },
    ],
    [...bom.rows, { item: 'TOTAL', total: bom.total }].map((r) => ({ ...r, unit: r.unit && `$${r.unit.toLocaleString()}`, total: `$${r.total.toLocaleString()}` }))
  );
  pdf.fontSize(8).text(`Prices: ${bom.currency}`).fontSize(10);

  h1('6. Implementation Notes');
  bullets([
    'Replace every CHANGE_ME secret/community before deployment.',
    'Generate SSH keys on each IOS device: crypto key generate rsa modulus 2048.',
    'Configure core switches first, then access switches, then edge routers, then firewall.',
    'Verify: show standby brief, show ip route, show ip nat translations, show spanning-tree root.',
    ...(design.routing.external === 'BGP' ? ['Confirm provider AS number and PE address with ISP before enabling BGP.'] : []),
  ]);

  pdf.addPage();
  h1('7. Appendix: Device Configurations');
  for (const [host, cfg] of Object.entries(configs)) {
    if (pdf.y > pdf.page.height - 120) pdf.addPage();
    h2(host);
    pdf.font('Courier').fontSize(7).text(cfg).font('Helvetica').fontSize(10);
  }

  const range = pdf.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    pdf.switchToPage(i);
    pdf.fontSize(8).fillColor('#64748b').text(`${input.customerName} - Page ${i + 1} of ${range.count}`, 40, pdf.page.height - 30, { align: 'center', width: W, lineBreak: false });
  }
  pdf.end();
}

function drawTopology(pdf, { nodes, edges }, W) {
  const xs = nodes.map((n) => n.x);
  const minX = Math.min(...xs);
  const span = Math.max(...xs) - minX || 1;
  const bw = 78;
  const bh = 30;
  const s = Math.min(1, (W - bw) / span);
  const top = pdf.y + 10;
  const pos = Object.fromEntries(
    nodes.map((n) => [n.id, { x: 40 + (W - span * s - bw) / 2 + (n.x - minX) * s, y: top + n.y * 0.8 }])
  );
  pdf.lineWidth(0.8).strokeColor('#94a3b8');
  for (const e of edges) {
    const a = pos[e.source];
    const b = pos[e.target];
    if (a.y === b.y) pdf.moveTo(a.x + bw, a.y + bh / 2).lineTo(b.x, b.y + bh / 2).stroke();
    else pdf.moveTo(a.x + bw / 2, a.y + bh).lineTo(b.x + bw / 2, b.y).stroke();
  }
  for (const n of nodes) {
    const p = pos[n.id];
    pdf.roundedRect(p.x, p.y, bw, bh, 4).fill(COLORS[n.type]);
    pdf.fillColor('white').font('Helvetica-Bold').fontSize(7).text(n.label, p.x, p.y + 5, { width: bw, align: 'center', lineBreak: false });
    pdf.font('Helvetica').fontSize(6).text(n.sub || '', p.x + 2, p.y + 16, { width: bw - 4, align: 'center', lineBreak: false, ellipsis: true });
  }
  pdf.fillColor('black').font('Helvetica').fontSize(10);
  pdf.y = top + Math.max(...nodes.map((n) => n.y)) * 0.8 + bh + 20;
  pdf.x = 40;
}
