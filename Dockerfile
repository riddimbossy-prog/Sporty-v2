FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN chmod +x scripts/render-build.sh \
  && bash scripts/render-build.sh

ENV NODE_ENV=production
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=10000

EXPOSE 10000
CMD ["node", "server/index.mjs"]
