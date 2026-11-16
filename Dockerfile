FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY *.mjs ./
COPY public ./public
ENV NODE_ENV=production LISTEN_HOST=0.0.0.0 FTP_LISTEN_HOST=0.0.0.0 FFMPEG_PATH=/usr/bin/ffmpeg PORT=8787
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8787 2121 50000-50009
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node --input-type=module -e "import {config} from './config.mjs';fetch('http://127.0.0.1:'+config.port+config.basePath+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
