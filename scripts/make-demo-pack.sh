#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
demo_dir="$project_root/demo-pack"
mkdir -p "$demo_dir"
cp "$project_root/fixtures/320x240-2.ogv" "$demo_dir/dub_video.ogv"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'sine=frequency=440:duration=0.9' "$demo_dir/01_Hello.wav"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'sine=frequency=660:duration=1.1' "$demo_dir/02_Reply.wav"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i 'sine=frequency=180:duration=4' "$demo_dir/_backing_track.wav"
cat > "$demo_dir/_pack_info.ini" <<'EOF'
[data]
title="Webby Voicer demo"
authors=["Webby Voicer team"]
EOF
cat > "$demo_dir/01_Hello.txt" <<'EOF'
[data]
caption="Is this thing on?"
dub_timestamps=[00.600]
dub_characters=["Mina"]
EOF
cat > "$demo_dir/02_Reply.txt" <<'EOF'
[data]
caption="Loud and clear!"
dub_timestamps=[02.200]
dub_characters=["Alex"]
EOF
(cd "$project_root" && zip -q -r demo-pack.zip demo-pack)
mkdir -p "$project_root/public"
cp "$project_root/demo-pack.zip" "$project_root/public/demo-pack.zip"
echo "$project_root/demo-pack.zip"
echo 'This synthetic Dub pack uses a public-domain Ogg Theora test video. It tests real legacy video decoding.'
