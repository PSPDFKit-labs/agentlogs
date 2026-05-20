import { APIError } from "better-auth";

export interface NormalizedGithubProfile {
  id: string;
  email: string;
  image: string | null;
  name: string;
  username: string;
}

interface GithubUserResponse {
  avatar_url?: string | null;
  email?: string | null;
  id?: number | string | null;
  login?: string | null;
  name?: string | null;
}

interface GithubEmailResponse {
  email?: string;
  primary?: boolean;
  verified?: boolean;
}

interface GithubMembershipResponse {
  state?: string;
}

function createGithubHeaders(accessToken: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "AgentLogs",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchPrimaryGithubEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: createGithubHeaders(accessToken),
  });

  if (!response.ok) {
    return null;
  }

  const emails = (await response.json()) as GithubEmailResponse[];
  const primaryVerified = emails.find((email) => email.primary && email.verified && email.email);
  if (primaryVerified?.email) {
    return primaryVerified.email;
  }

  const firstVerified = emails.find((email) => email.verified && email.email);
  return firstVerified?.email ?? null;
}

async function hasGithubOrgMembership(accessToken: string, org: string): Promise<boolean> {
  const response = await fetch(`https://api.github.com/user/memberships/orgs/${org}`, {
    headers: createGithubHeaders(accessToken),
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw new APIError("FORBIDDEN", {
      code: "GITHUB_ORG_CHECK_FAILED",
      message: `Failed to verify GitHub organization membership for ${org}.`,
    });
  }

  const membership = (await response.json()) as GithubMembershipResponse;
  return membership.state === "active";
}

export async function fetchGithubProfile(
  accessToken: string,
  allowedGithubOrgs: string[],
): Promise<NormalizedGithubProfile | null> {
  const response = await fetch("https://api.github.com/user", {
    headers: createGithubHeaders(accessToken),
  });

  if (!response.ok) {
    return null;
  }

  const profile = (await response.json()) as GithubUserResponse;
  const username = profile.login?.toLowerCase() ?? "";
  if (!username) {
    return null;
  }

  if (allowedGithubOrgs.length > 0) {
    let allowed = false;

    for (const org of allowedGithubOrgs) {
      if (await hasGithubOrgMembership(accessToken, org)) {
        allowed = true;
        break;
      }
    }

    if (!allowed) {
      throw new APIError("FORBIDDEN", {
        code: "GITHUB_ORG_MEMBERSHIP_REQUIRED",
        message: "Your GitHub account is not a member of an allowed organization.",
      });
    }
  }

  const email = profile.email ?? (await fetchPrimaryGithubEmail(accessToken));
  if (!email) {
    return null;
  }

  return {
    id: String(profile.id ?? username),
    email,
    image: profile.avatar_url ?? null,
    name: profile.name ?? profile.login ?? email,
    username,
  };
}
