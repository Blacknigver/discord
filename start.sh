#!/bin/bash

# Simple startup script for the Brawl Stars Boosting Discord Bot

echo "Starting Brawl Stars Boosting Discord Bot..."

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js to run this bot."
    exit 1
fi

# Check if required files exist
if [ ! -f "index.js" ]; then
    echo "index.js not found. Make sure you're in the correct directory."
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found. You may need to create one with your bot token."
    echo "Creating sample .env file..."
    echo "BOT_TOKEN=your_token_here" > .env
    echo "Please edit the .env file with your actual bot token."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the bot
echo "Starting bot..."
node index.js 