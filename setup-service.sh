#!/bin/bash

# Ubuntu Server service setup script for assetshold
# This script automatically configures systemd service with correct user settings

set -e

echo "Setting up assetshold systemd service..."

# Get current user and working directory
USERNAME=$(whoami)
WORKDIR=$(pwd)

echo "Current user: $USERNAME"
echo "Working directory: $WORKDIR"

# Check if running as root
if [ "$USERNAME" = "root" ]; then
    echo "Error: Please run this script as a regular user, not root"
    exit 1
fi

# Check if assetshold.service exists
if [ ! -f "assetshold.service" ]; then
    echo "Error: assetshold.service file not found in current directory"
    echo "Please run this script from the assetshold project root"
    exit 1
fi

# Create a temporary copy and update it with current user settings
cp assetshold.service assetshold.service.tmp

# Replace user, group, and working directory
sed -i "s/User=yangnana/User=$USERNAME/" assetshold.service.tmp
sed -i "s/Group=yangnana/Group=$USERNAME/" assetshold.service.tmp
sed -i "s|WorkingDirectory=/home/yangnana/assetshold|WorkingDirectory=$WORKDIR|" assetshold.service.tmp

echo "Service configuration:"
echo "  User: $USERNAME"
echo "  Group: $USERNAME"
echo "  WorkingDirectory: $WORKDIR"

# Check Node.js installation
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "Error: Node.js not found in PATH"
    exit 1
fi
echo "  Node.js path: $NODE_PATH"

# Update Node.js path in service file if different
sed -i "s|ExecStart=/usr/bin/node|ExecStart=$NODE_PATH|" assetshold.service.tmp

# Set up directories and permissions
echo "Setting up directories and permissions..."
mkdir -p data backup
chmod 755 data backup
sudo chown -R $USERNAME:$USERNAME .

# Install service file
echo "Installing systemd service..."
sudo cp assetshold.service.tmp /etc/systemd/system/assetshold.service
rm assetshold.service.tmp

# Reload and enable service
sudo systemctl daemon-reload
sudo systemctl enable assetshold

echo "Service setup complete!"
echo ""
echo "To start the service:"
echo "  sudo systemctl start assetshold"
echo ""
echo "To check status:"
echo "  sudo systemctl status assetshold"
echo ""
echo "To view logs:"
echo "  sudo journalctl -u assetshold -f"