# Use official Node.js runtime as a parent image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies inside the container
RUN npm install --production

# Copy the rest of the application files
COPY . .

# Expose port 5000 for the Express API
EXPOSE 5000

# Define environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Command to run the RAG Express server
CMD [ "node", "server.js" ]
