#!/bin/bash
set -eu

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <CI_REGISTRY> <CI_DEPLOY_USER> <CI_DEPLOY_PASSWORD>"
  exit 1
fi

CI_REGISTRY="$1"
CI_DEPLOY_USER="$2"
CI_DEPLOY_PASSWORD="$3"

cd ~/family-tree

echo "${CI_DEPLOY_PASSWORD}" | docker login "${CI_REGISTRY}" -u "${CI_DEPLOY_USER}" --password-stdin

docker compose --env-file prod.env -f docker-compose.yml pull
docker compose --env-file prod.env -f docker-compose.yml up -d

docker logout "${CI_REGISTRY}"