// PNG 프레임들의 바운딩박스(발 행·중심 열·캔버스) 측정 + 검수 시트
// 사용법: node tools/anchor.cjs <sheet출력.png> <png파일...>
const fs = require("fs");
const { PNG } = require("pngjs");
const [, , sheetOut, ...files] = process.argv;
const imgs = files.map((f) => PNG.sync.read(fs.readFileSync(f)));
let W = 0, H = 0;
imgs.forEach((p, i) => {
  let minX = p.width, maxX = -1, minY = p.height, maxY = -1;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++)
      if (p.data[(y * p.width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  W = p.width; H = p.height;
  console.log(`${files[i].split("/").pop()}: ${p.width}x${p.height} cx${((minX + maxX) / 2).toFixed(1)} foot${maxY} top${minY}`);
});
if (sheetOut && sheetOut !== "-") {
  const SC = 4;
  const sheet = new PNG({ width: W * SC * imgs.length, height: H * SC });
  imgs.forEach((img, fi) => {
    for (let y = 0; y < H * SC; y++)
      for (let x = 0; x < W * SC; x++) {
        const sx = (x / SC) | 0, sy = (y / SC) | 0;
        if (sx >= img.width || sy >= img.height) continue;
        const si = (sy * img.width + sx) * 4;
        const di = (y * sheet.width + fi * W * SC + x) * 4;
        img.data.copy(sheet.data, di, si, si + 4);
      }
  });
  fs.writeFileSync(sheetOut, PNG.sync.write(sheet));
  console.log("sheet:", sheetOut);
}
