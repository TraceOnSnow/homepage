import { withPayload } from '@payloadcms/next/withPayload'
export default withPayload({
  reactStrictMode: true,
  // Keep React's dev diagnostics in the RSC response. The separate debug
  // WebSocket channel can misorder timing events during Payload auth redirects.
  experimental: { reactDebugChannel: false },
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ] }]
  },
})
