import { parseCidr, intToIp, subnetInfo, carve, prefixForHosts } from './ip.js';

const EDGE_VLAN = 900;
const INSIDE_VLAN = 901;

// VLAN ID becomes the 3rd octet when the block is a /16 or larger (10.50.10.0/24 = VLAN 10).
function lanSubnets(block, vlans, transitKeys) {
  const b = parseCidr(block);
  const need = (v) => prefixForHosts(v.users + 10);
  const transits = transitKeys.map((key) => ({ key, prefix: 29 }));
  if (b.prefix <= 16 && vlans.every((v) => need(v) >= 24)) {
    const out = carve(`${intToIp(b.base + 255 * 256)}/24`, transits);
    for (const v of vlans) out[v.id] = subnetInfo(`${intToIp(b.base + v.id * 256)}/24`);
    return out;
  }
  return carve(block, [...vlans.map((v) => ({ key: v.id, prefix: need(v) })), ...transits]);
}

// Transit /29 layout: .1 upper VIP, .2/.3 upper pair, .4 lower VIP, .5/.6 lower pair.
// Single device takes the VIP address; ASA pair uses VIP as active IP, next as standby.
function layer(subnet, pos, count, kind) {
  const o = pos === 'upper' ? 1 : 4;
  const vip = subnet.at(o);
  if (count === 1) return { vip, ips: [vip], hsrp: false };
  if (kind === 'asa') return { vip, ips: [vip, vip], standby: subnet.at(o + 1), hsrp: false };
  return { vip, ips: [subnet.at(o + 1), subnet.at(o + 2)], hsrp: true };
}

export function buildPlan(design, input, { lanBlock, wanLinks, publicBlock }) {
  const fw = design.firewall;
  const R = design.router.count;
  const C = design.core.count;
  const lan = subnetInfo(lanBlock);
  const transitKeys = fw ? ['edge', 'inside'] : ['edge'];
  const subnets = lanSubnets(lanBlock, design.vlans, transitKeys);
  const vlanOf = (id) => subnets[id];

  const mgmt = vlanOf(99);
  const srvNet = design.servers.length ? vlanOf(100) : null;
  const servers = design.servers.map((name, i) => ({
    name,
    hostname: `SRV-${name.toUpperCase().replace(/\W+/g, '')}`,
    ip: srvNet.at(10 + i),
    core: i % C,
  }));
  const serverIp = (n) => servers.find((s) => s.name === n)?.ip;
  const nms = mgmt.lastHost;

  // Transit segments
  const edge = subnets.edge;
  const inside = fw ? subnets.inside : null;
  const rtrL = layer(edge, 'upper', R, 'hsrp');
  const fwOut = fw ? layer(edge, 'lower', fw.count, 'asa') : null;
  const fwIn = fw ? layer(inside, 'upper', fw.count, 'asa') : null;
  const coreL = fw ? layer(inside, 'lower', C, 'hsrp') : layer(edge, 'lower', C, 'hsrp');
  const coreTransit = fw ? { net: inside, vlan: INSIDE_VLAN } : { net: edge, vlan: EDGE_VLAN };
  const coreNextHop = fw ? fwIn.vip : rtrL.vip;
  const routerLanNextHop = fw ? fwOut.vip : coreL.vip;

  const wan = wanLinks.map((cidr, i) => {
    const s = subnetInfo(cidr);
    return { cidr: s.cidr, mask: s.mask, pe: s.firstHost, ce: s.secondHost, isp: `ISP-${i + 1}` };
  });
  const pub = publicBlock ? subnetInfo(publicBlock) : null;
  const webIp = serverIp('Web');
  const staticNat = pub && webIp ? { inside: webIp, outside: pub.firstHost } : null;

  const common = {
    customer: input.customerName,
    domain: `${input.customerName.toLowerCase().replace(/\W+/g, '')}.local`,
    ntp: serverIp('NTP'),
    nms,
    monitoring: design.monitoring,
    vtyAcl: design.acl ? { network: mgmt.network, wildcard: mgmt.wildcard } : null,
  };
  const useOspf = design.routing.internal === 'OSPF';
  let rid = 0;
  const nextRid = () => (++rid, `${rid}.${rid}.${rid}.${rid}`);
  const devices = [];

  // Edge routers
  for (let i = 0; i < R; i++) {
    const w = wan[i];
    devices.push({
      ...common,
      hostname: `R${i + 1}`,
      role: 'router',
      model: design.router.model,
      routerId: nextRid(),
      interfaces: [
        { name: 'GigabitEthernet0/0/0', description: `WAN to ${w.isp}`, ip: w.ce, mask: w.mask, nat: design.nat ? 'outside' : null },
        {
          name: 'GigabitEthernet0/0/1',
          description: fw ? `To FW${i + 1} outside` : `To CORE${i + 1}`,
          ip: rtrL.ips[i],
          mask: edge.mask,
          nat: design.nat ? 'inside' : null,
          hsrp: rtrL.hsrp ? { group: 1, vip: rtrL.vip, priority: i === 0 ? 110 : 100, track: 1 } : null,
        },
      ],
      track: rtrL.hsrp ? { id: 1, interface: 'GigabitEthernet0/0/0' } : null,
      staticRoutes: [
        ...(design.routing.external === 'Static' ? [{ net: '0.0.0.0', mask: '0.0.0.0', nh: w.pe, name: 'DEFAULT' }] : []),
        ...(!useOspf || fw ? [{ net: lan.network, mask: lan.mask, nh: routerLanNextHop, name: 'CUSTOMER_LAN' }] : []),
      ],
      ospf: useOspf && !fw ? { networks: [{ net: edge.network, wildcard: edge.wildcard }], defaultOriginate: true, passive: [] } : null,
      bgp:
        design.routing.external === 'BGP'
          ? {
              asn: 65001,
              neighbor: w.pe,
              remoteAs: 65000,
              advertise: pub ? { net: pub.network, mask: pub.mask } : { net: lan.network, mask: lan.mask },
            }
          : null,
      nat: design.nat ? { lan: { network: lan.network, wildcard: lan.wildcard }, outside: 'GigabitEthernet0/0/0', static: staticNat } : null,
      netflow: design.monitoring.netflow ? { collector: nms, interface: 'GigabitEthernet0/0/0' } : null,
    });
  }

  // Firewall (ASA syntax), HA pair shares one config
  if (fw) {
    devices.push({
      ...common,
      hostname: 'FW1',
      role: 'firewall',
      model: fw.model,
      pair: fw.count === 2,
      outside: { name: 'Ethernet1/1', ip: fwOut.vip, standby: fwOut.standby, mask: edge.mask },
      inside: { name: 'Ethernet1/2', ip: fwIn.vip, standby: fwIn.standby, mask: inside.mask },
      failover: fw.count === 2 ? { name: 'Ethernet1/8', ip: '192.0.2.1', standby: '192.0.2.2', mask: '255.255.255.252' } : null,
      defaultGw: rtrL.vip,
      lan: { network: lan.network, mask: lan.mask, nh: coreL.vip },
      webServer: staticNat ? webIp : null,
      vpn: design.vpn,
    });
  }

  // Core switches
  const userVlans = design.vlans.filter((v) => v.kind === 'user');
  const guest = userVlans.find((v) => v.name === 'GUEST');
  const helper = serverIp('DHCP');
  const dnsIp = serverIp('DNS') || '8.8.8.8';
  const vlanRows = design.vlans.map((v) => ({ ...v, net: vlanOf(v.id) }));
  const coreUplinks = fw
    ? [
        { desc: (i) => `To R${i + 1}`, vlan: EDGE_VLAN },
        { desc: (i) => `To FW${i + 1} outside`, vlan: EDGE_VLAN },
        { desc: (i) => `To FW${i + 1} inside`, vlan: INSIDE_VLAN },
      ]
    : [{ desc: (i) => `To R${i + 1}`, vlan: EDGE_VLAN }];
  const P = design.core.portPrefix;
  const allowed = [...design.vlans.map((v) => v.id)].join(',');

  for (let i = 0; i < C; i++) {
    let port = 1;
    const ifaces = [];
    for (const u of coreUplinks) ifaces.push({ name: `${P}${port++}`, description: u.desc(i), mode: 'access', vlan: u.vlan });
    for (let a = 0; a < design.access.count; a++) {
      ifaces.push({ name: `${P}${port++}`, description: `To ACC${a + 1}`, mode: 'trunk', allowed });
    }
    for (const s of servers.filter((s) => s.core === i)) {
      ifaces.push({ name: `${P}${port++}`, description: s.hostname, mode: 'access', vlan: 100, portfast: true });
    }
    if (C === 2) {
      for (const p of [15, 16]) ifaces.push({ name: `${P}${p}`, description: 'Core interlink', mode: 'trunk', allowed: `${allowed},${EDGE_VLAN},${INSIDE_VLAN}`, channel: 1 });
      ifaces.push({ name: 'Port-channel1', description: 'Core interlink', mode: 'trunk', allowed: `${allowed},${EDGE_VLAN},${INSIDE_VLAN}` });
    }
    const hsrp = (group, vip) => (C === 2 ? { group, vip, priority: i === 0 ? 110 : 100 } : null);
    const svis = vlanRows.map((v) => ({
      name: `Vlan${v.id}`,
      description: v.name,
      ip: C === 2 ? v.net.at(2 + i) : v.net.firstHost,
      mask: v.net.mask,
      hsrp: hsrp(v.id, v.net.firstHost),
      helper: v.kind === 'user' && helper ? helper : null,
      acl: guest && v.id === guest.id && design.acl ? 'GUEST_IN' : null,
    }));
    svis.push({
      name: `Vlan${coreTransit.vlan}`,
      description: 'TRANSIT',
      ip: coreL.ips[i],
      mask: coreTransit.net.mask,
      hsrp: coreL.hsrp ? { group: coreTransit.vlan, vip: coreL.vip, priority: i === 0 ? 110 : 100 } : null,
    });

    devices.push({
      ...common,
      hostname: `CORE${i + 1}`,
      role: 'core',
      model: design.core.model,
      routerId: nextRid(),
      vlans: [
        ...design.vlans.map((v) => ({ id: v.id, name: v.name })),
        { id: EDGE_VLAN, name: 'TRANSIT_EDGE' },
        ...(fw ? [{ id: INSIDE_VLAN, name: 'TRANSIT_INSIDE' }] : []),
      ],
      stpRoot: C === 2 ? (i === 0 ? 'primary' : 'secondary') : 'primary',
      ipRouting: true,
      interfaces: [...ifaces, ...svis],
      staticRoutes: !useOspf || fw ? [{ net: '0.0.0.0', mask: '0.0.0.0', nh: coreNextHop, name: 'DEFAULT' }] : [],
      ospf: useOspf
        ? {
            networks: [...vlanRows.map((v) => ({ net: v.net.network, wildcard: v.net.wildcard })), { net: coreTransit.net.network, wildcard: coreTransit.net.wildcard }],
            passiveDefault: true,
            active: [`Vlan${coreTransit.vlan}`],
          }
        : null,
      dhcpPools:
        !helper && i === 0
          ? userVlans.map((v) => ({ name: v.name, net: vlanOf(v.id), dns: dnsIp, domain: common.domain }))
          : null,
      guestAcl: guest && design.acl ? { guest: vlanOf(guest.id), lan } : null,
    });
  }

  // Access switches: fill ports department by department
  const A = design.access.count;
  const access = Array.from({ length: A }, (_, a) => ({ ranges: [], used: 0, idx: a }));
  let sw = 0;
  for (const v of userVlans) {
    let left = v.users;
    while (left > 0 && sw < A) {
      const s = access[sw];
      const take = Math.min(left, design.access.ports - s.used);
      s.ranges.push({ from: s.used + 1, to: s.used + take, vlan: v.id, name: v.name });
      s.used += take;
      left -= take;
      if (s.used >= design.access.ports) sw++;
    }
  }
  for (const s of access) {
    devices.push({
      ...common,
      hostname: `ACC${s.idx + 1}`,
      role: 'access',
      model: design.access.model,
      vlans: design.vlans.filter((v) => v.kind !== 'server').map((v) => ({ id: v.id, name: v.name })),
      portRanges: s.ranges.map((r) => ({ ...r, range: `${design.access.portPrefix}${r.from} - ${r.to}` })),
      interfaces: [
        ...Array.from({ length: C }, (_, c) => ({
          name: `${design.access.uplinkPrefix}${c + 1}`,
          description: `Uplink to CORE${c + 1}`,
          mode: 'trunk',
          allowed,
        })),
        { name: 'Vlan99', description: 'MGMT', ip: mgmt.at(11 + s.idx), mask: mgmt.mask },
      ],
      defaultGateway: mgmt.firstHost,
      users: s.used,
    });
  }

  const ipPlan = {
    lanBlock: lan.cidr,
    vlans: vlanRows.map((v) => ({
      id: v.id,
      name: v.name,
      users: v.users,
      network: v.net.cidr,
      mask: v.net.mask,
      gateway: v.net.firstHost,
      range: `${v.net.at(11)} - ${v.net.lastHost}`,
    })),
    transits: [
      { name: `Edge transit (VLAN ${EDGE_VLAN})`, network: edge.cidr },
      ...(inside ? [{ name: `Inside transit (VLAN ${INSIDE_VLAN})`, network: inside.cidr }] : []),
    ],
    wan,
    public: pub ? { network: pub.cidr, usable: `${pub.firstHost} - ${pub.lastHost}`, staticNat } : null,
    servers,
    managementIps: devices
      .filter((d) => d.role === 'access')
      .map((d) => ({ device: d.hostname, ip: d.interfaces.at(-1).ip }))
      .concat(devices.filter((d) => d.role === 'core').map((d) => ({ device: d.hostname, ip: d.interfaces.find((x) => x.name === 'Vlan99').ip }))),
  };

  return { devices, ipPlan, topology: buildTopology(design, devices, servers, wan, access) };
}

function buildTopology(design, devices, servers, wan, access) {
  const nodes = [];
  const edges = [];
  const add = (id, label, type, layerIdx, extra = {}) => nodes.push({ id, label, type, layer: layerIdx, ...extra });
  const link = (source, target, label = '') => edges.push({ id: `${source}-${target}`, source, target, label });
  const byRole = (r) => devices.filter((d) => d.role === r);

  const routers = byRole('router');
  const cores = byRole('core');
  const accs = byRole('access');

  wan.forEach((w, i) => add(w.isp, w.isp, 'isp', 0, { sub: w.cidr }));
  routers.forEach((r, i) => {
    add(r.hostname, r.hostname, 'router', 1, { sub: r.model });
    link(wan[i].isp, r.hostname, wan[i].cidr);
  });
  const fwCount = design.firewall?.count || 0;
  for (let i = 0; i < fwCount; i++) {
    const id = `FW${i + 1}`;
    add(id, id, 'firewall', 2, { sub: `${design.firewall.model}${fwCount === 2 ? (i ? ' (standby)' : ' (active)') : ''}` });
    link(routers[i].hostname, id);
  }
  if (fwCount === 2) link('FW1', 'FW2', 'failover');
  cores.forEach((c, i) => {
    add(c.hostname, c.hostname, 'core', 3, { sub: c.model });
    link(fwCount ? `FW${i + 1}` : routers[i].hostname, c.hostname);
  });
  if (cores.length === 2) link('CORE1', 'CORE2', 'Po1 trunk / HSRP');
  accs.forEach((a, i) => {
    add(a.hostname, a.hostname, 'access', 4, { sub: a.model });
    cores.forEach((c) => link(c.hostname, a.hostname));
    add(`USERS${i + 1}`, `${access[i].used} users`, 'users', 5, { sub: access[i].ranges.map((r) => r.name).join(', ') });
    link(a.hostname, `USERS${i + 1}`);
  });
  servers.forEach((s) => {
    add(s.hostname, s.hostname, 'server', 4, { sub: s.ip });
    link(cores[s.core].hostname, s.hostname);
  });

  // Layered layout shared by UI and PDF
  const GAP = 190;
  const byLayer = {};
  for (const n of nodes) (byLayer[n.layer] ||= []).push(n);
  for (const list of Object.values(byLayer)) {
    list.forEach((n, i) => {
      n.x = Math.round((i - (list.length - 1) / 2) * GAP);
      n.y = n.layer * 130;
    });
  }
  for (const n of byLayer[5] || []) n.x = nodes.find((a) => a.id === n.id.replace('USERS', 'ACC')).x;
  return { nodes, edges };
}
