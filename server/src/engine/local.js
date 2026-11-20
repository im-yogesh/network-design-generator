import { ROUTERS, FIREWALLS, ACCESS_SWITCH, pickByBandwidth } from './profiles.js';
import { PORT_KINDS } from './plan.js';

const FW_INDUSTRIES = new Set(['Banking', 'Healthcare', 'Government']);

/** Deterministic design when all AI providers fail. */
export function localDesign(req) {
  const router = pickByBandwidth(ROUTERS, req.bandwidthMbps) || ROUTERS.at(-1);
  const needFw = FW_INDUSTRIES.has(req.industry);
  const firewallModel = needFw ? (pickByBandwidth(FIREWALLS, req.bandwidthMbps) || FIREWALLS.at(-1)).model : null;

  const portVlans = req.vlans.filter((v) => PORT_KINDS.includes(v.kind));
  const per = Math.max(1, Math.ceil(req.designUsers / Math.max(1, portVlans.length)));
  let remaining = req.designUsers;
  const vlans = req.vlans.map((v) => {
    if (PORT_KINDS.includes(v.kind)) {
      const hosts = Math.min(remaining, per);
      remaining = Math.max(0, remaining - hosts);
      return { id: v.id, hosts: Math.max(hosts, 1) };
    }
    if (v.kind === 'voice') return { id: v.id, hosts: req.designUsers };
    if (v.kind === 'mgmt' || v.kind === 'server') return { id: v.id, hosts: 20 };
    return { id: v.id, hosts: 20 };
  });
  if (portVlans.length) {
    const idx = vlans.findIndex((x) => x.id === portVlans[0].id);
    const covered = vlans.filter((x) => portVlans.some((p) => p.id === x.id)).reduce((s, x) => s + x.hosts, 0);
    if (covered < req.designUsers) vlans[idx].hosts += req.designUsers - covered;
  }

  const portsNeeded = vlans
    .filter((x) => portVlans.some((p) => p.id === x.id))
    .reduce((s, x) => s + x.hosts, 0);
  const accessCount = Math.max(1, Math.ceil(portsNeeded / ACCESS_SWITCH.ports));
  const internal = req.siteCount > 1 || req.deploymentType === 'Enterprise WAN' ? 'OSPF' : 'Static';
  const external = req.mpls || req.deploymentType === 'ISP MPLS VPN' ? 'BGP' : 'Static';

  return {
    routerModel: router.model,
    firewallModel,
    accessCount,
    routing: { internal, external },
    vlans,
    reasons: [
      `${req.bandwidthMbps} Mbps -> ${router.model}`,
      needFw ? `${req.industry} -> firewall ${firewallModel}` : `${req.industry} -> no firewall`,
      `Internal ${internal}, external ${external}`,
      `${accessCount} access switches`,
      'All AI providers unavailable -> local rules',
    ],
    warnings: !req.deviceHa ? ['Single edge device is a single point of failure'] : [],
    _engine: 'local',
  };
}
