// Capability-based device profiles. Pick the first model whose maxMbps fits.
export const ROUTERS = [
  { model: 'ISR4331', maxMbps: 500, price: 4500, ospf: true, bgp: true, hsrp: true, nat: true },
  { model: 'ISR4451', maxMbps: 1000, price: 12000, ospf: true, bgp: true, hsrp: true, nat: true },
  { model: 'ASR1001-X', maxMbps: 10000, price: 25000, ospf: true, bgp: true, hsrp: true, nat: true },
];

export const FIREWALLS = [
  { model: 'FPR1010', maxMbps: 500, price: 1500 },
  { model: 'FPR1120', maxMbps: 1000, price: 6000 },
  { model: 'FPR2130', maxMbps: 5000, price: 20000 },
  { model: 'FPR4112', maxMbps: 10000, price: 60000 },
];

export const CORE_SWITCH = { model: 'C9500-16X', ports: 16, portPrefix: 'TenGigabitEthernet1/0/', price: 15000 };
export const ACCESS_SWITCH = {
  model: 'C9300-48P',
  ports: 48,
  portPrefix: 'GigabitEthernet1/0/',
  uplinkPrefix: 'TenGigabitEthernet1/1/',
  price: 6500,
};
export const SERVER = { model: 'Rack Server (1U)', price: 3000 };

export const pickByBandwidth = (list, mbps) => list.find((d) => mbps <= d.maxMbps);
