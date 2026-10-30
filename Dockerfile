# Image เดียวรันทั้ง backend และเสิร์ฟหน้าเว็บ (dist/) — build หน้าเว็บ (npm run build) ก่อนแล้วค่อย docker build
FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY dist/ /app/dist/
ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
