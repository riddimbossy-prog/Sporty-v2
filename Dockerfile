FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
RUN chmod +x scripts/render-build.sh && bash scripts/render-build.sh
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
CMD ["node", "server/index.mjs"]
