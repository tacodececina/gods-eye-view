import * as Cesium from 'cesium';

/**
 * Luna 3D propia (P5 T6): un `Primitive` con EllipsoidGeometry del radio IAU
 * de la Luna (Ellipsoid.MOON), 256×128, y `MaterialAppearance` con material
 * Image. Opaca, en el test de profundidad (la Tierra la oculta), seleccionable
 * con id 'eyeinsky-moon'. La pose (modelMatrix) la escribe el host en
 * `scene.preUpdate`; hasta la primera pose no se muestra (nunca un fotograma
 * en el centro de la Tierra). La corrección de textura s=0 va en pose.js.
 *
 * Primitive.destroy() NO destruye `appearance.material` (fuga medida:
 * scene-perf/result3-leak.json); lo destruye lifecycle.js.
 *
 * Luz: el sombreado por defecto de MaterialAppearance (czm_phong) ilumina el
 * difuso con luces FIJAS en la cámara (phong.glsl) y solo el especular con la
 * luz de escena: la fase no saldría del Sol. Este sombreador usa Lambert con
 * `czm_lightDirectionEC` (SunLight con el reloj de escena y el marco XYS) y
 * un ambiente pequeño (MOON_AMBIENT, luz cenicienta aproximada, no medida).
 */

export const MOON_PRIMITIVE_ID = 'eyeinsky-moon';
/** Placeholder gris rotulado (scripts/eyeinsky-moon-placeholder.mjs). */
export const MOON_PLACEHOLDER_URI = 'models/moon/placeholder.png';
export const MOON_SLICE_PARTITIONS = 256;
export const MOON_STACK_PARTITIONS = 128;

const TEXTURED = Cesium.MaterialAppearance.MaterialSupport.TEXTURED;

/** Lambert con la luz de escena (Sol) + ambiente pequeño; sin especular. */
export const MOON_FRAGMENT_SHADER = `
const float MOON_AMBIENT = 0.04;
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec2 v_st;

void main()
{
    vec3 normalEC = normalize(v_normalEC);
    czm_materialInput materialInput;
    materialInput.normalEC = normalEC;
    materialInput.positionToEyeEC = -v_positionEC;
    materialInput.st = v_st;
    czm_material material = czm_getMaterial(materialInput);
    float lambert = max(dot(normalEC, czm_lightDirectionEC), 0.0);
    out_FragColor = vec4(material.diffuse * (MOON_AMBIENT + lambert), 1.0);
}
`;

/**
 * @param {{image: string|HTMLCanvasElement|HTMLImageElement}} options
 * @returns {Cesium.Primitive}
 */
export function createMoonPrimitive({ image } = {}) {
  if (!image) throw new TypeError('La Luna necesita una imagen de textura');
  const primitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      id: MOON_PRIMITIVE_ID,
      geometry: new Cesium.EllipsoidGeometry({
        radii: Cesium.Ellipsoid.MOON.radii,
        slicePartitions: MOON_SLICE_PARTITIONS,
        stackPartitions: MOON_STACK_PARTITIONS,
        vertexFormat: TEXTURED.vertexFormat,
      }),
    }),
    appearance: new Cesium.MaterialAppearance({
      material: Cesium.Material.fromType('Image', { image }),
      materialSupport: TEXTURED,
      translucent: false,
      faceForward: false,
      fragmentShaderSource: MOON_FRAGMENT_SHADER,
    }),
    asynchronous: false,
    allowPicking: true,
  });
  primitive.show = false;
  return primitive;
}
