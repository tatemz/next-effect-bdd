# syntax=docker/dockerfile:1
FROM node:24-alpine3.24 AS base

FROM base AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.22.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY . .
RUN pnpm build && NODE_ENV=production node scripts/package-runtime.mjs

FROM base AS runtime
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Flatten the cleaned runtime so deleted package managers do not occupy layers.
# Keep Node's matching Alpine libraries, CA certificates and non-root user.
FROM scratch AS runner
COPY --from=runtime / /
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    MODE=production \
    LANGUAGE=en \
    PORT=3000

# Custom Effect server + Next production traces, not Next's standalone server.
COPY --from=builder --chown=1000:1000 /app/.output ./
USER 1000:1000
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# Keep Node as PID 1 so Effect receives SIGTERM and closes its scoped resources.
CMD ["node", "main.ts"]
