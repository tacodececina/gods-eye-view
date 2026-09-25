import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  GlbInspectError,
  inspectGlb,
  scaleToRealLength,
} from './eyeinsky-glb-inspect.mjs';

const SCRIPT = fileURLToPath(
  new URL('./eyeinsky-glb-inspect.mjs', import.meta.url),
);

// --- synthetic GLB builder ------------------------------------------------

const pad4 = (buffer, fill) => {
  const extra = (4 - (buffer.length % 4)) % 4;
  return extra ? Buffer.concat([buffer, Buffer.alloc(extra, fill)]) : buffer;
};

/** Minimal PNG: signature + IHDR carrying the given dimensions. */
function pngHeader(width, height) {
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4, 'ascii');
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdr,
  ]);
}

/** Minimal baseline JPEG header: SOI, APP0 stub, SOF0 with dimensions. */
function jpegHeader(width, height) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof.writeUInt8(8, 4);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

/** Minimal extended WebP: RIFF/WEBP + VP8X carrying 24-bit (size - 1) fields. */
function webpHeader(width, height) {
  const out = Buffer.alloc(30);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(22, 4);
  out.write('WEBPVP8X', 8, 'ascii');
  out.writeUInt32LE(10, 16);
  out.writeUIntLE(width - 1, 24, 3);
  out.writeUIntLE(height - 1, 27, 3);
  return out;
}

/**
 * One triangle (0,0,0) (1,0,0) (0,2,1) under child scale [2,3,4] and a parent
 * that rotates 90° about +Z and translates by [10,0,0]. World vertices are
 * (10,0,0) (10,2,0) (4,0,4) → bbox min [4,0,0], max [10,2,4].
 */
function syntheticGltf({ extensionsUsed, images = [] } = {}) {
  const positions = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 2, 1].forEach((v, i) =>
    positions.writeFloatLE(v, i * 4),
  );
  const chunks = [positions, ...images.map((image) => pad4(image, 0))];
  const bufferViews = [];
  let offset = 0;
  for (const [index, chunk] of chunks.entries()) {
    const byteLength = index === 0 ? chunk.length : images[index - 1].length;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength });
    offset += chunk.length;
  }
  const bin = Buffer.concat(chunks);
  const s = Math.SQRT1_2;
  const gltf = {
    asset: { version: '2.0', generator: 'synthetic-test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { children: [1], translation: [10, 0, 0], rotation: [0, 0, s, s] },
      { mesh: 0, scale: [2, 3, 4] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 2, 1],
      },
    ],
    bufferViews,
    buffers: [{ byteLength: bin.length }],
  };
  if (images.length) {
    gltf.images = images.map((image, i) => ({
      bufferView: i + 1,
      mimeType:
        image[0] === 0x89
          ? 'image/png'
          : image[0] === 0x52
            ? 'image/webp'
            : 'image/jpeg',
    }));
    gltf.textures = images.map((_, i) => ({ source: i }));
  }
  if (extensionsUsed) gltf.extensionsUsed = extensionsUsed;
  return { gltf, bin };
}

function encodeGlb({ gltf, bin }, { version = 2 } = {}) {
  const json = pad4(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
  const binChunk = bin ? pad4(bin, 0) : null;
  const total = 12 + 8 + json.length + (binChunk ? 8 + binChunk.length : 0);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(total, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(json.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const parts = [header, jsonHead, json];
  if (binChunk) {
    const binHead = Buffer.alloc(8);
    binHead.writeUInt32LE(binChunk.length, 0);
    binHead.writeUInt32LE(0x004e4942, 4);
    parts.push(binHead, binChunk);
  }
  return Buffer.concat(parts);
}

const close = (actual, expected, label) => {
  for (let i = 0; i < expected.length; i++) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) < 1e-5,
      `${label}[${i}]: ${actual[i]} !== ${expected[i]}`,
    );
  }
};

// --- behaviour ------------------------------------------------------------

test('measures the world bbox of a synthetic triangle through node transforms', () => {
  const report = inspectGlb(encodeGlb(syntheticGltf()));
  assert.equal(report.valid, true);
  assert.equal(report.version, 2);
  assert.equal(report.counts.nodes, 2);
  assert.equal(report.counts.meshes, 1);
  assert.equal(report.counts.primitives, 1);
  assert.equal(report.counts.triangles, 1);
  close(report.bbox.min, [4, 0, 0], 'min');
  close(report.bbox.max, [10, 2, 4], 'max');
  close(report.bbox.size, [6, 2, 4], 'size');
  assert.equal(report.bbox.method, 'vertices');
  assert.ok(Math.abs(report.radius - Math.sqrt(56) / 2) < 1e-5);
  assert.ok(Math.abs(report.longestDimension - 6) < 1e-5);
  assert.equal(report.axes.longest, '+X');
  assert.equal(report.axes.suggestedForwardAxis, '+X');
  assert.equal(report.axes.suggestedUpAxis, '+Y');
  assert.equal(report.axes.ambiguous, false);
  assert.equal(report.axes.gltfConvention.up, '+Y');
  assert.equal(report.textures.count, 0);
  assert.equal(report.textures.maxEdge, 0);
  assert.equal(report.extensions.draco, false);
  assert.equal(report.extensions.ktx2, false);
  assert.equal(report.asset.generator, 'synthetic-test');
  assert.match(report.sha256, /^[0-9a-f]{64}$/);
});

test('reads embedded PNG and JPEG dimensions from their headers', () => {
  const report = inspectGlb(
    encodeGlb(
      syntheticGltf({ images: [pngHeader(256, 128), jpegHeader(300, 1024)] }),
    ),
  );
  assert.equal(report.textures.count, 2);
  assert.equal(report.textures.images, 2);
  assert.equal(report.textures.maxEdge, 1024);
  assert.deepEqual(
    report.textures.dimensions.map(({ width, height, mimeType }) => [
      width,
      height,
      mimeType,
    ]),
    [
      [256, 128, 'image/png'],
      [300, 1024, 'image/jpeg'],
    ],
  );
});

test('reads extended WebP dimensions (EXT_texture_webp sources)', () => {
  const report = inspectGlb(
    encodeGlb(syntheticGltf({ images: [webpHeader(2048, 512)] })),
  );
  assert.equal(report.textures.unknownDimensions, 0);
  assert.equal(report.textures.maxEdge, 2048);
  assert.equal(report.textures.dimensions[0].mimeType, 'image/webp');
  assert.equal(report.textures.dimensions[0].height, 512);
});

test('estimates decoded GPU bytes for geometry and mipmapped RGBA textures', () => {
  const plain = inspectGlb(encodeGlb(syntheticGltf()));
  assert.deepEqual(plain.gpuEstimate, {
    geometryBytes: 36,
    textureBytes: 0,
    totalBytes: 36,
    complete: true,
  });
  const textured = inspectGlb(
    encodeGlb(
      syntheticGltf({ images: [pngHeader(256, 128), jpegHeader(300, 1024)] }),
    ),
  );
  const texels = 256 * 128 + 300 * 1024;
  assert.equal(
    textured.gpuEstimate.textureBytes,
    Math.round((texels * 16) / 3),
  );
  assert.equal(textured.gpuEstimate.complete, true);
});

test('flags Draco and KTX2 compression extensions', () => {
  const report = inspectGlb(
    encodeGlb(
      syntheticGltf({
        extensionsUsed: ['KHR_draco_mesh_compression', 'KHR_texture_basisu'],
      }),
    ),
  );
  assert.equal(report.extensions.draco, true);
  assert.equal(report.extensions.ktx2, true);
  assert.deepEqual(report.extensions.used, [
    'KHR_draco_mesh_compression',
    'KHR_texture_basisu',
  ]);
});

test('computes the scale that makes the longest dimension match reality', () => {
  const report = inspectGlb(encodeGlb(syntheticGltf()));
  const scaled = scaleToRealLength(report, 109);
  assert.ok(Math.abs(scaled.scaleMeters - 109 / 6) < 1e-9);
  assert.ok(Math.abs(scaled.radiusM - (Math.sqrt(56) / 2) * (109 / 6)) < 1e-6);
  assert.throws(() => scaleToRealLength(report, 0), RangeError);
});

test('rejects corrupt or unsupported GLB payloads with a coded error', () => {
  const good = encodeGlb(syntheticGltf());
  const badMagic = Buffer.from(good);
  badMagic.writeUInt32LE(0xdeadbeef, 0);
  const badLength = Buffer.from(good);
  badLength.writeUInt32LE(good.length + 4, 8);
  const badJson = Buffer.from(good);
  badJson.write('}', 20, 'utf8');
  const cases = [
    [Buffer.alloc(0), 'truncated'],
    [good.subarray(0, 30), 'length-mismatch'],
    [badMagic, 'bad-magic'],
    [encodeGlb(syntheticGltf(), { version: 1 }), 'bad-version'],
    [badLength, 'length-mismatch'],
    [badJson, 'bad-json'],
  ];
  for (const [payload, code] of cases) {
    assert.throws(
      () => inspectGlb(payload),
      (error) => error instanceof GlbInspectError && error.code === code,
      `expected ${code}`,
    );
  }
});

test('CLI prints JSON and exits non-zero on a corrupt file', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'glb-inspect-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const good = path.join(dir, 'good.glb');
  const corrupt = path.join(dir, 'corrupt.glb');
  writeFileSync(good, encodeGlb(syntheticGltf()));
  writeFileSync(corrupt, Buffer.from('not a glb at all'));

  const out = JSON.parse(
    execFileSync(process.execPath, [SCRIPT, good], { encoding: 'utf8' }),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].file, good);
  assert.equal(out[0].valid, true);
  assert.equal(out[0].counts.triangles, 1);

  let failure;
  try {
    execFileSync(process.execPath, [SCRIPT, corrupt], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    failure = error;
  }
  assert.ok(failure, 'corrupt file must exit non-zero');
  assert.equal(failure.status, 1);
  const report = JSON.parse(failure.stdout);
  assert.equal(report[0].valid, false);
  assert.equal(report[0].error.code, 'bad-magic');
});

// --- Draco-style geometry (POSITION without a bufferView) -------------------

const DRACO = 'KHR_draco_mesh_compression';

/**
 * The synthetic triangle re-encoded the way Draco GLBs declare it: POSITION
 * and indices accessors keep count/min/max but have no bufferView, and the
 * compressed payload lives in a bufferView referenced only by the primitive's
 * KHR_draco_mesh_compression extension. The bbox is only recoverable from the
 * accessor min/max corners.
 */
function dracoGltf({ min = [0, 0, 0], max = [1, 2, 1] } = {}) {
  const payload = Buffer.alloc(16, 0xab);
  const s = Math.SQRT1_2;
  const gltf = {
    asset: { version: '2.0', generator: 'synthetic-draco-test' },
    extensionsUsed: [DRACO],
    extensionsRequired: [DRACO],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { children: [1], translation: [10, 0, 0], rotation: [0, 0, s, s] },
      { mesh: 0, scale: [2, 3, 4] },
    ],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 0 },
            indices: 1,
            extensions: {
              [DRACO]: { bufferView: 0, attributes: { POSITION: 0 } },
            },
          },
        ],
      },
    ],
    accessors: [
      { componentType: 5126, count: 3, type: 'VEC3', min, max },
      { componentType: 5123, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: payload.length }],
    buffers: [{ byteLength: payload.length }],
  };
  return { gltf, bin: payload };
}

test('measures Draco geometry from the POSITION accessor min/max corners', () => {
  const report = inspectGlb(encodeGlb(dracoGltf()));
  assert.equal(report.bbox.method, 'accessor-corners');
  close(report.bbox.min, [4, 0, 0], 'min');
  close(report.bbox.max, [10, 2, 4], 'max');
  close(report.bbox.size, [6, 2, 4], 'size');
  assert.equal(report.counts.primitives, 1);
  assert.equal(report.counts.triangles, 1);
  assert.equal(report.extensions.draco, true);
  assert.deepEqual(report.extensions.required, [DRACO]);
  // Decoded footprint still counts the drawn accessors (3 VEC3 floats + 3 u16).
  assert.equal(report.gpuEstimate.geometryBytes, 36 + 6);
});

test('a Draco POSITION accessor without min/max yields no geometry', () => {
  const { gltf, bin } = dracoGltf();
  delete gltf.accessors[0].min;
  delete gltf.accessors[0].max;
  assert.throws(
    () => inspectGlb(encodeGlb({ gltf, bin })),
    (error) => error instanceof GlbInspectError && error.code === 'no-geometry',
  );
});

test('inspects the shipped ISS asset through the accessor-corners path', () => {
  const file = fileURLToPath(
    new URL('../public/models/satellites/iss-70d0619a.glb', import.meta.url),
  );
  const report = inspectGlb(readFileSync(file));
  assert.equal(report.counts.triangles, 6642);
  assert.equal(report.counts.primitives, 6);
  assert.ok(report.extensions.required.includes(DRACO));
  assert.equal(report.bbox.method, 'accessor-corners');
  assert.equal(report.sha256.slice(0, 8), '70d0619a');
});

test('rejects chunks that overrun the file or break 4-byte alignment', () => {
  const good = encodeGlb(syntheticGltf());
  const jsonLength = good.readUInt32LE(12);
  const overrun = Buffer.from(good);
  overrun.writeUInt32LE(jsonLength + 4096, 12);
  const misaligned = Buffer.from(good);
  misaligned.writeUInt32LE(jsonLength + 2, 12);
  const truncatedHeader = Buffer.concat([good, Buffer.alloc(4)]);
  truncatedHeader.writeUInt32LE(truncatedHeader.length, 8);
  for (const payload of [overrun, misaligned, truncatedHeader]) {
    assert.throws(
      () => inspectGlb(payload),
      (error) => error instanceof GlbInspectError && error.code === 'bad-chunk',
    );
  }
});

// --- CLI error reporting ----------------------------------------------------

function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return { status: error.status, stdout: error.stdout, stderr: error.stderr };
  }
}

test('CLI reports a zero-extent model under --real-length-m as scale-error', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'glb-inspect-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const point = path.join(dir, 'point.glb');
  writeFileSync(
    point,
    encodeGlb(dracoGltf({ min: [1, 1, 1], max: [1, 1, 1] })),
  );

  const result = runCli(['--real-length-m=10', point]);
  assert.equal(result.status, 1);
  const [report] = JSON.parse(result.stdout);
  assert.equal(report.valid, false);
  assert.equal(report.error.code, 'scale-error');
});

test('CLI rejects unknown flags with a usage error', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'glb-inspect-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const good = path.join(dir, 'good.glb');
  writeFileSync(good, encodeGlb(syntheticGltf()));

  for (const flag of ['--bogus', '--real-length-m', '--real-length=5']) {
    const result = runCli([flag, good]);
    assert.equal(result.status, 2, `${flag} must be a usage error`);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Unknown option|Usage/);
  }
});
