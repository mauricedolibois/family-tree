#!/bin/bash
set -eu

# The password comes on stdin, so it never shows up in the process list
if [ "$#" -ne 2 ]; then
  echo "Usage: echo <CI_DEPLOY_PASSWORD> | $0 <CI_REGISTRY> <CI_DEPLOY_USER>"
  exit 1
fi

CI_REGISTRY="$1"
CI_DEPLOY_USER="$2"
IFS= read -r CI_DEPLOY_PASSWORD

cd ~/family-tree

printf '%s\n' "${CI_DEPLOY_PASSWORD}" | docker login "${CI_REGISTRY}" -u "${CI_DEPLOY_USER}" --password-stdin

docker compose --env-file prod.env -f docker-compose.yml pull
docker compose --env-file prod.env -f docker-compose.yml up -d

docker logout "${CI_REGISTRY}"