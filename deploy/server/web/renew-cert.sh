#!/usr/bin/env bash
set -euo pipefail
deployment_web_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
docker compose -f "$deployment_web_dir/compose.yaml" run --rm certbot renew --quiet
docker compose -f "$deployment_web_dir/compose.yaml" exec -T nginx nginx -t
docker compose -f "$deployment_web_dir/compose.yaml" exec -T nginx nginx -s reload
