# 레이어드 사운드 디자인으로 효과음 WAV 렌더링 (의존성 없음 — stdlib만)
# 사용법: python3 tools/make_sfx.py  →  public/audio/sfx/<이름>.wav
import math, random, struct, wave, os

SR = 44100
random.seed(7)

def render(dur):
    return [0.0] * int(SR * dur)

def mix(dst, src, at=0.0, gain=1.0):
    off = int(at * SR)
    for i, v in enumerate(src):
        j = off + i
        if 0 <= j < len(dst):
            dst[j] += v * gain
    return dst

def env(n, a, d, curve=2.2):
    # 어택 a초, 감쇠 d초 (지수 감쇠)
    out = []
    na, nd = int(a * SR), int(d * SR)
    for i in range(n):
        if i < na:
            out.append(i / max(1, na))
        else:
            t = (i - na) / max(1, nd)
            out.append(math.exp(-curve * t) if t < 1 else 0.0)
    return out

def osc(dur, f0, f1=None, wave_="sine", a=0.004, d=None, curve=2.2):
    f1 = f1 if f1 is not None else f0
    d = d if d is not None else dur
    n = int(dur * SR)
    e = env(n, a, d, curve)
    out = []
    ph = 0.0
    for i in range(n):
        t = i / n
        f = f0 * ((f1 / f0) ** t) if f0 > 0 else 0
        ph += 2 * math.pi * f / SR
        if wave_ == "sine":
            s = math.sin(ph)
        elif wave_ == "tri":
            s = 2 / math.pi * math.asin(math.sin(ph))
        elif wave_ == "saw":
            s = 2 * ((ph / (2 * math.pi)) % 1) - 1
        else:  # square
            s = 1.0 if math.sin(ph) > 0 else -1.0
        out.append(s * e[i])
    return out

def fmbell(dur, freq, ratio=2.76, idx=2.2, a=0.002, curve=3.0):
    # FM 벨: 모듈레이터 인덱스가 감쇠 → 따뜻한 종소리
    n = int(dur * SR)
    e = env(n, a, dur, curve)
    out = []
    for i in range(n):
        t = i / SR
        mi = idx * math.exp(-3.5 * i / n)
        s = math.sin(2 * math.pi * freq * t + mi * math.sin(2 * math.pi * freq * ratio * t))
        out.append(s * e[i])
    return out

def noise(dur, lp=8000, hp=200, a=0.002, d=None, curve=2.2):
    d = d if d is not None else dur
    n = int(dur * SR)
    e = env(n, a, d, curve)
    out = []
    lp_s, hp_s = 0.0, 0.0
    lp_k = min(1.0, 2 * math.pi * lp / SR)
    hp_k = min(1.0, 2 * math.pi * hp / SR)
    for i in range(n):
        w = random.uniform(-1, 1)
        lp_s += lp_k * (w - lp_s)      # 원폴 LP
        hp_s += hp_k * (lp_s - hp_s)   # 원폴 LP → 빼서 HP
        out.append((lp_s - hp_s) * e[i])
    return out

def sweepnoise(dur, f_from, f_to, bw=0.6, a=0.004):
    # 밴드패스 중심이 스윕하는 노이즈 (휘릭!)
    n = int(dur * SR)
    e = env(n, a, dur, 2.6)
    out = []
    lp_s, hp_s = 0.0, 0.0
    for i in range(n):
        t = i / n
        fc = f_from * ((f_to / f_from) ** t)
        lp_k = min(1.0, 2 * math.pi * fc * (1 + bw) / SR)
        hp_k = min(1.0, 2 * math.pi * fc * (1 - bw * 0.7) / SR)
        w = random.uniform(-1, 1)
        lp_s += lp_k * (w - lp_s)
        hp_s += hp_k * (lp_s - hp_s)
        out.append((lp_s - hp_s) * e[i])
    return out

def reverb(buf, mixv=0.22):
    # 짧은 피드백 딜레이 2개 — 값싼 공간감
    out = list(buf) + [0.0] * int(0.25 * SR)
    for dms, g in ((0.029, 0.42), (0.047, 0.3)):
        dn = int(dms * SR)
        for i in range(dn, len(out)):
            out[i] += out[i - dn] * g * mixv
    return out

def softclip(buf, drive=1.4):
    return [math.tanh(v * drive) for v in buf]

def save(name, buf, vol=0.9):
    peak = max(1e-6, max(abs(v) for v in buf))
    scale = vol / peak
    path = os.path.join("public", "audio", "sfx", f"{name}.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, v * scale)) * 32767)) for v in buf))
    print(name, f"{len(buf)/SR:.2f}s")

# ---- 사운드 디자인 ----

# 일반 타격: 저음 썸프 + 살 타격 노이즈 + 어택 클릭
b = render(0.22)
mix(b, osc(0.13, 170, 55, "sine", 0.001, 0.1, 3.5), 0, 1.0)
mix(b, noise(0.09, 2800, 250, 0.001, 0.06, 3.2), 0, 0.75)
mix(b, noise(0.015, 9000, 2500, 0.0005, 0.012, 4), 0, 0.5)
save("hit", softclip(b, 1.8), 0.85)

# 플레이어 피격: 더 낮고 둔탁 + 으르렁대는 미드
b = render(0.3)
mix(b, osc(0.18, 130, 55, "sine", 0.001, 0.14, 3.0), 0, 1.0)
mix(b, osc(0.16, 240, 110, "square", 0.002, 0.12, 3.0), 0.01, 0.22)
mix(b, noise(0.12, 1600, 180, 0.002, 0.09, 3.0), 0, 0.5)
save("hurt", softclip(b, 1.7), 0.8)

# 활 발사: 시위 트왱 + 바람 가르는 스윕
b = render(0.26)
mix(b, osc(0.12, 720, 480, "tri", 0.0008, 0.09, 4.0), 0, 0.6)
mix(b, osc(0.1, 1450, 950, "sine", 0.0008, 0.07, 4.5), 0, 0.3)
mix(b, sweepnoise(0.2, 1800, 5200, 0.5), 0.015, 0.65)
save("arrow", b, 0.8)

# 매직볼트: FM 샤이머 + 공기 노이즈
b = render(0.34)
mix(b, fmbell(0.3, 620, 1.98, 3.2, 0.004), 0, 0.7)
mix(b, osc(0.22, 500, 900, "sine", 0.01, 0.18, 2.6), 0.01, 0.4)
mix(b, noise(0.16, 9000, 3600, 0.01, 0.12, 2.4), 0, 0.3)
save("magic", b, 0.75)

# 스킬 시전: 차오르는 스윕 + 반짝임
b = render(0.42)
mix(b, osc(0.3, 220, 880, "saw", 0.02, 0.26, 2.0), 0, 0.35)
mix(b, osc(0.3, 440, 1760, "sine", 0.02, 0.26, 2.0), 0, 0.25)
for i in range(5):
    mix(b, osc(0.06, 1800 + i * 420, None, "sine", 0.001, 0.05, 4), 0.1 + i * 0.045, 0.2)
save("skill", reverb(b, 0.15), 0.75)

# 띄우기: 급상승 + 챙
b = render(0.32)
mix(b, osc(0.22, 300, 1000, "sine", 0.004, 0.18, 2.2), 0, 0.7)
mix(b, fmbell(0.2, 1320, 3.01, 1.6), 0.08, 0.4)
mix(b, sweepnoise(0.16, 900, 4500, 0.5), 0, 0.35)
save("launch", b, 0.75)

# 대시: 빠른 휘릭
b = render(0.2)
mix(b, sweepnoise(0.18, 700, 4200, 0.55, 0.003), 0, 1.0)
mix(b, osc(0.09, 280, 170, "sine", 0.002, 0.07, 3.5), 0, 0.3)
save("dash", b, 0.7)

# UI: 깔끔한 두 음 블립
b = render(0.12)
mix(b, osc(0.05, 660, None, "sine", 0.002, 0.045, 3.5), 0, 0.8)
mix(b, osc(0.06, 880, None, "sine", 0.002, 0.05, 3.5), 0.045, 0.8)
save("ui", b, 0.6)

# 포션: 보글보글 세 방울 + 꿀꺽
b = render(0.5)
for i, (f, at) in enumerate(((320, 0.0), (420, 0.12), (540, 0.24))):
    mix(b, osc(0.09, f, f * 1.9, "sine", 0.004, 0.07, 3.0), at, 0.7)
mix(b, noise(0.1, 900, 150, 0.01, 0.08, 2.5), 0.33, 0.45)
mix(b, osc(0.1, 180, 120, "sine", 0.01, 0.08, 2.5), 0.33, 0.35)
save("potion", b, 0.75)

# 체크포인트: 따뜻한 벨 아르페지오
b = render(1.0)
for i, f in enumerate((392, 494, 587, 784)):
    mix(b, fmbell(0.55, f, 2.0, 1.6, 0.003, 2.6), i * 0.1, 0.55)
save("checkpoint", reverb(b, 0.3), 0.75)

# 보스 격파 짧은 효과음 (victory 징글과 별개)
b = render(1.1)
for i, f in enumerate((523, 659, 784, 1046)):
    mix(b, fmbell(0.6, f, 2.0, 1.8, 0.002, 2.4), i * 0.09, 0.6)
mix(b, sweepnoise(0.3, 1500, 6000, 0.5), 0, 0.25)
save("win", reverb(b, 0.3), 0.8)

# 사망 짧은 효과음 (death 징글과 별개): 어두운 하강 벨 + 낮은 드론
b = render(1.3)
for i, f in enumerate((440, 349, 262)):
    mix(b, fmbell(0.7, f, 2.76, 2.4, 0.004, 2.2), i * 0.16, 0.5)
mix(b, osc(1.1, 70, 48, "sine", 0.05, 1.0, 1.6), 0.1, 0.5)
save("lose", reverb(b, 0.28), 0.8)

print("DONE")
