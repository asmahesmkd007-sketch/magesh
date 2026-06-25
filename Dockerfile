# Use Node.js 20
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Expose port
ENV PORT=8080
EXPOSE 8080

# Start preview server
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "8080"]
