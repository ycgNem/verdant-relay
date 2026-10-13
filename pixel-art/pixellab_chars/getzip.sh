#!/bin/sh
# usage: getzip.sh <key> <character_id>  -> raw/<key>/<key>.zip extracted (png/json only) to raw/<key>/zip
# (the download returns HTTP 423 while any job of the character is still running)
b=/c/Users/jacks/Documents/verdant-relay/pixel-art/pixellab_chars; mkdir -p $b/raw/$1
curl -s --fail -o $b/raw/$1/$1.zip.part https://api.pixellab.ai/mcp/characters/$2/download || { echo "download failed (jobs pending?)"; exit 1; }
mv $b/raw/$1/$1.zip.part $b/raw/$1/$1.zip; rm -rf $b/raw/$1/zip
python -P -E $b/extract.py $b/raw/$1/$1.zip $b/raw/$1/zip && ls $b/raw/$1/zip/*/animations/
