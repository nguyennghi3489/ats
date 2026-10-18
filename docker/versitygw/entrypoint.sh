#!/bin/sh
# Creates the dev bucket, then starts versitygw with the image's own entrypoint.
# With the posix backend a bucket is a directory under the data root, so creating the
# directory is enough and is safe to repeat on every start.
set -eu

: "${S3_BUCKET:?S3_BUCKET is required}"
mkdir -p "${VGW_BACKEND_ARG:-/data}/${S3_BUCKET}"

exec /usr/local/bin/docker-entrypoint.sh "$@"
