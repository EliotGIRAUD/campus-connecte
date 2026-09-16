FROM node:22-alpine
RUN apk add --no-cache openssl libc6-compat postgresql-client
WORKDIR /app
COPY package.json ./
RUN npm install
COPY prisma ./prisma
COPY prisma-lake ./prisma-lake
RUN npx prisma generate && npx prisma generate --schema prisma-lake/schema.prisma
COPY tsconfig.json ./
COPY scripts ./scripts
COPY src ./src
RUN chmod +x scripts/ensure-lake-db.sh
EXPOSE 3000
CMD ["sh", "-c", "./scripts/ensure-lake-db.sh && npx prisma migrate deploy && npx prisma migrate deploy --schema prisma-lake/schema.prisma && npx tsx src/index.ts"]
