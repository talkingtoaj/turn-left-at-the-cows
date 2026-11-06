"""Look test: bake the Poly Haven sky HDRI into what the game loads.

    ffmpeg -i sky.hdr -f rawvideo -pix_fmt gbrpf32le sky.raw
    uv run --with numpy --with pillow python -I tools/look/bake_sky.py sky.raw 2048 1024 public/look

Writes:
  sky.webp  upper half of the sky (horizon to zenith), turned so the sun sits
            where the game's sun is, sRGB, scaled by `bgMax`.
  sky.json  { sh: 9 x [r,g,b] spherical harmonics of the sky light (no sun,
            no ground), sun: [r,g,b] sun irradiance, horizon: [r,g,b] radiance
            at the horizon (for fog), bgMax }. All in units where the sky alone
            lights an upward face like a uniform sky of radiance 1.

Directions follow three.js equirect maps: u = atan2(z, x) / 2pi + 0.5,
v = asin(y) / pi + 0.5, y up, -z north.
"""
import json
import math
import sys

import numpy as np
from PIL import Image

SUN_AZ = 112.0  # src3/world3d/world3d.js
SUN_EL = 30.0

raw, W, H, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
g, b, r = np.fromfile(raw, dtype='<f4').reshape(3, H, W)
img = np.stack([r, g, b], axis=-1).astype(np.float64)
img = np.nan_to_num(np.maximum(img, 0))

# Pixel directions (row 0 is the top of the image, v = 1).
u = (np.arange(W) + 0.5) / W
v = 1 - (np.arange(H) + 0.5) / H
phi = (u - 0.5) * 2 * math.pi
el = (v - 0.5) * math.pi
PHI, EL = np.meshgrid(phi, el)
dx = np.cos(EL) * np.cos(PHI)
dy = np.sin(EL)
dz = np.cos(EL) * np.sin(PHI)
d_omega = (2 * math.pi / W) * (math.pi / H) * np.cos(EL)

lum = img @ np.array([0.2126, 0.7152, 0.0722])
sky = dy > 0
# Sun: the brightest spot; its pixels are anything far brighter than the sky.
j, i = np.unravel_index(np.argmax(np.where(sky, lum, 0)), lum.shape)
sun_phi, sun_el = phi[i], el[j]
med = np.median(lum[sky])
thresh = med * 12
excess = np.where(((lum > thresh) & sky)[..., None], img - img * (thresh / np.maximum(lum, 1e-9))[..., None], 0)
clamped = img - excess
sun_e = (excess * d_omega[..., None]).sum(axis=(0, 1))

# Turn the sky about the vertical so its sun sits at the game's sun azimuth.
az = math.radians(SUN_AZ)
tx, tz = math.sin(az), -math.cos(az)
target_phi = math.atan2(tz, tx)
shift = int(round((target_phi - sun_phi) / (2 * math.pi) * W)) % W
clamped = np.roll(clamped, shift, axis=1)

# Spherical harmonics (three.js SphericalHarmonics3 basis and order) of the sky
# half only; the ground's light is added in the game.
L = np.where(sky[..., None], clamped, 0)
basis = [
    0.282095 * np.ones_like(dx),
    0.488603 * dy,
    0.488603 * dz,
    0.488603 * dx,
    1.092548 * dx * dy,
    1.092548 * dy * dz,
    0.315392 * (3 * dz * dz - 1),
    1.092548 * dx * dz,
    0.546274 * (dx * dx - dy * dy),
]
sh = np.array([(L * (bf * d_omega)[..., None]).sum(axis=(0, 1)) for bf in basis])
# Irradiance on an upward face (three.js shGetIrradianceAt with n = +y).
e_up = 0.886227 * sh[0] + 2.0 * 0.511664 * sh[1] - 0.247708 * sh[6] - 0.429043 * sh[8]
k = math.pi / float(e_up @ np.array([0.2126, 0.7152, 0.0722]))
sh *= k
sun_e *= k
Ls = clamped * k

# Horizon radiance: the band from 0 to 3 degrees up.
band = (EL > 0) & (EL < math.radians(3))
horizon = Ls[band].mean(axis=0)

# Background: the upper half, scaled so the bright sky (not the sun) is near 1.
top = Ls[: H // 2]
bg_max = float(np.percentile(top @ np.array([0.2126, 0.7152, 0.0722]), 99.7))
x = np.clip(top / bg_max, 0, 1)
srgb = np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)
Image.fromarray((srgb * 255 + 0.5).astype(np.uint8)).save(f'{out}/sky.webp', quality=88, method=6)

info = {
    'source': 'kloofendal_38d_partly_cloudy_puresky (Poly Haven, CC0)',
    'sh': [[round(float(c), 5) for c in row] for row in sh],
    'sun': [round(float(c), 4) for c in sun_e],
    'horizon': [round(float(c), 5) for c in horizon],
    'bgMax': round(bg_max, 5),
    'sunElevationInHdri': round(math.degrees(sun_el), 1),
    'turnedBy': round(shift / W * 360, 1),
}
with open(f'{out}/sky.json', 'w') as f:
    json.dump(info, f, indent=1)
print(json.dumps(info))
