#!/bin/bash

# Pull latest code
git pull origin main

# Copy Nginx configuration
sudo cp -f deploy/nginx/mystockvision.conf /etc/nginx/sites-available/mystockvision.conf
sudo ln -sf /etc/nginx/sites-available/mystockvision.conf /etc/nginx/sites-enabled/mystockvision.conf
sudo nginx -t && sudo systemctl restart nginx

# Build and restart containers (no-cache to ensure ENV changes are picked up)
sudo docker compose -f docker-compose.prod.yml build --no-cache
sudo docker compose -f docker-compose.prod.yml up -d

# Restart Nginx to pick up any config changes
sudo systemctl restart nginx

echo "Deployment Complete!"
