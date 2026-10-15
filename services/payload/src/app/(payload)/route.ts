export function GET(request: Request) {
  return Response.redirect(new URL('/admin', request.url), 307)
}
