# xNet Bootstrap Node
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files
COPY dist/ ./dist/

# Expose ports (TCP, WebSocket, Health)
EXPOSE 4001 4002 4003

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4003/health || exit 1

# Run node
CMD ["node", "dist/node.js"]
