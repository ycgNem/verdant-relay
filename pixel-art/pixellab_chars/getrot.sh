#!/bin/sh
# usage: getrot.sh <key> <base-url-up-to-rotations/> <t>
d=/c/Users/jacks/Documents/verdant-relay/pixel-art/pixellab_chars/raw/$1/rot; mkdir -p $d
for r in south south-east east north-east north; do curl -s -o $d/$r.png "$2$r.png?t=$3"; done
