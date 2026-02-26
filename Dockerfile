FROM node:20-alpine

WORKDIR /app

# Copy package files from backend subdirectory
COPY shreenika-ai-backend/package*.json ./

# Install production dependencies only
RUN npm install --only=production

# Copy backend source code
COPY shreenika-ai-backend .

EXPOSE 8080

CMD ["node", "src/server.js"]
