FROM node:20-alpine
WORKDIR /app
COPY linepay-server/package.json ./package.json
COPY linepay-server/server.js ./server.js
ENV NODE_ENV=production
EXPOSE 8080
CMD ["npm","start"]
