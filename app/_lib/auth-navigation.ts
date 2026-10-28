export type PersonalSection = "connections" | "skills";

export function isPersonalSection(value: string): value is PersonalSection {
  return value === "connections" || value === "skills";
}

/** Auth returns only to known personal views, never an external URL or another user's chat. */
export function authReturnPath(value: string | null): string {
  return value === "/chat" ||
    value === "/?section=connections" ||
    value === "/?section=skills"
    ? value
    : "/";
}

export function authPageHref(
  page: "/login" | "/register",
  returnTo: string | null
): string {
  const next = authReturnPath(returnTo);
  return next === "/" ? page : `${page}?next=${encodeURIComponent(next)}`;
}

export function personalLoginHref(section: PersonalSection): string {
  return authPageHref("/login", `/?section=${section}`);
}
