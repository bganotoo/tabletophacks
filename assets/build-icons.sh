#!/bin/sh
# Regenerate the committed site icons and social card from the SVG sources in
# this directory. Authoring-time only: the site never runs this, `npm test`
# does not depend on it, and all of its outputs are committed to the repo
# root. Re-run it after editing any of the four SVGs.
#
# Requires ImageMagick 7 (`magick`). Text in og-image.svg renders with
# whichever of DM Sans / Segoe UI / Arial the machine has; the committed PNG
# was built on a machine with none of the three, so a regeneration elsewhere
# may shift the wordmark slightly. Eyeball the result before committing it.
#
# Usage:  sh assets/build-icons.sh      (from the repo root)

set -eu

here=$(dirname "$0")
root=$here/..
bg='#0d0d1a'

# Everything supersamples and downsamples, which antialiases the thin d20
# strokes far better than rasterizing straight to the target size. The density
# is derived from each SVG's own intrinsic width (the sources are 64px and
# 512px), never hardcoded — getting that wrong silently renders a 4px image
# and upscales it to a blur.
render() { # render <src.svg> <size> <dest.png>
  intrinsic=$(magick identify -ping -format '%w' "$1")
  density=$((96 * 2 * $2 / intrinsic))
  [ "$density" -lt 96 ] && density=96
  magick -density "$density" -background "$bg" "$1" \
    -resize "$2x$2" -depth 8 -strip "$3"
}

render "$here/icon-solid.svg" 180 "$root/apple-touch-icon.png"
render "$here/icon-solid.svg" 192 "$root/icon-192.png"
render "$here/icon-solid.svg" 512 "$root/icon-512.png"

# Multi-resolution .ico for old browsers and crawlers that ignore favicon.svg.
# The 16px frame comes from icon-16.svg, not icon-solid.svg: at 16px the face
# lines of the full mark collapse into an amber blob, so that frame drops them
# and draws a bigger, heavier silhouette instead.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
render "$here/icon-solid.svg" 48 "$tmp/48.png"
render "$here/icon-solid.svg" 32 "$tmp/32.png"
render "$here/icon-16.svg"    16 "$tmp/16.png"
magick "$tmp/48.png" "$tmp/32.png" "$tmp/16.png" "$root/favicon.ico"

magick -density 192 -background "$bg" "$here/og-image.svg" \
  -resize 1200x630 -depth 8 -strip "$root/og-image.png"

# favicon.svg is served from the root; keep it a byte-for-byte copy.
cp "$here/icon.svg" "$root/favicon.svg"

magick identify "$root/favicon.ico" "$root/apple-touch-icon.png" \
  "$root/icon-192.png" "$root/icon-512.png" "$root/og-image.png"
