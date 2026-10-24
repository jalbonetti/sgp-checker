@echo off
REM Builds the single-file bundle the Webflow page loads (dist\sgp.min.js). Run before every push.
REM Needs Node; esbuild is fetched on first run by npx.
npx --yes esbuild@0.24.2 main.js --bundle --format=iife --target=es2019 --minify --legal-comments=none --outfile=dist/sgp.min.js
