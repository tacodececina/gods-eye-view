#!/usr/bin/env node
// Dependency-free inspector for binary glTF 2.0 (.glb) assets.
//
// Usage: node scripts/eyeinsky-glb-inspect.mjs [--real-length-m=<m>] <file.glb>...
// Prints a JSON array (one report per file) and exits 1 if any file is invalid
// (error codes: inspector codes, `scale-error`, `read-error`). Unknown or
// malformed options are a usage error: nothing on stdout, exit 2.
// Measures structure, triangle/primitive/texture budget, compression extensions,
// the scene-space bounding box with node transforms applied, and a bbox-based
// axis suggestion. It never modifies the input.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'
const HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const FLOAT = 5126;
const AXIS_NAMES = ['X', 'Y', 'Z'];
/** Extents closer than this relative gap make the axis suggestion ambiguous. */
const AXIS_AMBIGUITY_RATIO = 0.1;
const MAX_NODE_DEPTH = 256;
const COMPONENT_BYTES = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
};
const TYPE_COMPONENTS = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};
/** RGBA8 texel bytes times the 4/3 full mip chain factor. */
const MIPMAPPED_RGBA_BYTES_PER_TEXEL = 16 / 3;

export class GlbInspectError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GlbInspectError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new GlbInspectError(code, message);
};

/** Validate the GLB container and return its parsed JSON and optional BIN chunk. */
function parseContainer(buffer) {
  if (buffer.length < HEADER_BYTES) fail('truncated', 'Shorter than a header');
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) fail('bad-magic', 'Not a GLB');
  const version = buffer.readUInt32LE(4);
  if (version !== 2) fail('bad-version', `Unsupported GLB version ${version}`);
  const declared = buffer.readUInt32LE(8);
  if (declared !== buffer.length) {
    fail('length-mismatch', `Header ${declared} B, file ${buffer.length} B`);
  }
  const chunks = [];
  let offset = HEADER_BYTES;
  while (offset < buffer.length) {
    if (offset + CHUNK_HEADER_BYTES > buffer.length) {
      fail('bad-chunk', 'Truncated chunk header');
    }
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const start = offset + CHUNK_HEADER_BYTES;
    if (length % 4 !== 0 || start + length > buffer.length) {
      fail('bad-chunk', `Chunk at ${offset} is misaligned or out of bounds`);
    }
    chunks.push({ type, data: buffer.subarray(start, start + length) });
    offset = start + length;
  }
  if (!chunks.length) fail('truncated', 'No chunks');
  if (chunks[0].type !== CHUNK_JSON) {
    fail('missing-json-chunk', 'First chunk is not JSON');
  }
  let json;
  try {
    json = JSON.parse(chunks[0].data.toString('utf8'));
  } catch (error) {
    fail('bad-json', `JSON chunk does not parse: ${error.message}`);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    fail('bad-json', 'JSON chunk is not an object');
  }
  if (!/^2\./.test(String(json.asset?.version ?? ''))) {
    fail('bad-asset-version', 'asset.version must be 2.x');
  }
  const bin = chunks[1]?.type === CHUNK_BIN ? chunks[1].data : null;
  return { version, json, bin };
}

function at(list, index, kind) {
  const item = Array.isArray(list) ? list[index] : undefined;
  if (!Number.isInteger(index) || !item) {
    fail('bad-reference', `Missing ${kind} ${index}`);
  }
  return item;
}

// --- column-major 4x4 matrices (glTF layout) -------------------------------

const IDENTITY = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}

function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return node.matrix;
  }
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  // prettier-ignore
  const rotation = [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
  // prettier-ignore
  const translation = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
  // prettier-ignore
  const scale = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1];
  return multiply(translation, multiply(rotation, scale));
}

const transformPoint = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

// --- geometry ----------------------------------------------------------------

/** Float VEC3 positions stored in the GLB BIN chunk, or null when not readable. */
function readPositions(gltf, bin, accessor) {
  if (
    !bin ||
    accessor.sparse ||
    accessor.componentType !== FLOAT ||
    accessor.type !== 'VEC3' ||
    !Number.isInteger(accessor.bufferView)
  )
    return null;
  const view = at(gltf.bufferViews, accessor.bufferView, 'bufferView');
  const buffer = at(gltf.buffers, view.buffer, 'buffer');
  if (buffer.uri !== undefined) return null;
  const stride = view.byteStride || 12;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const end = base + stride * (accessor.count - 1) + 12;
  if (accessor.count < 1 || end > bin.length) {
    fail('bad-reference', 'POSITION accessor exceeds the BIN chunk');
  }
  return { base, stride, count: accessor.count };
}

function primitiveTriangles(gltf, primitive) {
  const counted = Number.isInteger(primitive.indices)
    ? at(gltf.accessors, primitive.indices, 'accessor')
    : at(gltf.accessors, primitive.attributes?.POSITION, 'accessor');
  const n = counted.count || 0;
  const mode = primitive.mode ?? 4;
  if (mode === 4) return Math.floor(n / 3);
  if (mode === 5 || mode === 6) return Math.max(n - 2, 0);
  return 0;
}

function sceneRoots(gltf) {
  const scenes = gltf.scenes || [];
  if (scenes.length) return at(scenes, gltf.scene ?? 0, 'scene').nodes || [];
  const children = new Set((gltf.nodes || []).flatMap((n) => n.children || []));
  return (gltf.nodes || []).map((_, i) => i).filter((i) => !children.has(i));
}

const EMPTY_BOUNDS = Object.freeze({
  min: Object.freeze([Infinity, Infinity, Infinity]),
  max: Object.freeze([-Infinity, -Infinity, -Infinity]),
});

/** Smallest box holding `bounds` and `point` (new arrays; inputs untouched). */
function extendBounds(bounds, point) {
  return {
    min: bounds.min.map((v, a) => (point[a] < v ? point[a] : v)),
    max: bounds.max.map((v, a) => (point[a] > v ? point[a] : v)),
  };
}

/** Every vertex of a BIN-backed POSITION accessor, in scene space. */
function vertexPoints(bin, positions, matrix) {
  return Array.from({ length: positions.count }, (_, i) => {
    const o = positions.base + i * positions.stride;
    return transformPoint(
      matrix,
      bin.readFloatLE(o),
      bin.readFloatLE(o + 4),
      bin.readFloatLE(o + 8),
    );
  });
}

/** The 8 corners of an accessor's min/max box, in scene space. */
function cornerPoints(accessor, matrix) {
  return Array.from({ length: 8 }, (_, i) => {
    const pick = (bit, axis) =>
      i & bit ? accessor.max[axis] : accessor.min[axis];
    return transformPoint(matrix, pick(1, 0), pick(2, 1), pick(4, 2));
  });
}

/**
 * Scene-space points of one drawn primitive and how they were obtained:
 * real vertices when the BIN chunk holds float VEC3 positions, otherwise the
 * accessor min/max corners (Draco and other undecodable geometry), or none.
 */
function primitivePoints(gltf, bin, primitive, matrix) {
  const accessor = at(
    gltf.accessors,
    primitive.attributes?.POSITION,
    'POSITION accessor',
  );
  const positions = readPositions(gltf, bin, accessor);
  if (positions) {
    return { method: 'vertices', points: vertexPoints(bin, positions, matrix) };
  }
  if (!accessor.min || !accessor.max) return { method: null, points: [] };
  return { method: 'accessor-corners', points: cornerPoints(accessor, matrix) };
}

/** Accessor indices a primitive draws (attributes plus optional indices). */
function primitiveAccessors(primitive) {
  const attributes = Object.values(primitive.attributes || {});
  return Number.isInteger(primitive.indices)
    ? [...attributes, primitive.indices]
    : attributes;
}

/** Every drawn primitive under a node, paired with its world matrix. */
function visitNode(gltf, index, parent, depth) {
  if (depth > MAX_NODE_DEPTH) {
    fail('bad-reference', 'Node hierarchy too deep or cyclic');
  }
  const node = at(gltf.nodes, index, 'node');
  const matrix = multiply(parent, nodeMatrix(node));
  const own =
    node.mesh === undefined
      ? []
      : (at(gltf.meshes, node.mesh, 'mesh').primitives || []).map(
          (primitive) => ({ primitive, matrix }),
        );
  const nested = (node.children || []).flatMap((child) =>
    visitNode(gltf, child, matrix, depth + 1),
  );
  return [...own, ...nested];
}

/** Fold one drawn primitive into the running scene measurement. */
function accumulatePrimitive(gltf, bin, totals, { primitive, matrix }) {
  // Triangles first: a broken reference reports the same error as before.
  const triangles = totals.triangles + primitiveTriangles(gltf, primitive);
  const { method, points } = primitivePoints(gltf, bin, primitive, matrix);
  return {
    bounds: points.reduce(extendBounds, totals.bounds),
    methods: method ? new Set([...totals.methods, method]) : totals.methods,
    accessors: new Set([...totals.accessors, ...primitiveAccessors(primitive)]),
    primitives: totals.primitives + 1,
    triangles,
  };
}

/** Walk the default scene, accumulating world bounds and drawn primitives. */
function measureScene(gltf, bin) {
  const draws = sceneRoots(gltf).flatMap((root) =>
    visitNode(gltf, root, IDENTITY, 0),
  );
  const totals = draws.reduce(
    (acc, draw) => accumulatePrimitive(gltf, bin, acc, draw),
    {
      bounds: EMPTY_BOUNDS,
      methods: new Set(),
      accessors: new Set(),
      primitives: 0,
      triangles: 0,
    },
  );
  const { min, max } = totals.bounds;
  if (!Number.isFinite(min[0])) {
    fail('no-geometry', 'No POSITION data in the scene');
  }
  const method = totals.methods.size === 1 ? [...totals.methods][0] : 'mixed';
  const { primitives, triangles, accessors } = totals;
  return { min, max, method, primitives, triangles, accessors };
}

// --- textures ----------------------------------------------------------------

/** WebP canvas size from its VP8X, lossy VP8 or lossless VP8L header. */
function webpDimensions(bytes) {
  if (
    bytes.length < 30 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  )
    return null;
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

function imageDimensions(bytes) {
  const webp = webpDimensions(bytes);
  if (webp) return webp;
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const isSof =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSof) {
        return {
          width: bytes.readUInt16BE(offset + 7),
          height: bytes.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
  }
  return null;
}

function imageBytes(gltf, bin, image) {
  if (Number.isInteger(image.bufferView)) {
    const view = at(gltf.bufferViews, image.bufferView, 'bufferView');
    const start = view.byteOffset || 0;
    if (!bin || start + view.byteLength > bin.length) return null;
    return bin.subarray(start, start + view.byteLength);
  }
  const match = /^data:[^;,]*;base64,(.*)$/.exec(image.uri || '');
  return match ? Buffer.from(match[1], 'base64') : null;
}

function measureTextures(gltf, bin) {
  const dimensions = (gltf.images || []).map((image, index) => {
    const bytes = imageBytes(gltf, bin, image);
    const size = bytes ? imageDimensions(bytes) : null;
    return {
      index,
      mimeType: image.mimeType || null,
      embedded: Boolean(bytes),
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  });
  const edges = dimensions.flatMap((d) => (d.width ? [d.width, d.height] : []));
  return {
    count: (gltf.textures || []).length,
    images: dimensions.length,
    maxEdge: edges.length ? Math.max(...edges) : 0,
    unknownDimensions: dimensions.filter((d) => d.width === null).length,
    dimensions,
  };
}

/** Decoded (uncompressed) GPU footprint: drawn accessors plus mipmapped textures. */
function estimateGpuBytes(gltf, accessors, textures) {
  let geometryBytes = 0;
  for (const index of accessors) {
    const accessor = at(gltf.accessors, index, 'accessor');
    const components = TYPE_COMPONENTS[accessor.type] || 0;
    geometryBytes +=
      (accessor.count || 0) *
      components *
      (COMPONENT_BYTES[accessor.componentType] || 0);
  }
  const sources = new Set(
    (gltf.textures || [])
      .map((t) => t.source ?? t.extensions?.EXT_texture_webp?.source)
      .filter(Number.isInteger),
  );
  let texels = 0;
  let complete = true;
  for (const source of sources) {
    const size = textures.dimensions[source];
    if (!size?.width) complete = false;
    else texels += size.width * size.height;
  }
  const textureBytes = Math.round(texels * MIPMAPPED_RGBA_BYTES_PER_TEXEL);
  return {
    geometryBytes,
    textureBytes,
    totalBytes: geometryBytes + textureBytes,
    complete,
  };
}

// --- axes ----------------------------------------------------------------------

function suggestAxes(size) {
  const order = [0, 1, 2].sort((a, b) => size[a] - size[b]);
  const [thin, middle, long] = order.map((i) => size[i]);
  const near = (a, b) => b > 0 && (b - a) / b < AXIS_AMBIGUITY_RATIO;
  return {
    longest: `+${AXIS_NAMES[order[2]]}`,
    thinnest: `+${AXIS_NAMES[order[0]]}`,
    suggestedForwardAxis: `+${AXIS_NAMES[order[2]]}`,
    suggestedUpAxis: `+${AXIS_NAMES[order[0]]}`,
    ambiguous: near(thin, middle) || near(middle, long),
    method: 'bbox: forward = longest extent, up = thinnest extent (heuristic)',
    gltfConvention: { up: '+Y', forward: '+Z' },
  };
}

// --- public API ----------------------------------------------------------------

/** Inspect a GLB buffer. Throws GlbInspectError on invalid input. */
export function inspectGlb(buffer) {
  if (!Buffer.isBuffer(buffer)) fail('bad-input', 'Expected a Buffer');
  const { version, json: gltf, bin } = parseContainer(buffer);
  const scene = measureScene(gltf, bin);
  const textures = measureTextures(gltf, bin);
  const size = scene.max.map((v, i) => v - scene.min[i]);
  const used = [...(gltf.extensionsUsed || [])];
  return {
    valid: true,
    version,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    asset: {
      version: gltf.asset.version,
      generator: gltf.asset.generator ?? null,
      copyright: gltf.asset.copyright ?? null,
    },
    counts: {
      nodes: (gltf.nodes || []).length,
      meshes: (gltf.meshes || []).length,
      meshPrimitives: (gltf.meshes || []).reduce(
        (n, m) => n + (m.primitives || []).length,
        0,
      ),
      primitives: scene.primitives,
      triangles: scene.triangles,
      materials: (gltf.materials || []).length,
    },
    textures,
    gpuEstimate: estimateGpuBytes(gltf, scene.accessors, textures),
    extensions: {
      used,
      required: [...(gltf.extensionsRequired || [])],
      draco: used.includes('KHR_draco_mesh_compression'),
      ktx2: used.includes('KHR_texture_basisu'),
      meshopt: used.includes('EXT_meshopt_compression'),
    },
    bbox: { min: scene.min, max: scene.max, size, method: scene.method },
    radius: Math.hypot(...size) / 2,
    longestDimension: Math.max(...size),
    axes: suggestAxes(size),
  };
}

/** Uniform scale that makes the model's longest dimension equal realLengthM. */
export function scaleToRealLength(report, realLengthM) {
  if (!(realLengthM > 0) || !(report.longestDimension > 0)) {
    throw new RangeError('Real and model lengths must be positive');
  }
  const scaleMeters = realLengthM / report.longestDimension;
  return { scaleMeters, radiusM: report.radius * scaleMeters, realLengthM };
}

/** Stable report code: inspector codes, scale failures, then I/O and the rest. */
function errorCode(error) {
  if (error instanceof GlbInspectError) return error.code;
  if (error instanceof RangeError) return 'scale-error';
  return 'read-error';
}

function inspectFile(file, realLengthM) {
  try {
    const report = { file, ...inspectGlb(readFileSync(file)) };
    return realLengthM
      ? { ...report, real: scaleToRealLength(report, realLengthM) }
      : report;
  } catch (error) {
    return {
      file,
      valid: false,
      error: { code: errorCode(error), message: error.message },
    };
  }
}

const USAGE =
  'Usage: eyeinsky-glb-inspect.mjs [--real-length-m=<m>] <file.glb>...\n';
const REAL_LENGTH_FLAG = '--real-length-m=';

/** Parse argv into files and an optional positive real length, or an error. */
function parseArgs(argv) {
  const options = argv.filter((a) => a.startsWith('--'));
  const files = argv.filter((a) => !a.startsWith('--'));
  const unknown = options.filter((a) => !a.startsWith(REAL_LENGTH_FLAG));
  if (unknown.length) return { error: `Unknown option: ${unknown.join(', ')}` };
  if (options.length > 1) return { error: 'Repeated --real-length-m' };
  const realLengthM = options.length
    ? Number(options[0].slice(REAL_LENGTH_FLAG.length))
    : undefined;
  if (options.length && !(realLengthM > 0)) {
    return { error: '--real-length-m must be a positive number of metres' };
  }
  if (!files.length) return { error: 'No input files' };
  return { files, realLengthM };
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.error) {
    process.stderr.write(`${args.error}\n${USAGE}`);
    return 2;
  }
  const reports = args.files.map((file) => inspectFile(file, args.realLengthM));
  process.stdout.write(`${JSON.stringify(reports, null, 2)}
`);
  return reports.every((r) => r.valid) ? 0 : 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}
