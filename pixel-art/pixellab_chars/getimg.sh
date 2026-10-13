#!/bin/sh
# usage: getimg.sh <key> <anim> <job_id> <nframes>   (animate_image results, index 0 = input frame)
d=/c/Users/jacks/Documents/verdant-relay/pixel-art/pixellab_chars/raw/$1/$2; mkdir -p $d
i=0; while [ $i -lt $4 ]; do curl -s -o $d/$(printf %02d $i).png "https://api.pixellab.ai/mcp/images/$3/download?index=$i"; i=$((i+1)); done
