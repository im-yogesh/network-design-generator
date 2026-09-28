import { ROUTERS, FIREWALLS, CORE_SWITCH, ACCESS_SWITCH, pickByBandwidth } from './profiles.js';

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

export const MGMT_VLAN = { id: 99, name: 'MGMT' };
export const SERVER_VLAN = { id: 100, name: 'SERVERS' };

// Turns business requirements into technical decisions. No IPs here.
export function buildDesign(input) {
  const users = Number(input.users?.current) || 0;
  const growth = Number(input.users?.growthPct) || 0;
  const mbps = Number(input.bandwidthMbps) || 0;
  const departments = (input.departments || []).filter((d) => d.name?.trim());

  if (!input.customerName?.trim()) throw bad('Customer name is required');
  if (users < 1) throw bad('Number of users must be at least 1');
  if (!departments.length) throw bad('At least one department is required');
  if (mbps < 1) throw bad('Bandwidth is required');

  const designUsers = Math.ceil(users * (1 + growth / 100));
  const redundancy = !!input.redundancy;
  const multiSite = !!input.sites?.multiSite;
  const ispPeering = !!input.ispPeering;
  const internet = input.connectionType?.includes('Internet') || input.connectionType === 'SD-WAN';
  const reasons = [];

  // Routing decision from business answers
  const routing = {
    internal: multiSite ? 'OSPF' : 'Static',
    external: ispPeering ? 'BGP' : 'Static',
  };
  reasons.push(
    multiSite
      ? 'Multiple internal sites -> OSPF (area 0) for dynamic internal routing'
      : 'Single site -> static routing (simplest, no IGP needed)',
    ispPeering ? 'ISP peering required -> eBGP towards provider' : 'No ISP peering -> static default route to provider'
  );

  // Edge
  const router = pickByBandwidth(ROUTERS, mbps);
  if (!router) throw bad(`No router profile supports ${mbps} Mbps`);
  if (routing.external === 'BGP' && !router.bgp) throw bad(`${router.model} does not support BGP`);
  if (redundancy && !router.hsrp) throw bad(`${router.model} does not support HSRP`);
  const routerCount = redundancy ? 2 : 1;
  reasons.push(`${mbps} Mbps WAN -> ${router.model} (max ${router.maxMbps} Mbps)`);

  // Firewall
  const fw = input.security?.firewall ? pickByBandwidth(FIREWALLS, mbps) : null;
  if (input.security?.firewall && !fw) throw bad(`No firewall profile supports ${mbps} Mbps`);

  // VLANs: departments get 10, 20, 30...
  const share = Math.ceil(designUsers / departments.length);
  const vlans = departments.map((d, i) => {
    const deptUsers = Number(d.users) > 0 ? Math.ceil(Number(d.users) * (1 + growth / 100)) : share;
    return { id: (i + 1) * 10, name: d.name.trim().toUpperCase().replace(/\W+/g, '_'), users: deptUsers, kind: 'user' };
  });
  if (vlans.length > 9) throw bad('Maximum 9 departments supported (VLAN 10-90)');
  const servers = (input.servers || []).filter(Boolean);
  const allVlans = [...vlans, { ...MGMT_VLAN, users: 20, kind: 'mgmt' }];
  if (servers.length) allVlans.push({ ...SERVER_VLAN, users: servers.length, kind: 'server' });

  // Access layer: fill 48-port switches with user ports
  const portsNeeded = vlans.reduce((s, v) => s + v.users, 0);
  const accessCount = Math.max(1, Math.ceil(portsNeeded / ACCESS_SWITCH.ports));
  const coreCount = redundancy ? 2 : 1;
  const corePortsNeeded = (input.security?.firewall ? 3 : 1) + accessCount + Math.ceil(servers.length / coreCount);
  const corePortsFree = CORE_SWITCH.ports - (coreCount === 2 ? 2 : 0);
  if (corePortsNeeded > corePortsFree) {
    throw bad(`Design needs ${corePortsNeeded} core ports; ${CORE_SWITCH.model} has ${corePortsFree} free. Split into multiple buildings.`);
  }
  reasons.push(`${designUsers} users (incl. ${growth}% growth) -> ${accessCount} x ${ACCESS_SWITCH.model} (48 ports each)`);

  const warnings = [];
  if (!redundancy) warnings.push('No redundancy: edge router and core switch are single points of failure');
  if (fw && !redundancy) warnings.push('Single firewall: firewall is a single point of failure');
  if (!internet && input.publicIps?.needed) warnings.push('Public IPs requested but no Internet connection selected');
  if (vlans.some((v) => v.users > 250)) warnings.push('A department exceeds 250 users; consider splitting it into multiple VLANs');
  if (routing.external === 'BGP' && !input.publicIps?.needed) {
    warnings.push('BGP peering without public IPs: LAN block will be advertised (usually filtered by ISP)');
  }

  return {
    designUsers,
    redundancy,
    multiSite,
    internet,
    routing,
    reasons,
    warnings,
    router: { ...router, count: routerCount },
    firewall: fw ? { ...fw, count: redundancy ? 2 : 1 } : null,
    core: { ...CORE_SWITCH, count: coreCount },
    access: { ...ACCESS_SWITCH, count: accessCount },
    vlans: allVlans,
    servers,
    dhcp: servers.includes('DHCP'),
    nat: internet,
    acl: !!input.security?.acl,
    vpn: input.security?.vpn || 'none',
    monitoring: input.monitoring || {},
    dualIsp: redundancy,
  };
}
