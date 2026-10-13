#!/bin/sh
# usage: getanim.sh <outdir> <url-with-{i}> <nframes>  (one direction of a character animation from get_character)
mkdir -p "$1"; i=0
while [ $i -lt $3 ]; do u=$(echo "$2" | sed "s/{i}/$i/"); curl -s --fail -o "$1/frame_$(printf %03d $i).png" "$u" || echo "fail $i"; i=$((i+1)); done
