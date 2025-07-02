FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY ../shared/ ./shared/

# Build TypeScript
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S agent -u 1001

# Change ownership
RUN chown -R agent:nodejs /app
USER agent

# Health check
HEALTHCHEK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${FE_DRAFT_PORT:-3011}/health || exit 1

EXPOSE ${FE_DRAFT_PORT:-3011}

CMD ["npm", "start"]