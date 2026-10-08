import { DiscoveryService } from '../../packages/discovery/src/service.mjs';

export function approvedDesign(f) {
  const discovery = new DiscoveryService(f.service);
  const source = discovery.create(f.who, f.tenant.id, f.project.id, {
    name: 'Reviewed host design fixture', kind: 'browser',
    allowedOrigins: ['https://app.example'], designCapture: true,
  });
  discovery.ingest(source.projectKey, 'https://app.example', {
    heartbeat: true,
    design: {
      viewport: { bucket: 'desktop', colorScheme: 'light' },
      roles: {
        root: { fontFamily: 'Inter, sans-serif', fontSize: '16px', color: '#202830', backgroundColor: '#fafafa' },
        button: { height: '36px', paddingBlock: '8px', paddingInline: '12px' },
      },
    },
  });
  const observed = discovery.design(f.who, f.tenant.id, f.project.id).observations[0];
  const approve = (overrides = {}) => discovery.approveDesign(f.who, f.tenant.id, f.project.id, { fingerprint: observed.fingerprint, overrides });
  return { discovery, approve, approved: approve() };
}
