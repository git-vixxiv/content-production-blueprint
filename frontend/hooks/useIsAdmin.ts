import { useCurrentUser } from './useCurrentUser'

/** True if the signed-in user is in the org "admin" group. */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { user, loading } = useCurrentUser()
  const isAdmin = user?.groups?.some((g) => g.name.toLowerCase() === 'admin') ?? false
  return { isAdmin, loading }
}
