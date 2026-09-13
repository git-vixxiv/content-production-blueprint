/**
 * Extracts the first JSON object/array from an LLM text response, tolerating
 * markdown code fences and leading/trailing prose. Throws if no JSON is found.
 */
export function parseJsonFromLlm<T>(raw: string): T {
  let text = raw.trim()
  // Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim()
  }
  // If still has surrounding prose, grab the outermost { } or [ ]
  const firstBrace = text.search(/[[{]/)
  if (firstBrace > 0) text = text.slice(firstBrace)
  const lastBrace = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (lastBrace >= 0) text = text.slice(0, lastBrace + 1)
  return JSON.parse(text) as T
}
