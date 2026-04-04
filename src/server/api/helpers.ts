/**
 * Check that the authenticated user owns a resource (or is superadmin).
 * Returns an error string if access is denied, or null if OK.
 */
export function checkOwnership(
  user: { id: number; role: string },
  resource: { ownerId: number | null } | undefined,
): string | null {
  if (!resource) return 'not_found';
  if (user.role === 'superadmin') return null;
  if (resource.ownerId === null) return null; // global resource accessible to all
  if (resource.ownerId === user.id) return null;
  return 'forbidden';
}
