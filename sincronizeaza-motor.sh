#!/bin/sh
# Aplicația folosește exact motorul din GitHub Actions: copiază-l după orice schimbare în date-repo/runner.
# v0.44: și amprentele codului analizei (pwa/amprente.json), cu care aplicația verifică ce rulează în analist-date.
cd "$(dirname "$0")" && cp date-repo/runner/engine.js date-repo/runner/config.js pwa/motor/ && echo "motor copiat în pwa/motor/" && node amprente.mjs
