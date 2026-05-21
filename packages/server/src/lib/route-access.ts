export type RouteSession = {
  user: {
    role: string;
  };
} | null;

export type RouteRedirect = { kind: "href"; value: string } | { kind: "to"; value: string };

export function buildLoginRedirect(callbackURL: string): RouteRedirect {
  return {
    kind: "href",
    value: `/auth/login?callbackURL=${encodeURIComponent(callbackURL)}`,
  };
}

export function getRootRouteRedirect(session: RouteSession): RouteRedirect {
  if (session) {
    return { kind: "to", value: "/app" };
  }

  return buildLoginRedirect("/app");
}

export function getWaitlistRouteRedirect(session: RouteSession, requireLogin: boolean): RouteRedirect | null {
  if (!session) {
    return requireLogin ? buildLoginRedirect("/waitlist") : null;
  }

  if (session.user.role === "user" || session.user.role === "admin") {
    return { kind: "to", value: "/app" };
  }

  return null;
}

export function getAppRouteRedirect(session: RouteSession, locationHref: string): RouteRedirect | null {
  if (!session) {
    return buildLoginRedirect(locationHref);
  }

  if (session.user.role === "waitlist") {
    return { kind: "to", value: "/waitlist" };
  }

  return null;
}

export function getProtectedAppRouteRedirect(
  session: RouteSession,
  locationHref: string,
  requireLogin: boolean,
): RouteRedirect | null {
  if (!requireLogin && !session) {
    return null;
  }

  return getAppRouteRedirect(session, locationHref);
}
