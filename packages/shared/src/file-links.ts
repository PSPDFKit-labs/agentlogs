const WEB_GIT_HOSTS = ["github.com", "gitlab.com", "bitbucket.org"] as const;

export interface TranscriptLinkRewriteOptions {
  repoId?: string | null;
  branch?: string | null;
}

export function normalizeRepoIdForWeb(repoId: string | null | undefined): string | null {
  if (!repoId) {
    return null;
  }

  const trimmed = repoId.trim();
  if (!trimmed) {
    return null;
  }

  const [host, ...rest] = trimmed.split("/");
  if (!host || rest.length < 2) {
    return trimmed;
  }

  const normalizedHost = normalizeGitHostAlias(host);
  return `${normalizedHost}/${rest.join("/")}`;
}

export function rewriteLocalFileHref(href: string, options: TranscriptLinkRewriteOptions = {}): string | null {
  if (!href) {
    return href;
  }

  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:") || href.startsWith("#")) {
    return href;
  }

  const { pathPart, fragment } = splitHref(href);
  if (!isLikelyLocalFilePath(pathPart)) {
    return href;
  }

  const normalizedRepoId = normalizeRepoIdForWeb(options.repoId);
  const githubRepo = normalizedRepoId?.startsWith("github.com/") ? normalizedRepoId.slice("github.com/".length) : null;
  if (!normalizedRepoId || !githubRepo) {
    return null;
  }

  const repoRelativePath = extractRepoRelativePath(pathPart, normalizedRepoId);
  if (!repoRelativePath) {
    return null;
  }

  const ref = encodeRef(options.branch?.trim() || "HEAD");
  return `https://github.com/${githubRepo}/blob/${ref}/${encodePath(repoRelativePath)}${fragment}`;
}

export function rewriteMarkdownLocalFileLinks(text: string, options: TranscriptLinkRewriteOptions = {}): string {
  if (!text) {
    return text;
  }

  return text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (fullMatch, label: string, href: string) => {
    const rewrittenHref = rewriteLocalFileHref(href, options);
    if (rewrittenHref === null) {
      return label;
    }
    if (rewrittenHref === href) {
      return fullMatch;
    }
    return `[${label}](${rewrittenHref})`;
  });
}

export function rewriteMarkdownLocalFileLinksDeep<T>(value: T, options: TranscriptLinkRewriteOptions = {}): T {
  if (typeof value === "string") {
    return rewriteMarkdownLocalFileLinks(value, options) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteMarkdownLocalFileLinksDeep(item, options)) as T;
  }

  if (value instanceof Date) {
    return value;
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      result[key] = rewriteMarkdownLocalFileLinksDeep(nestedValue, options);
    }
    return result as T;
  }

  return value;
}

function normalizeGitHostAlias(host: string): string {
  const lowerHost = host.toLowerCase();

  for (const canonicalHost of WEB_GIT_HOSTS) {
    if (lowerHost === canonicalHost || lowerHost.startsWith(`${canonicalHost}-`)) {
      return canonicalHost;
    }
  }

  return host;
}

function splitHref(href: string): { pathPart: string; fragment: string } {
  const hashIndex = href.indexOf("#");
  if (hashIndex === -1) {
    return { pathPart: href, fragment: "" };
  }

  return {
    pathPart: href.slice(0, hashIndex),
    fragment: href.slice(hashIndex),
  };
}

function isLikelyLocalFilePath(pathPart: string): boolean {
  return (
    pathPart.startsWith("~/") ||
    /^(?:\/(?:Users|home|private|tmp|var|opt|srv|etc|usr)\/)/.test(pathPart) ||
    /^[A-Za-z]:[\\/]/.test(pathPart)
  );
}

function extractRepoRelativePath(pathPart: string, normalizedRepoId: string): string | null {
  const repoName = normalizedRepoId.split("/").pop();
  if (!repoName) {
    return null;
  }

  const normalizedPath = pathPart.replace(/\\/g, "/");
  const marker = `/${repoName}/`;
  const lastMarkerIndex = normalizedPath.lastIndexOf(marker);
  if (lastMarkerIndex === -1) {
    return null;
  }

  const repoRelativePath = normalizedPath.slice(lastMarkerIndex + marker.length);
  return repoRelativePath.length > 0 ? repoRelativePath : null;
}

function encodeRef(ref: string): string {
  return ref
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function encodePath(filePath: string): string {
  return filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
