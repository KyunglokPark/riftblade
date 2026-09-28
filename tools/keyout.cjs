// 근흑색 배경 → 투명 키잉 (패럴럭스 레이어 가공용)
// 사용법: node tools/keyout.cjs <input.png> <output.png> [완전투명 임계값=22] [램프 끝=48]
const fs = require("fs");
const { PNG } = require("pngjs");

const [, , inPath, outPath, t0s, t1s] = process.argv;
const T0 = parseInt(t0s ?? "22", 10); // max(r,g,b) 이 값 미만 → alpha 0
const T1 = parseInt(t1s ?? "48", 10); // T0~T1 구간은 알파 램프(부드러운 가장자리)

const png = PNG.sync.read(fs.readFileSync(inPath));
let keyed = 0;
for (let i = 0; i < png.data.length; i += 4) {
  const m = Math.max(png.data[i], png.data[i + 1], png.data[i + 2]);
  if (m < T0) {
    png.data[i + 3] = 0;
    keyed++;
  } else if (m < T1) {
    png.data[i + 3] = Math.round(((m - T0) / (T1 - T0)) * 255);
  }
}
fs.writeFileSync(outPath, PNG.sync.write(png));
console.log(`keyed ${keyed} px (${((keyed / (png.width * png.height)) * 100).toFixed(1)}%) → ${outPath}`);
