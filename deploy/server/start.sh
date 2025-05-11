#!/bin/bash
cd "${0%/*}"
npm install
npm run sync-images
pm2 delete photo-portfolio || true
pm2 start server.js --name photo-portfolio
