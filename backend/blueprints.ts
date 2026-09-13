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

/** Calls `/backend/blueprints/createBlueprint.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useCreateBlueprint() {
  return useBackendFunction('/backend/blueprints/createBlueprint.ts')
}

/** Calls `/backend/blueprints/deleteBlueprint.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useDeleteBlueprint() {
  return useBackendFunction('/backend/blueprints/deleteBlueprint.ts')
}

/** Calls `/backend/blueprints/getBlueprint.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useGetBlueprint() {
  return useBackendFunction('/backend/blueprints/getBlueprint.ts')
}

/** Calls `/backend/blueprints/listBlueprints.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useListBlueprints() {
  return useBackendFunction('/backend/blueprints/listBlueprints.ts')
}

/** Calls `/backend/blueprints/updateBlueprint.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useUpdateBlueprint() {
  return useBackendFunction('/backend/blueprints/updateBlueprint.ts')
}
