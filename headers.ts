export function setResponseHeaders(
  res: Response,
  headers: Record<string, string>,
): Response {
  const responseHeaders = new Headers(res.headers);
  for (const key in headers) {
    responseHeaders.set(key, headers[key]);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}
