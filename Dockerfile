# The dependencies are plain JavaScript, the same on every CPU, so install them once on the machine
# running the build instead of under emulation for each platform (npm crashes under QEMU on arm64).
FROM --platform=$BUILDPLATFORM node:22-slim AS deps

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev


FROM node:22-slim

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src

CMD ["npm", "start"]
