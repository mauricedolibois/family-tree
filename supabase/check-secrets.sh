#!/bin/bash
# Checks a self-hosted Supabase's .env for secrets left at the values of its example
# file. With the example JWT_SECRET anyone can make a service key and read every
# account and tree; the example DASHBOARD_PASSWORD opens Studio. See
# docs/supabase.md, step 4.
#
#   supabase/check-secrets.sh ~/supabase/docker/.env
#
# Run it as the Linux user that runs Supabase. It prints key names only, never a
# value, and exits with 1 when something must be changed.
set -euo pipefail

ENV_FILE=${1:-.env}
if [ ! -r "$ENV_FILE" ]; then
  echo "Usage: $0 <path to Supabase's .env>"
  exit 2
fi

# Values from Supabase's docker/.env.example over the years
KNOWN_DEFAULTS=(
  your-super-secret-and-long-postgres-password
  your-super-secret-jwt-token-with-at-least-32-characters-long
  this_password_is_insecure_and_should_be_updated
  UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1/u2oq
  supabaserealtime
  your-32-character-encryption-key
  your-encryption-key-32-chars-min
  your-super-secret-and-long-logflare-key
  your-super-secret-and-long-logflare-key-public
  your-super-secret-and-long-logflare-key-private
  api-key
  secret1234
  625729a08b95bf1b7ff351a663f3a23c
  850181e4652dd023b7a98c58ae0d2d34bd487ee0cc3254aed6eda37307425907
)
DEFAULT_JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long

# KEY=value lines, without comments; quotes around the value are removed
value() {
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$2" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}
is_secret() { [[ $1 =~ (PASSWORD|SECRET|_KEY|TOKEN|KEY_BASE|ENC_KEY) ]] && [[ ! $1 =~ ^(OPENAI_API_KEY|.*_ASYMMETRIC|JWT_KEYS|JWT_JWKS)$ ]]; }
b64url() { tr '_-' '/+' | awk '{ while (length($0) % 4) $0 = $0 "="; print }' | base64 -d 2>/dev/null; }
hmac() { printf '%s' "$2" | openssl dgst -sha256 -hmac "$1" -binary | base64 | tr '/+' '_-' | tr -d '='; }

problems=0
declare -A reported
# One line per key, with the first reason found
bad() {
  [ -z "${reported[$1]:-}" ] || return 0
  reported[$1]=1
  echo "CHANGE  $1: $2"
  problems=$((problems + 1))
}

example="$(dirname "$ENV_FILE")/.env.example"
while IFS= read -r key; do
  is_secret "$key" || continue
  v=$(value "$key" "$ENV_FILE")
  [ -n "$v" ] || continue
  for d in "${KNOWN_DEFAULTS[@]}"; do
    [ "$v" = "$d" ] && bad "$key" "still the example value"
  done
  if [ -r "$example" ] && [ "$v" = "$(value "$key" "$example")" ]; then
    printf '%s\n' "${KNOWN_DEFAULTS[@]}" | grep -qxF -- "$v" || bad "$key" "same as in .env.example"
  fi
done < <(sed -n 's/^[[:space:]]*\([A-Z0-9_]*\)[[:space:]]*=.*/\1/p' "$ENV_FILE" | sort -u)

jwt_secret=$(value JWT_SECRET "$ENV_FILE")
if [ "${#jwt_secret}" -lt 32 ]; then
  bad JWT_SECRET "shorter than 32 characters"
fi
dashboard=$(value DASHBOARD_PASSWORD "$ENV_FILE")
if [ -n "$dashboard" ] && [ "${#dashboard}" -lt 16 ]; then
  bad DASHBOARD_PASSWORD "shorter than 16 characters"
fi

# The API keys must be signed with this installation's JWT_SECRET, not the example one
for key in ANON_KEY SERVICE_ROLE_KEY; do
  jwt=$(value "$key" "$ENV_FILE")
  [ -n "$jwt" ] || continue
  IFS=. read -r head body sig <<<"$jwt"
  if [ "$(hmac "$DEFAULT_JWT_SECRET" "$head.$body")" = "$sig" ]; then
    bad "$key" "signed with the example JWT_SECRET (make new keys from the new secret)"
  elif [ -n "$jwt_secret" ] && [ "$(hmac "$jwt_secret" "$head.$body")" != "$sig" ]; then
    echo "NOTE    $key: not signed with this JWT_SECRET; Supabase will reject it"
  fi
  if printf '%s' "$body" | b64url | grep -q '"supabase-demo"'; then
    bad "$key" "the demo key from the example file"
  fi
done

if [ "$problems" -eq 0 ]; then
  echo "OK: no example secrets found in $ENV_FILE"
else
  echo "$problems secret(s) to change; afterwards put the new SERVICE_ROLE_KEY into the app's prod.env"
  exit 1
fi
