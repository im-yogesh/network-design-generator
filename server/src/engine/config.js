import nunjucks from 'nunjucks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../templates');
const env = nunjucks.configure(dir, { trimBlocks: true, lstripBlocks: true, autoescape: false });
env.addFilter('prefixLen', (mask) => mask.split('.').reduce((n, o) => n + Number(o).toString(2).split('1').length - 1, 0));

// Feature modules assembled per device role; modules with no data render empty.
const MODULES = {
  router: ['base', 'interfaces', 'static', 'ospf', 'bgp', 'nat', 'acl', 'monitoring'],
  core: ['base', 'vlans', 'interfaces', 'static', 'ospf', 'dhcp', 'acl', 'monitoring'],
  access: ['base', 'vlans', 'access_ports', 'interfaces', 'acl', 'monitoring'],
  firewall: ['asa'],
};

export function renderDevice(device) {
  const parts = MODULES[device.role]
    .map((m) => env.render(`${m}.njk`, device).trim())
    .filter(Boolean);
  return `${parts.join('\n!\n')}\n!\nend\n`;
}

export const renderAll = (devices) => Object.fromEntries(devices.map((d) => [d.hostname, renderDevice(d)]));
