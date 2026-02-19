#!/bin/bash

# Quick Deployment Script for Shreenika AI Backend
# Usage: ./DEPLOY_NOW.sh
# Or: bash DEPLOY_NOW.sh

PROJECT_ID="gen-lang-client-0348687456"
REGION="asia-south1"
SERVICE_NAME="shreenika-ai-backend"

echo "🚀 Starting deployment of $SERVICE_NAME to Cloud Run..."
echo "   Project: $PROJECT_ID"
echo "   Region: $REGION"
echo "   Service: $SERVICE_NAME"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ ERROR: gcloud CLI not found!"
    echo "   Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
echo "📌 Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Deploy
echo ""
echo "⏳ Deploying... (this will take ~5 minutes)"
echo ""

gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 2 \
    --timeout 3600s

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ DEPLOYMENT SUCCESSFUL!"
    echo ""
    echo "🔍 View live logs:"
    echo "   https://console.cloud.google.com/logs?project=$PROJECT_ID"
    echo ""
    echo "📊 Check service status:"
    echo "   https://console.cloud.google.com/run?project=$PROJECT_ID"
    echo ""
    echo "🧪 Next: Make a test call and check the logs"
else
    echo ""
    echo "❌ DEPLOYMENT FAILED!"
    echo "   Check error messages above"
    exit 1
fi
