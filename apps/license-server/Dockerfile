FROM node:22-alpine
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src/ ./src/
RUN npx tsc -p tsconfig.json
EXPOSE 8003
CMD ["node", "dist/server.js"]
