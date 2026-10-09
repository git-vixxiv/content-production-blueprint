/**
 * Hooks generated from this app's backend functions.
 *
 * Each hook returns `{ data, loading, error, dataAccessErrors, trigger }` and fetches
 * nothing on its own — `data` stays `null` until `trigger()` settles. To load on mount:
 *
 *   const { data, loading, error, trigger } = useGetTodos()
 *   useEffect(() => {
 *     trigger()
 *   }, [trigger])
 *
 * `data` is the backend function's return value verbatim. A function declaring
 * `Promise<{ data: Todo[] }>` gives you `data.data`, not an array. If `data` does not
 * match the type you expect, fix the access path rather than casting.
 *
 * See `useBackendFunction` for parameters, `cachePolicy` and streaming.
 */

import { useBackendFunction } from '../useBackendFunction'

/** Calls `/backend/creators/createCreator.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useCreateCreator() {
  return useBackendFunction('/backend/creators/createCreator.ts')
}

/** Calls `/backend/creators/deleteCreator.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useDeleteCreator() {
  return useBackendFunction('/backend/creators/deleteCreator.ts')
}

/** Calls `/backend/creators/listCreators.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useListCreators() {
  return useBackendFunction('/backend/creators/listCreators.ts')
}
