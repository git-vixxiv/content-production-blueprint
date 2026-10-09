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

/** Calls `/backend/pipeline/generatePackaging.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useGeneratePackaging() {
  return useBackendFunction('/backend/pipeline/generatePackaging.ts')
}

/** Calls `/backend/pipeline/generateScript.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useGenerateScript() {
  return useBackendFunction('/backend/pipeline/generateScript.ts')
}

/** Calls `/backend/pipeline/researchCompetitors.ts`. `data` is `null` until `trigger()` runs, and holds that function's return value as-is. */
export function useResearchCompetitors() {
  return useBackendFunction('/backend/pipeline/researchCompetitors.ts')
}
