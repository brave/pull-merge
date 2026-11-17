# syntax=docker/dockerfile:1
#
# Prebuilt runtime image for brave/pull-merge.
#
# The composite action (action.yml) normally installs its toolchain at
# runtime — Node via setup-node, patchutils via apt, pnpm + node_modules
# via corepack/npm. That runtime network surface dies during Azure
# mirror and npm registry incidents, and setup-node re-downloads the
# Node tarball on every job. This image bakes:
#
#   /usr/local/bin/{node,npm,npx,corepack,pnpm}
#   /usr/bin/filterdiff        (patchutils — src/filterdiff.js)
#   /usr/bin/{gh,git}          (getPatch.js clone fallback)
#   /opt/pull-merge/node_modules  baked from pnpm-lock.yaml (--prod)
#   /opt/brave-pull-merge/manifest.json  lockfile hash;
#       action.yml gates on it to reuse the baked tree (hash mismatch →
#       online install with the baked pnpm).
#
# The action code itself is NOT baked: `uses: brave/pull-merge/...`
# checks out the action repo into the workspace, so pull-merge PR
# branches keep working against this image. Baked as root (job
# containers must not set USER — actions/checkout#956) on ubuntu:24.04
# for glibc compatibility with the runner-injected node externals.
#
# Build args are injected by .github/workflows/image.yml from
# package.json — no duplicated pins here.

# Base images are pinned by digest AND patched version: a mutable tag
# (node:24-slim, ubuntu:24.04) cannot be verified against a security
# patch level, and this image ships to jobs with repo tokens. Bump the
# digests deliberately (docker buildx imagetools inspect <name:tag>) —
# do not retag to floating refs.
FROM ubuntu:24.04@sha256:73b999393d07f2bf65a40373778a44dc9a6d54ad7718d29247d8ff9413c4d6a8

ARG PNPM_VERSION

ENV DEBIAN_FRONTEND=noninteractive \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8

# patchutils → filterdiff (src/filterdiff.js), gh+git → the
# getPatch.js clone fallback, ca-certificates for TLS.
RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    gh \
    git \
    patchutils \
  && rm -rf /var/lib/apt/lists/*

# Node from the official image (the runner does not inject node into job
# containers). npm/npx are symlinks into the copied tree. corepack is not
# shipped: inside the image every pnpm invocation uses the baked pnpm
# binary; corepack is only a host-mode concern.
COPY --from=node:24.22.1-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c /usr/local/bin/node /usr/local/bin/node
COPY --from=node:24.22.1-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
  && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
  && npm install -g "pnpm@${PNPM_VERSION}" \
  && npm cache clean --force

# Bake the production node_modules tree from the lockfile. Runtime
# action.yml copies it verbatim into the checked-out action when the
# lockfile still hashes to the manifest value. pnpm-workspace.yaml
# (resolution overrides) must be present or --frozen-lockfile
# resolution diverges.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /opt/pull-merge/
RUN pnpm install --frozen-lockfile --prod --dir /opt/pull-merge

# Manifest consumed by action.yml: the lockfile hash the baked
# node_modules tree was built from.
RUN mkdir -p /opt/brave-pull-merge \
  && printf '{\n  "pnpm_lock_sha256": "%s"\n}\n' \
    "$(sha256sum /opt/pull-merge/pnpm-lock.yaml | cut -d' ' -f1)" \
    > /opt/brave-pull-merge/manifest.json \
  && cat /opt/brave-pull-merge/manifest.json

# Smoke test the baked toolchain.
RUN node --version && npm --version && pnpm --version \
  && filterdiff --version 2>&1 | head -n1 \
  && gh --version | head -n1 && git --version
