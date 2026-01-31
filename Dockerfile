# Use official Node.js image as the base
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app


# Copy package.json and package-lock.json
COPY package*.json ./


# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the Next.js app (optional, falls du ein Production-Build möchtest)
RUN npm run build

# --- Runtime Stage ---
FROM node:20-alpine AS runner
WORKDIR /app

# Nur die notwendigen Dateien kopieren
COPY --from=builder /app .

EXPOSE 3000
CMD ["npm", "run", "prod"]