#!/bin/sh
# Same as build.cmd for mac/linux.
npx --yes esbuild@0.24.2 main.js --bundle --format=iife --target=es2019 --minify --legal-comments=none --outfile=dist/sgp.min.js
