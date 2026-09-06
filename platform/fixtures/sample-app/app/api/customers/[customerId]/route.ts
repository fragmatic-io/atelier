import { requirePermission } from '../../../../lib/auth';

export async function GET(request: Request) {
  requirePermission('customer.read');
  return Response.json({ id: 'c_101', name: 'Aperture Labs', status: 'at_risk' });
}

export async function PATCH(request: Request) {
  requirePermission('customer.intervene');
  const input = await request.json();
  return Response.json({ ok: true, ...input });
}
