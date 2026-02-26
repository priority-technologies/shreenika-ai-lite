# Production stage
FROM nginx:alpine

# Copy pre-built dist directory (with AnalyserNode audio capture fix)
COPY dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
