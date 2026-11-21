# Shared security headers for the traceonsnow.com HTTPS server.
# Nginx drops ALL inherited server-level add_header lines in any location that has
# its own add_header, so include this file at server level AND again in every
# static location that sets add_header (currently /_astro/).
add_header X-Content-Type-Options nosniff always;
add_header Referrer-Policy strict-origin-when-cross-origin always;
include /etc/nginx/conf.d/hsts.inc;
