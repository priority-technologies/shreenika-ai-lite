# Production stage
FROM nginx:alpine

# Force complete rebuild - bust all caches (2026-02-26 AnalyserNode deployment)
# This ensures Docker doesn't use old cached layers with stale dist/

# Copy pre-built dist directory (with AnalyserNode audio capture fix - index-DwZQSxlL.js)
COPY dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
