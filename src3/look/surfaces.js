// Look test (default look): which texture each part of the world gets.
// Static world pieces are merged into big vertex-coloured meshes, so a piece's
// surface is found from its colour (and whether it lies on the ground). The
// texture only adds detail: the piece keeps its own colour.
//
// tools/look/colors.mjs lists every colour in the world and what it maps to.

// Texture layers, in the order they sit in the texture arrays. Files are in
// public/look/tex (normal map: <name>_n.webp). strength: how much of the
// texture's light and dark shows; chroma: how much of its colour shifts show.
export const TEXTURES = [
  { name: 'grass', strength: 0.9, chroma: 0.5, normal: true },
  { name: 'soil', strength: 0.9, chroma: 0.4, normal: true },
  { name: 'dirt', strength: 0.8, chroma: 0.3, normal: true },
  { name: 'gravel', strength: 0.9, chroma: 0.2, normal: true },
  { name: 'asphalt', strength: 1.0, chroma: 0.0, normal: true },
  { name: 'bark', strength: 1.0, chroma: 0.3, normal: true },
  { name: 'planks', strength: 1.0, chroma: 0.3, normal: true },
  { name: 'siding', strength: 1.0, chroma: 0.0, normal: true },
  { name: 'tin', strength: 0.9, chroma: 0.0, normal: true },
  { name: 'shingles', strength: 1.0, chroma: 0.2, normal: true },
  { name: 'brick', strength: 1.0, chroma: 0.6, normal: true },
  { name: 'concrete', strength: 1.0, chroma: 0.0, normal: true },
  { name: 'rust', strength: 1.0, chroma: 1.0, normal: false }, // AI made, see SOURCES.md
];
const T = Object.fromEntries(TEXTURES.map((t, i) => [t.name, i]));

// Surfaces: id (index here, 0 = plain) -> texture layer, metres per tile
// [along, up], swap (turn the texture a quarter), normal map strength.
export const LAYERS = [
  null,
  { name: 'grass', tex: T.grass, scale: [2.5, 2.5], normal: 0.8 },
  { name: 'soil', tex: T.soil, scale: [2.5, 2.5], normal: 0.8 },
  { name: 'dirt road', tex: T.dirt, scale: [3, 3], normal: 0.9 },
  { name: 'gravel', tex: T.gravel, scale: [2, 2], normal: 0.9 },
  { name: 'asphalt', tex: T.asphalt, scale: [3, 3], normal: 0.6 },
  { name: 'bark', tex: T.bark, scale: [1.2, 1.6], normal: 1 },
  { name: 'boards', tex: T.planks, scale: [2.4, 2.4], normal: 1 },
  { name: 'upright boards', tex: T.planks, scale: [3, 3], swap: true, normal: 1 },
  { name: 'siding', tex: T.siding, scale: [2, 2], normal: 1 },
  { name: 'tin', tex: T.tin, scale: [1.6, 1.6], normal: 1 },
  { name: 'shingles', tex: T.shingles, scale: [2, 2], normal: 1 },
  { name: 'brick', tex: T.brick, scale: [2, 1], normal: 1 },
  { name: 'concrete', tex: T.concrete, scale: [3, 1.5], normal: 0.7 },
  { name: 'rusty paint', tex: T.rust, scale: [3, 3], normal: 0 },
  { name: 'logs', tex: T.bark, scale: [1.6, 1.2], swap: true, normal: 1 },
];
export const SURF = Object.fromEntries(LAYERS.map((l, i) => [l ? l.name : 'plain', i]));

// Colours (from the world builders) for pieces on the ground (roads, pads).
const GROUND = {
  'dirt road': [0xb0966a, 0x9a8157, 0xbda275, 0xad9367, 0xa68c61, 0xa98f63, 0xa08a64, 0xa48f6a],
  gravel: [0x8c8a82, 0xa29d92],
  concrete: [0xb3b0a8],
  asphalt: [0x66676a, 0xd8d8d0, 0xe6d690],
};
// Colours for standing things.
const STANDING = {
  boards: [0x6a5238, 0x5a4630, 0x8a6c4a, 0x5b4632, 0x4d3b2a, 0x8a6a45, 0x6a4c2e, 0x4a3420, 0x5a4029,
    0x3a2c20, 0x6e5234, 0x7a5a3a, 0x4a3a28, 0x5e4630, 0x7a5d3e, 0x4f3a26, 0x3a2a20, 0x3a2a1a, 0x5b3a2a, 0x4a3420],
  logs: [0x7a5536, 0x6a4a2e],
  'upright boards': [0xa8352b, 0x8c2a22, 0xa3392c, 0x7d2a21],
  siding: [0xe8e2d0, 0xf1ede4, 0xe6d9a8, 0xc9d3d6, 0xd9b9a0, 0xcfd8c4, 0xd8c9a3, 0xeceae3, 0xf0ece2, 0xd8cfb8, 0xf0eee6],
  tin: [0x6a6f72, 0x5a5f66, 0x5d6066, 0x9aa0a3, 0x6f7477, 0x7f8588, 0x8a8c8f, 0x6f6c66],
  shingles: [0x8e4b3a, 0x6b4a3a, 0x4f6a5a, 0x7a3b3b, 0x6e6a60, 0x4f4a3f, 0x55585e, 0x4b4e55],
  brick: [0x7b5a4a, 0xc9b28f, 0xb84a3a],
  concrete: [0x9a958a, 0xa9a69c, 0xb9b2a2, 0x8a847a, 0x7a7166, 0xe4ded0, 0x8a7a62, 0x6f6d68, 0xb8b0a0,
    0x9c9480, 0x8a8984, 0xb9b6ae, 0x9a9890, 0xb0a994, 0x7d776a, 0x9b9a94,
    0x7f7b74, 0xa39e93, 0x8e8a82, 0x9a968c, 0x7d786f, 0x5e574e, 0x7d756a, 0x86807a, 0x8a8170, 0x77766f], // incl. rocks
  soil: [0x84643f], // ploughed rows
  'rusty paint': [0x7f9aa6, 0x93aebb, 0xb7cdd6, 0x6c8693, 0xbfc1bc, 0x8f918e, 0x9ea3a6, 0x5d6468, 0x4b4f52],
};

function table(groups) {
  const out = [];
  for (const [name, list] of Object.entries(groups)) for (const hex of list) out.push([hex, SURF[name]]);
  return out;
}
const TABLES = { ground: table(GROUND), standing: table(STANDING) };
const cache = { ground: new Map(), standing: new Map() };

// Surface id for a piece's colour. Colours read back from vertex colours can
// be off by one step, so near matches count.
export function surfaceOf(hex, onGround) {
  const k = onGround ? 'ground' : 'standing';
  const c = cache[k];
  let s = c.get(hex);
  if (s !== undefined) return s;
  s = 0;
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  for (const [h, id] of TABLES[k]) {
    if (Math.abs(((h >> 16) & 255) - r) <= 2 && Math.abs(((h >> 8) & 255) - g) <= 2 && Math.abs((h & 255) - b) <= 2) {
      s = id;
      break;
    }
  }
  c.set(hex, s);
  return s;
}
