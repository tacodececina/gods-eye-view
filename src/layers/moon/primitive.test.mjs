import assert from 'node:assert/strict';
import test from 'node:test';

// Material 'Image' pregunta por tipos DOM al crear sus uniformes; en Node no existen.
for (const name of [
  'HTMLCanvasElement',
  'HTMLImageElement',
  'HTMLVideoElement',
  'ImageBitmap',
  'OffscreenCanvas',
])
  globalThis[name] ??= class {};

const Cesium = await import('cesium');
const {
  MOON_PLACEHOLDER_URI,
  MOON_PRIMITIVE_ID,
  MOON_SLICE_PARTITIONS,
  MOON_STACK_PARTITIONS,
  createMoonPrimitive,
} = await import('./primitive.js');

test('Primitive propio: EllipsoidGeometry(Ellipsoid.MOON) 256×128, textura Image, id eyeinsky-moon', () => {
  const primitive = createMoonPrimitive({ image: MOON_PLACEHOLDER_URI });
  const instance = primitive.geometryInstances;
  assert.equal(instance.id, MOON_PRIMITIVE_ID);
  assert.equal(MOON_PRIMITIVE_ID, 'eyeinsky-moon');
  const geometry = instance.geometry;
  assert.ok(
    Cesium.Cartesian3.equals(geometry._radii, Cesium.Ellipsoid.MOON.radii),
  );
  assert.equal(geometry._slicePartitions, MOON_SLICE_PARTITIONS);
  assert.equal(geometry._stackPartitions, MOON_STACK_PARTITIONS);
  assert.deepEqual([MOON_SLICE_PARTITIONS, MOON_STACK_PARTITIONS], [256, 128]);
  assert.equal(geometry._vertexFormat.st, true, 'coordenadas de textura');
  const { material } = primitive.appearance;
  assert.equal(material.type, 'Image');
  assert.equal(material.uniforms.image, MOON_PLACEHOLDER_URI);
  primitive.destroy();
  material.destroy();
});

test('entra en el test de profundidad, opaca, seleccionable y oculta hasta la primera pose', () => {
  const primitive = createMoonPrimitive({ image: MOON_PLACEHOLDER_URI });
  const { appearance } = primitive;
  assert.equal(appearance.renderState.depthTest.enabled, true);
  assert.equal(appearance.translucent, false);
  assert.equal(primitive.allowPicking, true);
  assert.equal(primitive.show, false);
  assert.equal(primitive.asynchronous, false);
  primitive.destroy();
  appearance.material.destroy();
});

test('Primitive.destroy NO destruye su material: por eso el ciclo de vida lo hace aparte', () => {
  const primitive = createMoonPrimitive({ image: MOON_PLACEHOLDER_URI });
  const { material } = primitive.appearance;
  primitive.destroy();
  assert.equal(material.isDestroyed(), false);
  material.destroy();
  assert.equal(material.isDestroyed(), true);
});

test('la URI del placeholder apunta al PNG generado y versionado', () => {
  assert.equal(MOON_PLACEHOLDER_URI, 'models/moon/placeholder.png');
  assert.throws(() => createMoonPrimitive({}), TypeError);
});

test('iluminación por la luz de escena (Sol, czm_lightDirectionEC), no la luz de cámara de czm_phong', () => {
  const primitive = createMoonPrimitive({ image: MOON_PLACEHOLDER_URI });
  const source = primitive.appearance.fragmentShaderSource;
  assert.match(source, /dot\(normalEC, czm_lightDirectionEC\)/);
  assert.doesNotMatch(source, /czm_phong/);
  assert.match(source, /MOON_AMBIENT/);
  primitive.destroy();
  primitive.appearance.material.destroy();
});
