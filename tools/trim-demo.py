"""Turns the raw demo recording into public/demo/how-to-play.mp4.

Cuts every still stretch down to its first moment, so the menu while the game loads
and any pause in the recording script never look like a frozen video.
Needs: pip install imageio-ffmpeg
Run: python tools/trim-demo.py
"""
import re
import subprocess
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SRC = 'tools/shots/demo/demo.webm'
OUT = 'public/demo/how-to-play.mp4'
KEEP = 0.8  # seconds of each still stretch to leave in

# Detect on a small, slightly blurred copy so compression noise in the raw
# recording doesn't make a still screen look like it's moving.
probe = subprocess.run(
    [FFMPEG, '-hide_banner', '-i', SRC, '-vf', 'scale=320:180,gblur=sigma=1.5,freezedetect=n=0.004:d=1.2',
     '-an', '-f', 'null', '-'],
    capture_output=True, text=True,
).stderr
starts = [float(x) for x in re.findall(r'freeze_start: ([\d.]+)', probe)]
ends = [float(x) for x in re.findall(r'freeze_end: ([\d.]+)', probe)]
ends += [1e9] * (len(starts) - len(ends))  # a freeze that runs to the end of the file

# The first still stretch is the menu while assets load: drop all of it but its last moment.
cuts = []
for i, (a, b) in enumerate(zip(starts, ends)):
    if i == 0 and a < 4:  # the blank page and menu at the very start
        cuts.append((0, max(0, b - KEEP)))
    elif b > 1e8:  # the clear screen at the end: leave time to read it
        cuts.append((a + 2.5, b))
    else:
        cuts.append((a + KEEP, b))
expr = '+'.join(f'between(t,{a:.2f},{b:.2f})' for a, b in cuts) or '0'
print('cut', ', '.join(f'{a:.1f}-{min(b, 999):.1f}s' for a, b in cuts))

subprocess.run([
    FFMPEG, '-hide_banner', '-y', '-loglevel', 'error', '-i', SRC,
    '-vf', f"select='not({expr})',setpts=N/24/TB,scale=960:540",
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '25', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', OUT,
], check=True)

info = subprocess.run([FFMPEG, '-hide_banner', '-i', OUT], capture_output=True, text=True).stderr
print(re.search(r'Duration: [\d:.]+', info).group(0))
left = subprocess.run(
    [FFMPEG, '-hide_banner', '-i', OUT, '-vf', 'freezedetect=n=0.002:d=1.5', '-an', '-f', 'null', '-'],
    capture_output=True, text=True,
).stderr
print('still stretches over 1.5s left:', len(re.findall('freeze_start', left)))
