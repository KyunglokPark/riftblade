// Pixellab GIF → 프레임 PNG 추출기
// 사용법: node tools/gif2frames.js <input.gif> <출력디렉토리> [프레임접두사]
// 출력: <dir>/<prefix>_N.png + 검수용 sheet.png + 프레임별 바운딩박스 로그
const fs = require("fs");
const path = require("path");
const { GifReader } = require("omggif");
const { PNG } = require("pngjs");

const [, , gifPath, outDir, prefix = "f"] = process.argv;
if (!gifPath || !outDir) {
  console.error("사용법: node tools/gif2frames.js <input.gif> <outDir> [prefix]");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const reader = new GifReader(fs.readFileSync(gifPath));
const W = reader.width;
const H = reader.height;
console.log(`size ${W}x${H}, frames ${reader.numFrames()}`);

let canvas = Buffer.alloc(W * H * 4);
const frames = [];
for (let i = 0; i < reader.numFrames(); i++) {
  const info = reader.frameInfo(i);
  const prev = Buffer.from(canvas);
  reader.decodeAndBlitFrameRGBA(i, canvas);
  frames.push({ data: Buffer.from(canvas), delay: info.delay * 10 });
  if (info.disposal === 2) {
    for (let y = info.y; y < info.y + info.height; y++)
      for (let x = info.x; x < info.x + info.width; x++) canvas.writeUInt32BE(0, (y * W + x) * 4);
  } else if (info.disposal === 3) {
    canvas = prev;
  }
}

frames.forEach((f, i) => {
  const png = new PNG({ width: W, height: H });
  f.data.copy(png.data);
  fs.writeFileSync(path.join(outDir, `${prefix}_${i}.png`), PNG.sync.write(png));
  // 바운딩박스 (발 위치·중심 계산용)
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (f.data[(y * W + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  console.log(
    `${prefix}_${i}: delay ${f.delay}ms, x ${minX}-${maxX} (cx ${((minX + maxX) / 2).toFixed(1)}), y ${minY}-${maxY}`
  );
});

// 검수용 확대 콘택트 시트
const SC = 5;
const sheet = new PNG({ width: W * SC * frames.length, height: H * SC });
frames.forEach((f, fi) => {
  for (let y = 0; y < H * SC; y++)
    for (let x = 0; x < W * SC; x++) {
      const si = (((y / SC) | 0) * W + ((x / SC) | 0)) * 4;
      const di = (y * sheet.width + fi * W * SC + x) * 4;
      f.data.copy(sheet.data, di, si, si + 4);
    }
});
fs.writeFileSync(path.join(outDir, "sheet.png"), PNG.sync.write(sheet));
console.log("done:", path.join(outDir, "sheet.png"));
