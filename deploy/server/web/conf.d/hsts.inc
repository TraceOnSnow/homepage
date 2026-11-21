# HSTS for traceonsnow.com only (HTTPS server block; never send it on port 80).
# Trial value: 1 day. After a quiet observation period, raise it here (single place):
#   add_header Strict-Transport-Security "max-age=31536000" always;
# Add includeSubDomains only after every *.traceonsnow.com host is HTTPS-only
# (steamguess, nanoparty, ...). preload is effectively irreversible; decide separately.
# If HSTS is ever enabled in Cloudflare too, keep only one of the two.
add_header Strict-Transport-Security "max-age=86400" always;
