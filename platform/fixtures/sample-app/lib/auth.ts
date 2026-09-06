export function requirePermission(permission: string) {
  const permissions = ['customer.read', 'customer.intervene'];
  if (!permissions.includes(permission)) throw new Error('Forbidden');
}
