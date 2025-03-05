# Use the official Node image based on Alpine Linux
FROM node:22-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install -g npm@latest
RUN npm install

# Copy the rest of your application code, including index.js, commands, and utils directories
COPY . .

# Define the default command to run your application
CMD ["node", "index.js"]