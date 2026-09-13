import type { User } from '../lib/auth'

export interface PushFile {
  /** Repo-relative path, e.g. "frontend/App.tsx". No leading slash. */
  path: string
  /** UTF-8 text content of the file. */
  content: string
}

export interface PushProjectParams {
  owner: string
  repo: string
  branch: string
  message: string
  files: PushFile[]
}

/** UTF-8 safe base64 encoder (GitHub Contents API expects base64). */
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Pushes a batch of files to a GitHub repo via the Contents API
 * (PUT /repos/{owner}/{repo}/contents/{path}), one file per call.
 *
 * The Git Data createTree endpoint is used-elsewhere but this connector fails to
 * serialize its nested `tree[].mode` field, so we use the flat Contents API here.
 * Each file becomes its own commit. Existing files are updated by looking up their
 * current blob sha from the branch tree first.
 */
export default async function (req: { params: PushProjectParams; user: User }) {
  const { owner, repo, branch, message, files } = req.params

  if (!files || files.length === 0) {
    throw new Error('No files provided to push.')
  }

  // Map existing path -> blob sha so we can update (not just create) files.
  const shaByPath: Record<string, string> = {}
  try {
    const ref = await retoolio.git.getRef(owner, repo, `heads/${branch}`)
    const headCommit = await retoolio.git.getCommit(owner, repo, ref.data.object.sha)
    const tree = await retoolio.git.getTree(owner, repo, headCommit.data.tree.sha, { recursive: '1' })
    const items = ((tree.data as { tree?: Array<{ path?: string; type?: string; sha?: string }> }).tree) ?? []
    for (const item of items) {
      if (item.type === 'blob' && item.path && item.sha) {
        shaByPath[item.path] = item.sha
      }
    }
  } catch {
    // Branch/tree may not exist yet (empty repo) — treat everything as new.
  }

  let lastCommitSha = ''
  let lastCommitUrl = ''
  let pushed = 0

  for (const f of files) {
    const existingSha = shaByPath[f.path]
    const body: {
      message: string
      content: string
      branch: string
      sha?: string
    } = {
      message: `${message}: ${f.path}`,
      content: toBase64Utf8(f.content),
      branch,
    }
    if (existingSha) body.sha = existingSha

    const res = await retoolio.repos.createOrUpdateFileContents(owner, repo, f.path, body)
    const commit = (res.data as { commit?: { sha?: string; html_url?: string } }).commit
    if (commit?.sha) lastCommitSha = commit.sha
    if (commit?.html_url) lastCommitUrl = commit.html_url
    pushed += 1
  }

  return {
    commit: lastCommitSha,
    htmlUrl: lastCommitUrl || `https://github.com/${owner}/${repo}/tree/${branch}`,
    filesPushed: pushed,
  }
}
