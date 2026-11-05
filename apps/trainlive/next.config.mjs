/** @type {import('next').NextConfig} */
// Balanced CSP for Next.js App Router: inline bootstrap scripts are required
// until nonce-based rendering is implemented and verified across all routes.
// External scripts, framing, plugins and cross-origin API connections are denied.
const isProduction = process.env.NODE_ENV === 'production';
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'" + (isProduction ? '' : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'" + (isProduction ? '' : ' ws: wss:'),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        {key:'Content-Security-Policy', value:csp},
        {key:'Strict-Transport-Security', value:'max-age=31536000'},
        {key:'X-Content-Type-Options', value:'nosniff'},
        {key:'X-Frame-Options', value:'DENY'},
        {key:'Referrer-Policy', value:'strict-origin-when-cross-origin'},
        {key:'Permissions-Policy', value:'camera=(), microphone=(), geolocation=()'},
        {key:'Cross-Origin-Resource-Policy', value:'same-origin'}
      ]
    }];
  }
};
export default nextConfig;
