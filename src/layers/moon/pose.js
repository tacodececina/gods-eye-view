import * as Cesium from 'cesium';

/**
 * Pose de la Luna 3D (P5 T5). Orientación APROXIMADA: el modelo IAU/WGCCRE
 * de Cesium (`IauOrientationAxes`, el mismo que Scene/Moon.js), que describe
 * la rotación síncrona (la cara visible mira a la Tierra) con libraciones
 * medias. No es ME/PA de efemérides (eso llega en P6). Medido frente al punto
 * sub-Tierra MOON_ME de Horizons en 10 épocas: ≤ 1° (pose.test.mjs).
 *
 * modelMatrix = [ R_ICRF→fijo · (R_ICRF→cuerpo)ᵀ · FIX | Luna fija (m) ], con
 * FIX = giro de 180° en z: EllipsoidGeometry pone s=0 en la longitud 180°
 * (EllipsoidGeometry.js:526) y los mapas equirectangulares llevan 0° al
 * centro (s=0,5).
 */

export const MOON_ORIENTATION_LABEL =
  'aproximada · IAU WGCCRE (rotación síncrona), no ME/PA';

export const MOON_TEXTURE_FIX = Object.freeze(
  Cesium.Matrix3.fromRotationZ(Math.PI),
);

const axes = new Cesium.IauOrientationAxes();
const scratchBody = new Cesium.Matrix3();
const scratchRotation = new Cesium.Matrix3();
const scratchVector = new Cesium.Cartesian3();
const scratchScale = new Cesium.Cartesian3();

/** Rotación ICRF → cuerpo lunar (IAU) en `julianDate`. */
export function moonIcrfToBody(julianDate, result) {
  return axes.evaluate(julianDate, result);
}

/**
 * Punto sub-Tierra en la Luna: longitud Este 0..360° y latitud (esfera).
 * @param {Cesium.JulianDate} julianDate
 * @param {{x:number,y:number,z:number}} moonIcrf Luna geocéntrica ICRF (cualquier unidad).
 */
export function subEarthPoint(julianDate, moonIcrf) {
  const toEarth = Cesium.Cartesian3.negate(
    Cesium.Cartesian3.clone(moonIcrf, scratchVector),
    scratchVector,
  );
  const body = Cesium.Matrix3.multiplyByVector(
    moonIcrfToBody(julianDate, scratchBody),
    toEarth,
    scratchVector,
  );
  const lon = Cesium.Math.toDegrees(Math.atan2(body.y, body.x));
  return {
    lonDeg: (lon + 360) % 360,
    latDeg: Cesium.Math.toDegrees(
      Math.asin(body.z / Cesium.Cartesian3.magnitude(body)),
    ),
  };
}

/**
 * modelMatrix de la Luna en `result`.
 * @param {{julianDate: Cesium.JulianDate, icrfToFixed: Cesium.Matrix3,
 *   moonFixedM: Cesium.Cartesian3, scale?: number}} pose `scale` es el
 *   factor de radio (1 físico, 10 didáctico).
 */
export function computeMoonModelMatrix(
  { julianDate, icrfToFixed, moonFixedM, scale = 1 },
  result,
) {
  if (!(scale > 0) || !Number.isFinite(scale))
    throw new RangeError(`Escala inválida: ${scale}`);
  const bodyToIcrf = Cesium.Matrix3.transpose(
    moonIcrfToBody(julianDate, scratchBody),
    scratchBody,
  );
  const rotation = Cesium.Matrix3.multiply(
    icrfToFixed,
    bodyToIcrf,
    scratchRotation,
  );
  Cesium.Matrix3.multiply(rotation, MOON_TEXTURE_FIX, rotation);
  if (scale !== 1)
    Cesium.Matrix3.multiplyByScale(
      rotation,
      Cesium.Cartesian3.fromElements(scale, scale, scale, scratchScale),
      rotation,
    );
  return Cesium.Matrix4.fromRotationTranslation(rotation, moonFixedM, result);
}
