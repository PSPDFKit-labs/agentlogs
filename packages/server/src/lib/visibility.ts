import { visibilityOptions, type VisibilityOption } from "../db/schema";
import { env } from "./env";

export function getAllowedVisibilityOptions(): VisibilityOption[] {
  return env.PUBLIC_SHARING_ENABLED
    ? [...visibilityOptions]
    : visibilityOptions.filter((option) => option !== "public");
}

export function isVisibilityOption(value: string): value is VisibilityOption {
  return visibilityOptions.includes(value as VisibilityOption);
}

export function isAllowedVisibility(value: string): value is VisibilityOption {
  return isVisibilityOption(value) && (value !== "public" || env.PUBLIC_SHARING_ENABLED);
}

export function getVisibilityErrorMessage(): string {
  return `Invalid visibility. Must be one of: ${getAllowedVisibilityOptions().join(", ")}`;
}
