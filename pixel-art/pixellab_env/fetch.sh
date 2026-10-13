#!/bin/sh
# fetch.sh <object_id> <n_frames> <dest_dir under raw/>  -- downloads review-pack frames
mkdir -p "raw/$3"
base="https://backblaze.pixellab.ai/file/pixellab-characters/objects/859e3c7d-c1c3-4eee-9e06-c95bf333277b/$1/rotations"
i=0; while [ $i -lt $2 ]; do curl -sSL -o "raw/$3/frame_$i.png" "$base/frame_$i.png"; i=$((i+1)); done
