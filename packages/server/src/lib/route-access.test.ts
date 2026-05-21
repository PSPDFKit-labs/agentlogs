import { describe, expect, it } from "bun:test";
import {
  buildLoginRedirect,
  getAppRouteRedirect,
  getProtectedAppRouteRedirect,
  getRootRouteRedirect,
  getWaitlistRouteRedirect,
} from "./route-access";

describe("route access redirects", () => {
  it("encodes callback URLs for login redirects", () => {
    expect(buildLoginRedirect("/s/abc123?foo=bar#msg-2")).toEqual({
      kind: "href",
      value: "/auth/login?callbackURL=%2Fs%2Fabc123%3Ffoo%3Dbar%23msg-2",
    });
  });

  it("sends logged-out users from the root route to login", () => {
    expect(getRootRouteRedirect(null)).toEqual({
      kind: "href",
      value: "/auth/login?callbackURL=%2Fapp",
    });
  });

  it("sends logged-in users from the root route into the app", () => {
    expect(getRootRouteRedirect({ user: { role: "user" } })).toEqual({
      kind: "to",
      value: "/app",
    });
  });

  it("requires login for the waitlist route", () => {
    expect(getWaitlistRouteRedirect(null, true)).toEqual({
      kind: "href",
      value: "/auth/login?callbackURL=%2Fwaitlist",
    });
  });

  it("allows the waitlist route to stay public when login is not required", () => {
    expect(getWaitlistRouteRedirect(null, false)).toBeNull();
  });

  it("keeps waitlist users on the waitlist route", () => {
    expect(getWaitlistRouteRedirect({ user: { role: "waitlist" } }, true)).toBeNull();
  });

  it("redirects active users away from the waitlist route", () => {
    expect(getWaitlistRouteRedirect({ user: { role: "admin" } }, true)).toEqual({
      kind: "to",
      value: "/app",
    });
  });

  it("requires login for application routes and preserves the full callback URL", () => {
    expect(getAppRouteRedirect(null, "https://nutrient-agentlogs.dev/s/abc123?view=full")).toEqual({
      kind: "href",
      value: "/auth/login?callbackURL=https%3A%2F%2Fnutrient-agentlogs.dev%2Fs%2Fabc123%3Fview%3Dfull",
    });
  });

  it("redirects waitlist users away from application routes", () => {
    expect(getAppRouteRedirect({ user: { role: "waitlist" } }, "https://nutrient-agentlogs.dev/app")).toEqual({
      kind: "to",
      value: "/waitlist",
    });
  });

  it("allows active users into application routes", () => {
    expect(getAppRouteRedirect({ user: { role: "user" } }, "https://nutrient-agentlogs.dev/app")).toBeNull();
  });

  it("keeps shared app routes public when login is not required", () => {
    expect(getProtectedAppRouteRedirect(null, "https://nutrient-agentlogs.dev/s/abc123", false)).toBeNull();
  });

  it("requires login for app routes when enabled", () => {
    expect(getProtectedAppRouteRedirect(null, "https://nutrient-agentlogs.dev/s/abc123", true)).toEqual({
      kind: "href",
      value: "/auth/login?callbackURL=https%3A%2F%2Fnutrient-agentlogs.dev%2Fs%2Fabc123",
    });
  });
});
