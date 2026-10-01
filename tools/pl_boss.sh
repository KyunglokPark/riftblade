#!/bin/bash
# 보스 2종(reaper/colossus) 생성 파이프라인 — Tier0 동시 1작업 제한에 맞춰 순차 실행
cd "$(dirname "$0")/.." || exit 1
KEY=$(cat .pixellab_key)
REAPER=477f0967-eb9f-4cde-8e11-a50f0a62f8ee
COLOSSUS=""

# zip 안에 특정 경로 패턴이 생길 때까지 폴링
wait_zip() { # $1=char_id $2=python substring expr
  local id=$1 pat=$2
  for i in $(seq 1 60); do
    curl -s -H "Authorization: Bearer $KEY" "https://api.pixellab.ai/v2/characters/$id/zip" -o /tmp/plb.zip
    ok=$(python3 -c "
import zipfile
try:
    n=zipfile.ZipFile('/tmp/plb.zip').namelist()
    print('yes' if any($pat in x for x in n) else 'no')
except Exception: print('no')
")
    [ "$ok" = "yes" ] && return 0
    sleep 15
  done
  return 1
}

# 동시 작업 제한에 걸리면 성공할 때까지 재시도하는 POST
post_retry() { # $1=url $2=json → stdout 응답
  local url=$1 json=$2
  for i in $(seq 1 60); do
    resp=$(curl -s -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -X POST "$url" -d "$json")
    if echo "$resp" | grep -q "concurrent"; then sleep 20; continue; fi
    echo "$resp"; return 0
  done
  return 1
}

echo "[1/6] reaper 캐릭터 대기..."
wait_zip $REAPER "'rotations/south-east.png'" || echo "reaper rotation timeout"

# 재실행 대비: 이미 만든 colossus id가 있으면 재사용 (중복 생성 방지)
if [ -s tools/out/boss_ids.txt ]; then
  COLOSSUS=$(awk '{print $2}' tools/out/boss_ids.txt)
fi
if [ -z "$COLOSSUS" ]; then
  echo "[2/6] colossus 캐릭터 생성..."
  resp=$(post_retry https://api.pixellab.ai/v2/create-character-v3 '{"description":"massive hulking ember golem, cracked black obsidian rock body with glowing orange magma veins, enormous molten stone fists, horned rocky head with burning eyes, dark fantasy boss brute","image_size":{"width":64,"height":64},"view":"side","template_id":"mannequin","no_background":true}')
  COLOSSUS=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('character_id',''))")
  echo "colossus id: $COLOSSUS"
  echo "$REAPER $COLOSSUS" > tools/out/boss_ids.txt
else
  echo "[2/6] colossus 재사용: $COLOSSUS"
fi
wait_zip "$COLOSSUS" "'rotations/south-east.png'" || echo "colossus rotation timeout"

# 이미 완료된 애니메이션은 요청 생략 (zip에 프레임이 있으면 skip)
has_anim() { # $1=id $2=python substring expr
  curl -s -H "Authorization: Bearer $KEY" "https://api.pixellab.ai/v2/characters/$1/zip" -o /tmp/plb.zip
  python3 -c "
import zipfile
try:
    n=zipfile.ZipFile('/tmp/plb.zip').namelist()
    print('yes' if any($2 in x for x in n) else 'no')
except Exception: print('no')
"
}

for pair in "reaper:$REAPER" "colossus:$COLOSSUS"; do
  name="${pair%%:*}"; id="${pair##*:}"
  if [ "$(has_anim "$id" "'alking' in x and 'frame_00' in x and 'south-east'")" != "yes" ]; then
    echo "[anim] $name walking..."
    post_retry https://api.pixellab.ai/v2/characters/animations "{\"character_id\":\"$id\",\"mode\":\"template\",\"template_animation_id\":\"walking\",\"directions\":[\"south-east\"]}" > /dev/null
    wait_zip "$id" "'alking' in x and 'frame_00' in x and 'south-east'" || echo "$name walking timeout"
  else
    echo "[anim] $name walking 이미 완료"
  fi
  if [ "$(has_anim "$id" "'punch' in x and 'frame_00' in x and 'south-east'")" != "yes" ]; then
    echo "[anim] $name cross-punch..."
    post_retry https://api.pixellab.ai/v2/characters/animations "{\"character_id\":\"$id\",\"mode\":\"template\",\"template_animation_id\":\"cross-punch\",\"directions\":[\"south-east\"]}" > /dev/null
    wait_zip "$id" "'punch' in x and 'frame_00' in x and 'south-east'" || echo "$name punch timeout"
  else
    echo "[anim] $name cross-punch 이미 완료"
  fi
  curl -s -H "Authorization: Bearer $KEY" "https://api.pixellab.ai/v2/characters/$id/zip" -o "tools/out/${name}_full.zip"
  python3 -c "import zipfile; zipfile.ZipFile('tools/out/${name}_full.zip').extractall('tools/out/${name}_full')"
  echo "$name extracted"
done
echo "BOSS ASSETS ALL DONE"
