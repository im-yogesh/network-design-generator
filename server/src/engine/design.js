import { ROUTERS, FIREWALLS, CORE_SWITCH, ACCESS_SWITCH } from './profiles.js';
import { EDGE_VLAN, INSIDE_VLAN, PORT_KINDS } from './plan.js';
import { askGemini } from './ai.js';

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const badAi = (msg) => Object.assign(new Error(`AI returned an invalid design: ${msg}`), { status: 502 });

const MGMT_VLAN = { id: 99, name: 'MGMT', kind: 'mgmt' };
const SERVER_VLAN = { id: 100, name: 'SERVERS', kind: 'server' };
export const DEPT_KINDS = { 'User VLAN': 'user', 'Guest VLAN': 'guest', 'Voice VLAN': 'voice', 'Server VLAN': 'server', 'Management VLAN': 'mgmt' };
const SINGLE_KINDS = { mgmt: 'Management', server: 'Server', guest: 'Guest', voice: 'Voice' };
export const DEPLOYMENT_TYPES = ['Enterprise LAN', 'Enterprise WAN', 'ISP MPLS VPN'];
// [device redundancy, ISP redundancy]
export const HA_MODES = { None: [false, false], 'Device Redundancy': [true, false], 'ISP Redundancy': [false, true], 'Full HA': [true, true] };
const RESERVED_VLANS = new Set([1, 1002, 1003, 1004, 1005, EDGE_VLAN, INSIDE_VLAN]);

function buildVlans(departments = []) {
  const vlans = departments
    .filter((d) => d.name?.trim())
    .map((d, i) => {
      const kind = DEPT_KINDS[d.type] || 'user';
      const fallbackId = { mgmt: MGMT_VLAN.id, server: 100 }[kind] || (i + 1) * 10;
      return { id: Number(d.vlanId) || fallbackId, name: d.name.trim().toUpperCase().replace(/\W+/g, '_'), kind };
    });
  // No departments → default User + Mgmt so design can still generate
  if (!vlans.some((v) => PORT_KINDS.includes(v.kind))) vlans.push({ id: 10, name: 'USERS', kind: 'user' });
  for (const [kind, label] of Object.entries(SINGLE_KINDS)) {
    if (vlans.filter((v) => v.kind === kind).length > 1) throw bad(`Only one ${label} VLAN is allowed`);
  }
  if (!vlans.some((v) => v.kind === 'mgmt')) vlans.push(MGMT_VLAN);
  return validateVlanIds(vlans);
}

function ensureServerVlan(vlans) {
  if (!vlans.some((v) => v.kind === 'server')) vlans.push(SERVER_VLAN);
  return validateVlanIds(vlans);
}

function validateVlanIds(vlans) {
  const seen = new Set();
  for (const v of vlans) {
    if (!Number.isInteger(v.id) || v.id < 2 || v.id > 4094 || RESERVED_VLANS.has(v.id)) throw bad(`VLAN ID ${v.id} (${v.name}) is invalid or reserved`);
    if (seen.has(v.id)) throw bad(`VLAN ID ${v.id} is used more than once`);
    seen.add(v.id);
  }
  return vlans;
}

// Validates UI input into one requirements object.
function normalizeInput(input) {
  const users = Number(input.users?.current) || 0;
  const growth = Number(input.users?.growthPct) || 0;
  const mbps = Number(input.bandwidthMbps) || 0;
  if (!input.customerName?.trim()) throw bad('Customer name is required');
  if (users < 1) throw bad('Number of users must be at least 1');
  if (mbps < 1) throw bad('Bandwidth is required');

  const s = input.sites || {};
  const siteCount = Math.max(1, Math.floor(Number(s.count)) || 1);
  const connectionType = input.connectionType || 'Internet';
  // Connection type MPLS drives ISP MPLS VPN design (BGP CE-PE topology)
  const mpls = connectionType === 'MPLS' || input.deploymentType === 'ISP MPLS VPN';
  const deploymentType = mpls ? 'ISP MPLS VPN' : input.deploymentType || 'Enterprise LAN';
  if (!DEPLOYMENT_TYPES.includes(deploymentType)) throw bad(`Unknown deployment type: ${deploymentType}`);
  const haMode = input.haMode || 'None';
  if (!HA_MODES[haMode]) throw bad(`Unknown high availability mode: ${haMode}`);
  const [deviceHa, ispHa] = HA_MODES[haMode];
  const srv = input.servers || {};
  const servers = [];
  if (srv.dhcp) servers.push('DHCP');
  if (srv.dns) servers.push('DNS');
  let vlans = buildVlans(input.departments);
  if (servers.length) vlans = ensureServerVlan(vlans);

  return {
    industry: input.industry || 'Other',
    users,
    growthPct: growth,
    designUsers: Math.ceil((users * (100 + growth)) / 100),
    siteCount,
    drSite: siteCount > 1 && !!s.drSite,
    deploymentType,
    connectionType: mpls ? 'MPLS' : connectionType,
    mpls,
    internet: !mpls && (connectionType.includes('Internet') || connectionType === 'SD-WAN'),
    bandwidthMbps: mbps,
    haMode,
    deviceHa,
    ispHa,
    servers,
    dhcp: !!srv.dhcp,
    vlans,
  };
}

const SYSTEM = `You are a senior Cisco enterprise network architect. Turn the customer requirements into design decisions.
Rules:
- Use only device models from the catalog. Router and firewall maxMbps must be >= bandwidthMbps. Prefer the cheapest model that fits; step up only if growth justifies it.
- routing.internal: "OSPF" when siteCount > 1 or deploymentType is "Enterprise WAN", otherwise "Static".
- routing.external: "BGP" when deploymentType is "ISP MPLS VPN" or connectionType is MPLS, otherwise "Static".
- firewallModel: null unless the industry clearly needs one (explain why in reasons).
- vlans: return every VLAN id from the requirements exactly once with an expected host count. user + guest VLANs together must cover at least designUsers hosts. voice ~ one phone per user. mgmt ~ 20. server ~ 20.
- accessCount: number of ${ACCESS_SWITCH.ports}-port access switches; at least ceil(total user + guest hosts / ${ACCESS_SWITCH.ports}).
- Device and ISP link counts are fixed by haMode (see "fixed"); do not change them.
- reasons: short "requirement -> decision" sentences. warnings: real risks only (single points of failure, oversized VLANs, etc.).`;

const STR = { type: 'STRING' };
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    routerModel: { type: 'STRING', enum: ROUTERS.map((m) => m.model) },
    firewallModel: { type: 'STRING', enum: FIREWALLS.map((m) => m.model), nullable: true },
    accessCount: { type: 'INTEGER' },
    routing: {
      type: 'OBJECT',
      properties: { internal: { type: 'STRING', enum: ['Static', 'OSPF'] }, external: { type: 'STRING', enum: ['Static', 'BGP'] } },
      required: ['internal', 'external'],
    },
    vlans: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { id: { type: 'INTEGER' }, hosts: { type: 'INTEGER' } }, required: ['id', 'hosts'] },
    },
    reasons: { type: 'ARRAY', items: STR },
    warnings: { type: 'ARRAY', items: STR },
  },
  required: ['routerModel', 'accessCount', 'routing', 'vlans', 'reasons', 'warnings'],
};

const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()) : []);

// Checks the AI decisions against the catalog and turns them into the design object used by plan/config/report.
function buildDesign(req, ai) {
  const count = req.deviceHa ? 2 : 1;
  const mbps = req.bandwidthMbps;

  const router = ROUTERS.find((m) => m.model === ai.routerModel);
  if (!router) throw badAi(`unknown router "${ai.routerModel}"`);
  if (router.maxMbps < mbps) throw badAi(`${router.model} supports only ${router.maxMbps} Mbps`);
  let { internal, external } = ai.routing || {};
  if (req.mpls) external = 'BGP'; // MPLS VPN always uses CE-PE eBGP
  if (!['Static', 'OSPF'].includes(internal) || !['Static', 'BGP'].includes(external)) throw badAi('unknown routing protocol');
  if (external === 'BGP' && !router.bgp) throw badAi(`${router.model} does not support BGP`);
  if (req.deviceHa && !router.hsrp) throw badAi(`${router.model} does not support HSRP`);

  let fw = null;
  if (ai.firewallModel) {
    fw = FIREWALLS.find((m) => m.model === ai.firewallModel);
    if (!fw) throw badAi(`unknown firewall "${ai.firewallModel}"`);
    if (fw.maxMbps < mbps) throw badAi(`${fw.model} supports only ${fw.maxMbps} Mbps`);
  }

  const hosts = new Map((ai.vlans || []).map((v) => [Number(v.id), Math.round(Number(v.hosts))]));
  const vlans = req.vlans.map((v) => {
    const users = hosts.get(v.id);
    if (!(users >= 1 && users <= 4000)) throw badAi(`missing or invalid host count for VLAN ${v.id}`);
    return { ...v, users };
  });
  const portsNeeded = vlans.filter((v) => PORT_KINDS.includes(v.kind)).reduce((s, v) => s + v.users, 0);
  if (portsNeeded < req.designUsers) throw badAi(`user/guest VLANs cover ${portsNeeded} hosts, ${req.designUsers} needed`);

  const minAccess = Math.max(1, Math.ceil(portsNeeded / ACCESS_SWITCH.ports));
  const accessCount = Math.round(Number(ai.accessCount));
  if (!(accessCount >= minAccess)) throw badAi(`${ai.accessCount} access switches; at least ${minAccess} needed`);
  const corePortsNeeded = (fw ? 3 : 1) + accessCount;
  const corePortsFree = CORE_SWITCH.ports - (count === 2 ? 2 : 0);
  if (corePortsNeeded > corePortsFree) {
    throw bad(`Design needs ${corePortsNeeded} core ports; ${CORE_SWITCH.model} has ${corePortsFree} free. Split into multiple buildings.`);
  }

  // isp = ISP number; Device HA alone puts both routers on ISP 1, ISP HA alone gives router 1 two ISPs.
  const wan = req.deviceHa
    ? [0, 1].map((r) => ({ router: r, isp: req.ispHa ? r + 1 : 1 }))
    : (req.ispHa ? [1, 2] : [1]).map((isp) => ({ router: 0, isp }));

  return {
    engine: ai._engine || 'gemini',
    designUsers: req.designUsers,
    haMode: req.haMode,
    redundancy: req.deviceHa,
    dualIsp: req.ispHa,
    siteCount: req.siteCount,
    multiSite: req.siteCount > 1,
    deploymentType: req.deploymentType,
    connectionType: req.connectionType,
    mpls: req.mpls,
    internet: req.internet,
    routing: { internal, external },
    reasons: strings(ai.reasons),
    warnings: strings(ai.warnings),
    router: { ...router, count },
    firewall: fw ? { ...fw, count } : null,
    core: { ...CORE_SWITCH, count },
    access: { ...ACCESS_SWITCH, count: accessCount },
    wan,
    vlans,
    servers: req.servers,
    dhcp: req.dhcp,
    nat: req.internet,
    acl: false,
    vpn: req.mpls ? 'mpls' : 'none',
    monitoring: {},
  };
}

export async function createDesign(input) {
  const req = normalizeInput(input);
  const count = req.deviceHa ? 2 : 1;
  const prompt = JSON.stringify({
    requirements: req,
    fixed: { routers: count, coreSwitches: count, firewallsIfUsed: count, ispLinks: req.ispHa ? 2 : 1 },
    catalog: { routers: ROUTERS, firewalls: FIREWALLS, coreSwitch: CORE_SWITCH, accessSwitch: ACCESS_SWITCH },
  });
  return buildDesign(req, await askGemini({ system: SYSTEM, prompt, schema: SCHEMA }));
}
