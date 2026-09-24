import * as Cesium from 'cesium';
import {
  gstime,
  propagate,
  eciToEcf,
  eciToGeodetic,
  degreesLong,
  degreesLat,
  twoline2satrec,
} from 'satellite.js';
import { findNextIssPass } from '../../data/issPass.js';
import { ORBIT_PATH_STEPS, ISS_NORAD } from './policy.js';
import { normalizeNoradId, parseTleText } from './elements.js';

/**
 * One SGP4 sample: TEME position (km) and velocity (km/s) plus the GMST of
 * `date`, or null when SGP4 fails. Every propagation helper starts here so
 * the point, the orbit readout and the model pose share one sample path.
 * @param {object} satrec satellite.js satrec.
 * @param {Date} date
 * @returns {{position: object, velocity: object|null, gmst: number}|null}
 */
function sampleSgp4(satrec, date) {
  try {
    const posVel = propagate(satrec, date);
    const position = posVel?.position;
    if (!position || typeof position === 'boolean') return null;
    const velocity =
      posVel.velocity && typeof posVel.velocity !== 'boolean'
        ? posVel.velocity
        : null;
    return { position, velocity, gmst: gstime(date) };
  } catch {
    return null;
  }
}

/** ECI (km or km/s) → ECEF axes, scaled to metres (or m/s), into `result`. */
function ecefMetres(vector, gmst, result = new Cesium.Cartesian3()) {
  const ecf = eciToEcf(vector, gmst);
  const x = ecf.x * 1000;
  const y = ecf.y * 1000;
  const z = ecf.z * 1000;
  return [x, y, z].every((c) => Number.isFinite(c))
    ? Cesium.Cartesian3.fromElements(x, y, z, result)
    : null;
}

/**
 * SGP4 state in ECEF axes for model pose (P4 T3).
 * `velocity` is the inertial (TEME) velocity rotated into ECEF axes — the
 * vector the LVLH frame is defined by — not the Earth-relative velocity
 * (they differ by ω×r, ~0.5 km/s in LEO). Its magnitude equals the
 * `speedMps` that `propagatePosition` reports for the same date.
 * @param {object} satrec satellite.js satrec.
 * @param {Date} date
 * @param {{position: Cesium.Cartesian3, velocity: Cesium.Cartesian3}} [result]
 *   Holder to write into (per-frame model pose); allocated when omitted.
 * @returns {{position: Cesium.Cartesian3, velocity: Cesium.Cartesian3}|null}
 *   Metres and m/s, or null when SGP4 fails or returns no velocity.
 */
export function propagateStateEcef(satrec, date, result) {
  const sample = sampleSgp4(satrec, date);
  if (!sample?.velocity) return null;
  const position = ecefMetres(sample.position, sample.gmst, result?.position);
  const velocity = ecefMetres(sample.velocity, sample.gmst, result?.velocity);
  if (!position || !velocity) return null;
  return result ?? { position, velocity };
}

export function createOrbits({ state: layerState, services, parts, source }) {
  /**
   * Build the rigid ECEF transform that keeps an orbit path baked at one GMST
   * aligned with live SGP4 positions propagated at another epoch.
   * @param {number} gmstAtBake GMST used when the path positions were baked.
   * @param {Date} nowDate Epoch whose rotating-Earth frame should be displayed.
   * @param {Cesium.Matrix4} [result] Optional matrix to update in place.
   * @returns {Cesium.Matrix4} Z-rotation from bake-time ECEF to current ECEF.
   */

  function orbitFrameModelMatrix(
    gmstAtBake,
    nowDate,
    result = new Cesium.Matrix4(),
  ) {
    const deltaGmst = gstime(nowDate) - gmstAtBake;
    const rotation = Cesium.Matrix3.fromRotationZ(
      -deltaGmst,
      layerState._scratchRingRotation,
    );
    return Cesium.Matrix4.fromRotationTranslation(
      rotation,
      Cesium.Cartesian3.ZERO,
      result,
    );
  }

  /**
   * Parse TLE text into array of { name, line1, line2 } objects.
   */

  function parseTLE(text) {
    return parseTleText(text);
  }

  /**
   * Propagate satellite position at a given JS Date.
   * Returns geodetic position plus inertial speed from the same SGP4 propagation
   * epoch, or null on error.
   */

  function propagatePosition(satrec, date) {
    const sample = sampleSgp4(satrec, date);
    if (!sample) return null;
    try {
      const geo = eciToGeodetic(sample.position, sample.gmst);
      const { velocity } = sample;
      const speedMps = velocity
        ? Math.hypot(velocity.x, velocity.y, velocity.z) * 1000
        : null;

      return {
        longitude: degreesLong(geo.longitude),
        latitude: degreesLat(geo.latitude),
        altitude: geo.height * 1000, // km → meters
        speedMps: Number.isFinite(speedMps) ? speedMps : null,
      };
    } catch {
      return null;
    }
  }

  function orbitalPeriodSeconds(satrec) {
    const meanMotion = satrec.no * (1440 / (2 * Math.PI));
    return 86400 / Math.max(meanMotion, 0.1);
  }

  /**
   * Compute full orbital path as array of Cartesian3 positions.
   * Steps around one full orbit based on the satellite's mean motion.
   */

  function computeOrbitPath(satrec, referenceDate) {
    const periodSec = orbitalPeriodSeconds(satrec);
    const stepSec = periodSec / ORBIT_PATH_STEPS;

    const positions = [];
    const baseTime = referenceDate.getTime();
    // Fix GMST to reference time so the orbital ring closes.
    // Without this, Earth rotation during the orbit period (~24° for LEO)
    // shifts the end point west of the start, leaving a visible gap.
    const fixedGmst = gstime(referenceDate);

    for (let i = 0; i <= ORBIT_PATH_STEPS; i++) {
      const t = new Date(baseTime + i * stepSec * 1000);
      try {
        const posVel = propagate(satrec, t);
        if (!posVel.position || typeof posVel.position === 'boolean') continue;
        const geo = eciToGeodetic(posVel.position, fixedGmst);
        positions.push(
          Cesium.Cartesian3.fromDegrees(
            degreesLong(geo.longitude),
            degreesLat(geo.latitude),
            geo.height * 1000,
          ),
        );
      } catch {
        continue;
      }
    }

    return positions;
  }

  /**
   * Next ISS pass for an observer. Requires the catalog to have loaded (the
   * satellites layer enabled at least once this session).
   * @returns {{status:'no-tle'}|{status:'none'}|{status:'ok', pass:{riseMs:number,setMs:number,maxElevDeg:number,maxElevMs:number,riseAzDeg:number}}}
   */

  function getNextIssPass({ latDeg, lonDeg, minElevDeg = 10 }) {
    const sat = layerState._catalog.get(ISS_NORAD);
    if (!sat || !sat.satrec) return { status: 'no-tle' };
    const pass = findNextIssPass({
      satrec: sat.satrec,
      latDeg,
      lonDeg,
      fromMs: Date.now(),
      minElevDeg,
    });
    return pass ? { status: 'ok', pass } : { status: 'none' };
  }

  /**
   * Score a mission-to-catalog name match. Compact identifier containment handles
   * names such as "Sirius SXM-11" → "SXM-11", while weak generic matches such as
   * "Starlink Group 17-40" → an arbitrary "STARLINK-1008" remain below the
   * acceptance threshold.
   * @param {string} query Mission or payload name.
   * @param {string} catalogName Satellite catalog name.
   * @returns {number} Match score; 0 means no useful relationship.
   */

  function scoreSatelliteNameMatch(query, catalogName) {
    const q = String(query || '')
      .trim()
      .toLowerCase();
    const name = String(catalogName || '')
      .trim()
      .toLowerCase();
    if (!q || !name) return 0;
    const qCompact = q.replace(/[^a-z0-9]/g, '');
    const nameCompact = name.replace(/[^a-z0-9]/g, '');
    if (qCompact === nameCompact) return 1000;
    let score = 0;
    if (
      Math.min(qCompact.length, nameCompact.length) >= 5 &&
      (qCompact.includes(nameCompact) || nameCompact.includes(qCompact))
    ) {
      score += 200 + Math.min(qCompact.length, nameCompact.length);
    }
    const ignored = new Set([
      'group',
      'block',
      'mission',
      'launch',
      'falcon',
      'rocket',
    ]);
    const tokens = q
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4 && !ignored.has(token));
    score += tokens.reduce(
      (total, token) => total + (name.includes(token) ? token.length : 0),
      0,
    );
    return score;
  }

  function internationalDesignatorYear(satrec) {
    const match = String(satrec?.intldesg || '').match(/^(\d{2})/);
    if (!match) return null;
    const shortYear = Number(match[1]);
    return shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
  }

  function lookupTleEntries(tleText) {
    if (tleText !== layerState._lookupTleText) {
      layerState._lookupTleText = tleText;
      layerState._lookupTleEntries = parseTLE(tleText);
    }
    return layerState._lookupTleEntries;
  }

  function tleLineLaunchYear(line1) {
    const shortYear = Number(String(line1 || '').slice(9, 11));
    if (!Number.isFinite(shortYear)) return null;
    return shortYear >= 57 ? 1900 + shortYear : 2000 + shortYear;
  }

  function orbitTrackFromRecord(name, satrec) {
    const referenceDate = new Date();
    const current = propagatePosition(satrec, referenceDate);
    if (!current) return null;
    return {
      // null (not NaN) when the catalogue number is not an exact integer.
      noradId: normalizeNoradId(satrec.satnum),
      name: String(name || '').trim(),
      current,
      periodSec: orbitalPeriodSeconds(satrec),
      orbitPath: computeOrbitPath(satrec, referenceDate),
      gmstAtBake: gstime(referenceDate),
      positionAt: (date) => propagatePosition(satrec, date),
    };
  }

  /**
   * Find and propagate a mission payload directly from a TLE catalog.
   * This supports newly launched payloads that are present in CelesTrak's active
   * feed but have not yet moved into a narrower operational group.
   * @param {string} tleText Three-line-element catalog text.
   * @param {string} query Mission or payload name.
   * @param {{launchTime?: string|null}} [options] Optional launch epoch for namesake rejection.
   * @returns {{noradId:number,name:string,current:object,periodSec:number,orbitPath:Cesium.Cartesian3[],positionAt:function(Date):object|null}|null}
   */

  function findSatelliteOrbitTrackInTle(tleText, query, options = {}) {
    const launchYear = Number.isFinite(Date.parse(options.launchTime))
      ? new Date(options.launchTime).getUTCFullYear()
      : null;
    let bestEntry = null;
    let bestScore = 0;
    const catalogText = String(tleText || '');
    for (const entry of lookupTleEntries(catalogText)) {
      const designatorYear = tleLineLaunchYear(entry.line1);
      if (
        launchYear !== null &&
        designatorYear !== null &&
        designatorYear !== launchYear
      )
        continue;
      const score = scoreSatelliteNameMatch(query, entry.name);
      if (score > bestScore) {
        bestEntry = entry;
        bestScore = score;
      }
    }
    if (!bestEntry || bestScore < 12) return null;
    const satrec = twoline2satrec(bestEntry.line1, bestEntry.line2);
    if (!satrec || satrec.error !== 0) return null;
    return orbitTrackFromRecord(bestEntry.name, satrec);
  }

  /**
   * Return the current propagated position and one-orbit path for a catalog satellite.
   * @param {string|number} query NORAD id or mission/payload name.
   * @param {{launchTime?: string|null}} [options] Optional launch epoch used to reject namesakes from another launch year.
   * @returns {{noradId:number,name:string,current:object,periodSec:number,orbitPath:Cesium.Cartesian3[],positionAt:function(Date):object|null}|null}
   */

  function getSatelliteOrbitTrack(query, options = {}) {
    if (query === null || query === undefined || !layerState._catalog?.size)
      return null;
    const q = String(query).trim().toLowerCase();
    let noradId = /^\d+$/.test(q) ? Number(q) : null;
    if (noradId === null || !layerState._catalog.has(noradId)) {
      noradId = null;
      const launchYear = Number.isFinite(Date.parse(options.launchTime))
        ? new Date(options.launchTime).getUTCFullYear()
        : null;
      let bestScore = 0;
      for (const [id, sat] of layerState._catalog) {
        const designatorYear = internationalDesignatorYear(sat.satrec);
        if (
          launchYear !== null &&
          designatorYear !== null &&
          designatorYear !== launchYear
        )
          continue;
        const score = scoreSatelliteNameMatch(q, sat.name);
        if (score > bestScore) {
          bestScore = score;
          noradId = id;
        }
      }
      if (bestScore < 12) noradId = null;
    }
    if (noradId === null) return null;
    const sat = layerState._catalog.get(noradId);
    return orbitTrackFromRecord(sat.name, sat.satrec);
  }
  return {
    orbitFrameModelMatrix,
    parseTLE,
    propagatePosition,
    propagateStateEcef,
    orbitalPeriodSeconds,
    computeOrbitPath,
    getNextIssPass,
    scoreSatelliteNameMatch,
    internationalDesignatorYear,
    lookupTleEntries,
    tleLineLaunchYear,
    orbitTrackFromRecord,
    findSatelliteOrbitTrackInTle,
    getSatelliteOrbitTrack,
  };
}
