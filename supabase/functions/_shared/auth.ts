export async function authenticatedUserId(
  request: Request,
  supabaseUrl: string,
  anonKey: string,
  fetchUser: typeof fetch = fetch,
): Promise<string | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) return null;

  const response = await fetchUser(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization },
  });
  if (!response.ok) return null;

  const user: unknown = await response.json();
  if (typeof user !== "object" || user === null || !("id" in user)) return null;
  return typeof user.id === "string" && user.id.length > 0 ? user.id : null;
}

export function unauthorized(headers: HeadersInit): Response {
  return Response.json({ error: "Sign in to Stash before continuing" }, {
    status: 401,
    headers,
  });
}
