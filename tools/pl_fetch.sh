#!/bin/bash
# Pixellab 캐릭터 zip(애니 프레임 포함)이 준비될 때까지 폴링 후 다운로드
KEY=$(cat "$(dirname "$0")/../.pixellab_key")
cd "$(dirname "$0")/.." || exit 1
declare -A CH=( [lancer]=fd809e57-ec50-490f-88eb-52452089cbb7 [shaman]=bbe045ba-45e7-4f49-a19b-6d3f45b07379 )
for name in "${!CH[@]}"; do
  id=${CH[$name]}
  for attempt in $(seq 1 40); do
    curl -s -H "Authorization: Bearer $KEY" "https://api.pixellab.ai/v2/characters/$id/zip" -o "tools/out/${name}_full.zip"
    got=$(python3 -c "
import zipfile,sys
try:
    n=zipfile.ZipFile('tools/out/${name}_full.zip').namelist()
    have_atk=any('attack' in x and 'frame_00' in x for x in n)
    have_walk=any('Walking' in x and 'frame_00' in x or ('walk' in x.lower() and 'frame_00' in x) for x in n)
    print('yes' if (have_atk and have_walk) else 'no')
except Exception: print('no')
")
    if [ "$got" = "yes" ]; then
      python3 -c "import zipfile; zipfile.ZipFile('tools/out/${name}_full.zip').extractall('tools/out/${name}_full')"
      echo "$name ready (attempt $attempt)"
      break
    fi
    sleep 15
  done
done
echo "ALL DONE"
