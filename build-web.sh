#!/bin/bash

# Build script for iCalendar Ripper with Web Interface

echo "🔄 Generating calendars..."
npm run generate-calendars

echo "🔄 Building web interface..."
cd web
npm install --silent
npm run build

echo "✅ Build complete!"
echo "📁 Calendars: ./output/"
echo "🌐 Web interface: ./output-web/"
echo ""
echo "To serve the web interface locally:"
echo "  cd output-web && python3 -m http.server 8000"
echo "  Then open: http://localhost:8000"
