#!/usr/bin/env bash
# Keeps trying to create the Always Free A1 instance until Oracle has capacity.
#
# Run it in Oracle Cloud Shell, not on your own machine: Cloud Shell is already
# signed in and sets $OCI_TENANCY. SETUP.md step 6 has the full instructions.
#
#   curl -fsSLo ~/retry.sh https://raw.githubusercontent.com/abhinavv-21/lrimunx/main/scripts/oracle-retry.sh
#   bash ~/retry.sh
#
# Safe to stop and re-run at any time. Before every attempt it checks whether an
# A1 instance already exists, and stops if one does, so it can never create a
# second machine. A second one would go over the Always Free limit.
#
# This is a file rather than something to paste because pasting it broke: an
# interactive shell treats "!" as history expansion, and the queries use it.

SHAPE="VM.Standard.A1.Flex"
KEY="$HOME/lrimunx.pub"
WAIT_SECONDS=120
# Tried in this order every round. The smaller one fits more often, and the
# instance can be resized to 2 / 12 later from its page in the console.
SIZES=('{"ocpus":2,"memoryInGBs":12}' '{"ocpus":1,"memoryInGBs":6}')

C="${OCI_TENANCY:-}"
if [ -z "$C" ]; then
  echo "OCI_TENANCY is empty. Run this in Oracle Cloud Shell, not on your own computer."
  exit 1
fi
if [ ! -s "$KEY" ]; then
  echo "$KEY is missing or empty. Put your SSH public key in it first (SETUP.md step 6)."
  exit 1
fi

AD=$(oci iam availability-domain list --compartment-id "$C" \
  --query 'data[0].name' --raw-output)
SUBNET=$(oci network subnet list --compartment-id "$C" --all \
  --query 'data[?contains("display-name", `public`)] | [0].id' --raw-output)
IMAGE=$(oci compute image list --compartment-id "$C" --all \
  --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
  --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC \
  --query 'data[?!contains("display-name", `Minimal`)] | [0].id' --raw-output)

echo "Availability domain: $AD"
echo "Subnet:              $SUBNET"
echo "Image:               $IMAGE"

for pair in "availability domain:$AD" "public subnet:$SUBNET" "Ubuntu 24.04 image:$IMAGE"; do
  value="${pair#*:}"
  if [ -z "$value" ] || [ "$value" = "null" ]; then
    echo "Could not find the ${pair%%:*}. Stopping."
    exit 1
  fi
done

attempt=0
while true; do
  existing=$(oci compute instance list --compartment-id "$C" --all \
    --query "length(data[?shape=='$SHAPE' && \"lifecycle-state\"!='TERMINATED' && \"lifecycle-state\"!='TERMINATING'])" \
    --raw-output 2>/dev/null)
  if [ -n "$existing" ] && [ "$existing" != "0" ]; then
    echo "An A1 instance already exists. Nothing to do. See Compute > Instances."
    exit 0
  fi

  for size in "${SIZES[@]}"; do
    attempt=$((attempt + 1))
    echo "$(date -u +%H:%M:%S) UTC  attempt $attempt  $size"

    out=$(oci compute instance launch \
      --availability-domain "$AD" \
      --compartment-id "$C" \
      --shape "$SHAPE" \
      --shape-config "$size" \
      --image-id "$IMAGE" \
      --subnet-id "$SUBNET" \
      --assign-public-ip true \
      --boot-volume-size-in-gbs 50 \
      --display-name lrimunx \
      --ssh-authorized-keys-file "$KEY" 2>&1)

    if printf '%s' "$out" | grep -q '"lifecycle-state"'; then
      echo "Created with $size. Open Compute > Instances and continue at SETUP.md step 7."
      exit 0
    fi

    if printf '%s' "$out" | grep -qiE 'capacity|TooManyRequests|"status": 429|timed out'; then
      echo "                no capacity yet"
    else
      echo "Stopped on an error that is not about capacity:"
      printf '%s\n' "$out"
      exit 1
    fi
  done

  sleep "$WAIT_SECONDS"
done
