import * as Cesium from 'cesium';

/**
 * Punto sublunar con tiempo de luz (P5, medium T5–T7). El geométrico (Luna y
 * marco en el mismo t) quedaba a 0,64′ del aparente de Horizons (ObsSub,
 * ITRF93) en el arnés: más que el gate de 0,5′. Horizons mira la Tierra en
 * t−τ (τ = distancia/c ≈ 1,3 s), así que se corrigen los dos términos de
 * primer orden, sin aberración (el mismo modelo que `lightTimeModel` del
 * fixture):
 *
 * 1. Tierra(t−τ) ≈ Tierra(t) − v_T·τ → dirección = Luna_geo(t) + v_T·τ
 *    (v_T ≈ 30 km/s, ~0,34′). v_T se toma como −d(Sol geocéntrico)/dt con
 *    Simon1994 (el Sol respecto del baricentro se mueve < 0,013 km/s).
 * 2. ITRF(t−τ) = Rz(+ω·τ)·ITRF(t): en τ la Tierra gira ~0,32′; la precesión y
 *    la nutación en 1,3 s son despreciables.
 *
 * Solo el punto sublunar del panel lo usa; la Luna 3D sigue geométrica.
 */

export const EARTH_ROTATION_RAD_S = 7.292115e-5;
const LIGHT_SPEED_KM_S = 299_792.458;
const VELOCITY_HALF_STEP_S = 60;

const scratchBefore = new Cesium.JulianDate();
const scratchAfter = new Cesium.JulianDate();
const sunBefore = new Cesium.Cartesian3();
const sunAfter = new Cesium.Cartesian3();

/** Velocidad de la Tierra (km/s, ICRF) como −d(Sol geocéntrico)/dt. */
export function earthVelocityIcrfKmS(julianDate, out) {
  const sun = Cesium.Simon1994PlanetaryPositions;
  sun.computeSunPositionInEarthInertialFrame(
    Cesium.JulianDate.addSeconds(
      julianDate,
      -VELOCITY_HALF_STEP_S,
      scratchBefore,
    ),
    sunBefore,
  );
  sun.computeSunPositionInEarthInertialFrame(
    Cesium.JulianDate.addSeconds(
      julianDate,
      VELOCITY_HALF_STEP_S,
      scratchAfter,
    ),
    sunAfter,
  );
  Cesium.Cartesian3.subtract(sunBefore, sunAfter, out);
  return Cesium.Cartesian3.multiplyByScalar(
    out,
    1e-3 / (2 * VELOCITY_HALF_STEP_S),
    out,
  );
}

const scratchVelocity = new Cesium.Cartesian3();
const scratchApparent = new Cesium.Cartesian3();

/**
 * Dirección ECEF (km) de la Luna vista con tiempo de luz desde el centro de
 * la Tierra, en `out`.
 * @param {{julianDate: Cesium.JulianDate, moonIcrfKm: Cesium.Cartesian3,
 *   icrfToFixed: Cesium.Matrix3}} input
 */
export function apparentSubLunarFixed(
  { julianDate, moonIcrfKm, icrfToFixed },
  out,
) {
  const tau = Cesium.Cartesian3.magnitude(moonIcrfKm) / LIGHT_SPEED_KM_S;
  const velocity = earthVelocityIcrfKmS(julianDate, scratchVelocity);
  const shifted = Cesium.Cartesian3.add(
    moonIcrfKm,
    Cesium.Cartesian3.multiplyByScalar(velocity, tau, scratchApparent),
    scratchApparent,
  );
  const fixed = Cesium.Matrix3.multiplyByVector(icrfToFixed, shifted, out);
  const angle = EARTH_ROTATION_RAD_S * tau;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const { x, y } = fixed;
  out.x = cos * x - sin * y;
  out.y = sin * x + cos * y;
  return out;
}
