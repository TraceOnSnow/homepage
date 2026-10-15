#!/usr/bin/env bash
# Read-only host checks. No config, package, container or service changes.
set -u
failed=0
probe() {
  printf '\n[%s]\n' "$1"
  shift
  "$@" || failed=1
}
probe identity id
probe node node --version
probe npm npm --version
probe compose docker compose version
probe containers docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
probe listeners ss -lntup
probe hermes systemctl --user status hermes-gateway.service --no-pager --lines=0
probe memory free -h
probe disk df -h /
probe github git ls-remote https://github.com/TraceOnSnow/homepage.git HEAD
exit "$failed"
