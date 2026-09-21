import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Cartesian3, JulianDate, Simon1994PlanetaryPositions } from 'cesium';
import { json2satrec, sgp4, twoline2satrec } from 'satellite.js';

const outputDirectory = path.resolve(process.argv[2] || 'output/p0-science');
const refresh = process.argv.includes('--refresh');
await fs.mkdir(outputDirectory, { recursive: true });

// Declared before retrieval: these are acceptance limits, not fits to results.
const tolerances = Object.freeze({
  moonPositionKm: 100,
  sgp4PositionKm: 0.02,
  sgp4VelocityKmS: 0.00002,
  unitRoundTripKm: 1e-12,
});
const epochs = [
  '2026-09-18T00:00:00.000Z',
  '2026-09-19T12:00:00.000Z',
  '2026-09-21T00:00:00.000Z',
];

const horizonsParameters = {
  format: 'json',
  COMMAND: "'301'",
  OBJ_DATA: "'NO'",
  MAKE_EPHEM: "'YES'",
  EPHEM_TYPE: "'VECTORS'",
  CENTER: "'500@399'",
  TLIST: epochs
    .map((value) => `'${value.replace('T', ' ').replace('.000Z', '')}'`)
    .join(' '),
  TLIST_TYPE: "'CAL'",
  TIME_TYPE: "'UT'",
  REF_PLANE: "'FRAME'",
  REF_SYSTEM: "'ICRF'",
  VEC_CORR: "'NONE'",
  OUT_UNITS: "'KM-S'",
  VEC_TABLE: "'2'",
  CAL_FORMAT: "'JD'",
  CSV_FORMAT: "'YES'",
  VEC_LABELS: "'YES'",
};
const horizonsUrl = new URL('https://ssd.jpl.nasa.gov/api/horizons.api');
for (const [key, value] of Object.entries(horizonsParameters))
  horizonsUrl.searchParams.set(key, value);

const paths = {
  horizons: path.join(outputDirectory, 'horizons-response.json'),
  sixOmm: path.join(outputDirectory, 'celestrak-six-omm.json'),
  sixTle: path.join(outputDirectory, 'celestrak-six-tle.txt'),
  retrieval: path.join(outputDirectory, 'public-retrieval.json'),
};

async function fetchText(url) {
  const response = await fetch(url, { headers: { accept: '*/*' } });
  return { status: response.status, text: await response.text(), url };
}

if (refresh) {
  const [horizons, sixOmm, sixTle] = await Promise.all([
    fetchText(horizonsUrl.href),
    fetchText(
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=100719&FORMAT=JSON',
    ),
    fetchText(
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=100719&FORMAT=TLE',
    ),
  ]);
  assert.equal(horizons.status, 200, 'Horizons HTTP response');
  assert.equal(sixOmm.status, 200, 'six-digit OMM HTTP response');
  await fs.writeFile(paths.horizons, `${horizons.text.trim()}\n`);
  await fs.writeFile(paths.sixOmm, `${sixOmm.text.trim()}\n`);
  await fs.writeFile(paths.sixTle, `${sixTle.text.trim()}\n`);
  await fs.writeFile(
    paths.retrieval,
    `${JSON.stringify(
      {
        retrievedAt: new Date().toISOString(),
        horizons: { url: horizons.url, status: horizons.status },
        sixDigitOmm: { url: sixOmm.url, status: sixOmm.status },
        sixDigitTle: { url: sixTle.url, status: sixTle.status },
      },
      null,
      2,
    )}\n`,
  );
}

const horizonsPayload = JSON.parse(await fs.readFile(paths.horizons, 'utf8'));
const horizonsText = String(horizonsPayload.result || '');
assert.match(horizonsText, /\$\$SOE[\s\S]*\$\$EOE/, 'Horizons vector table');
const vectorLines = horizonsText
  .split('$$SOE')[1]
  .split('$$EOE')[0]
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
assert.equal(
  vectorLines.length,
  epochs.length,
  'one Horizons vector per epoch',
);
const references = vectorLines.map((line, index) => {
  const values = line.split(',').map((value) => value.trim());
  const numbers = values.map(Number).filter(Number.isFinite);
  assert.ok(numbers.length >= 7, `parse Horizons vector ${index}`);
  return {
    epochUtc: epochs[index],
    jdUt: numbers[0],
    positionKm: { x: numbers[1], y: numbers[2], z: numbers[3] },
    velocityKmS: { x: numbers[4], y: numbers[5], z: numbers[6] },
    raw: line,
  };
});

const tdbMinusTtSeconds = (daysSinceJ2000Tt) => {
  const g = 6.239996 + 0.0172019696544 * daysSinceJ2000Tt;
  return 1.657e-3 * Math.sin(g + 1.671e-2 * Math.sin(g));
};
const utcJulianDay = (date) => date.getTime() / 86_400_000 + 2_440_587.5;
const moonComparisons = references.map((reference) => {
  const date = new Date(reference.epochUtc);
  const julianDate = JulianDate.fromDate(date);
  const candidateM =
    Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
      julianDate,
      new Cartesian3(),
    );
  const candidateKm = {
    x: candidateM.x / 1000,
    y: candidateM.y / 1000,
    z: candidateM.z / 1000,
  };
  const positionErrorKm = Math.hypot(
    candidateKm.x - reference.positionKm.x,
    candidateKm.y - reference.positionKm.y,
    candidateKm.z - reference.positionKm.z,
  );
  const taiMinusUtcSeconds = JulianDate.computeTaiMinusUtc(julianDate);
  const ttMinusUtcSeconds = taiMinusUtcSeconds + 32.184;
  const jdUtc = utcJulianDay(date);
  const jdTt = jdUtc + ttMinusUtcSeconds / 86_400;
  const tdbMinusTt = tdbMinusTtSeconds(jdTt - 2_451_545);
  return {
    epochUtc: reference.epochUtc,
    referencePositionKm: reference.positionKm,
    candidatePositionKm: candidateKm,
    positionErrorKm,
    timeScales: {
      jdUtc,
      taiMinusUtcSeconds,
      jdTai: jdUtc + taiMinusUtcSeconds / 86_400,
      ttMinusTaiSeconds: 32.184,
      jdTt,
      tdbMinusTtSeconds: tdbMinusTt,
      jdTdb: jdTt + tdbMinusTt / 86_400,
    },
    passed: positionErrorKm <= tolerances.moonPositionKm,
  };
});

const tle = [
  '1 00005U 58002B   00179.78495062  .00000023  00000-0  28098-4 0  4753',
  '2 00005  34.2682 348.7242 1859667 331.7664  19.3264 10.82419157413667',
];
const omm = {
  OBJECT_NAME: 'VANGUARD 1',
  NORAD_CAT_ID: 5,
  EPOCH: '2000-06-27T18:50:19.733571',
  MEAN_MOTION: 10.82419157,
  ECCENTRICITY: 0.1859667,
  INCLINATION: 34.2682,
  RA_OF_ASC_NODE: 348.7242,
  ARG_OF_PERICENTER: 331.7664,
  MEAN_ANOMALY: 19.3264,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID_STRING: '00005',
  ELEMENT_SET_NO: 475,
  REV_AT_EPOCH: 41366,
  BSTAR: 0.000028098,
  MEAN_MOTION_DOT: 0.00000023,
  MEAN_MOTION_DDOT: 0,
};
const vallado = [
  {
    minutes: 0,
    positionKm: [7022.46529266, -1400.08296755, 0.03995155],
    velocityKmS: [1.893841015, 6.405893759, 4.53480725],
  },
  {
    minutes: 360,
    positionKm: [-7154.03120202, -3783.17682504, -3536.19412294],
    velocityKmS: [4.741887409, -4.151817765, -2.093935425],
  },
  {
    minutes: 720,
    positionKm: [-7134.59340119, 6531.68641334, 3260.27186483],
    velocityKmS: [-4.113793027, -2.911922039, -2.557327851],
  },
];
const satrecs = { tle: twoline2satrec(...tle), omm: json2satrec(omm) };
const sgp4Comparisons = [];
for (const [format, satrec] of Object.entries(satrecs)) {
  for (const expected of vallado) {
    const state = sgp4(satrec, expected.minutes);
    const position = [state.position.x, state.position.y, state.position.z];
    const velocity = [state.velocity.x, state.velocity.y, state.velocity.z];
    const positionErrorKm = Math.hypot(
      ...position.map((value, i) => value - expected.positionKm[i]),
    );
    const velocityErrorKmS = Math.hypot(
      ...velocity.map((value, i) => value - expected.velocityKmS[i]),
    );
    const positionM = position.map((value) => value * 1000);
    const kmToMRoundTripErrorKm = Math.hypot(
      ...positionM.map((value, i) => value / 1000 - position[i]),
    );
    sgp4Comparisons.push({
      format,
      minutesFromEpoch: expected.minutes,
      frame: 'TEME of date',
      positionKm: position,
      velocityKmS: velocity,
      positionErrorKm,
      velocityErrorKmS,
      positionM,
      kmToMRoundTripErrorKm,
      passed:
        positionErrorKm <= tolerances.sgp4PositionKm &&
        velocityErrorKmS <= tolerances.sgp4VelocityKmS &&
        kmToMRoundTripErrorKm <= tolerances.unitRoundTripKm,
    });
  }
}

const sixOmm = JSON.parse(await fs.readFile(paths.sixOmm, 'utf8'))[0];
const sixTleText = (await fs.readFile(paths.sixTle, 'utf8')).trim();
const sixSatrec = json2satrec(sixOmm);
const retrieval = JSON.parse(await fs.readFile(paths.retrieval, 'utf8'));
const report = {
  executedAt: new Date().toISOString(),
  status:
    sgp4Comparisons.every((entry) => entry.passed) &&
    sixSatrec.satnum === String(sixOmm.NORAD_CAT_ID) &&
    retrieval.sixDigitTle.status === 404
      ? 'complete'
      : 'fail',
  declaredBeforeRetrieval: tolerances,
  lunarReference: {
    authority: 'NASA/JPL Horizons API',
    target: '301 Moon',
    center: '500@399 Earth geocenter',
    frame: 'ICRF equatorial axes',
    orientation: 'Earth-centered inertial',
    epochs: 'UTC input/output spanning 72 hours',
    units: 'km and km/s',
    lightTimeCorrection: 'NONE (geometric)',
    requestUrl: horizonsUrl.href,
    apiSignature: horizonsPayload.signature,
    modelUnderTest:
      'Cesium Simon1994PlanetaryPositions, output metres converted explicitly to km',
    candidateAssessment: moonComparisons.every((entry) => entry.passed)
      ? 'accepted-at-declared-tolerance'
      : 'rejected-at-declared-100-km-tolerance; no lunar ephemeris is integrated into P0–P2',
    rangeAndExpiry:
      'Valid only for the three fixed epochs from 2026-09-18T00:00Z through 2026-09-21T00:00Z; refresh the fixture if the API/version or model changes.',
    comparisons: moonComparisons,
  },
  timeScaleContract: {
    utcToTai: 'Cesium leap-second table; TAI−UTC recorded per epoch (37 s).',
    taiToTt: 'TT−TAI = 32.184 s exactly by definition.',
    ttToTdb:
      'Cesium/SPICE-compatible periodic approximation K·sin(M+EB·sin(M)); values recorded per epoch.',
    purpose:
      'Simon1994 converts its leap-aware TAI JulianDate to TT and then TDB before evaluating the lunar model; Horizons receives the corresponding physical UTC instants.',
  },
  sgp4Reference: {
    authority:
      'Vallado et al., AIAA 2006-6753 Rev 3 Appendix D/E, case 00005, WGS-72/AFSPC verification vectors',
    sourceUrl:
      'https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753-Rev3.pdf',
    frame: 'TEME of date',
    units: 'position km; velocity km/s',
    parsersUnderTest: ['twoline2satrec', 'json2satrec'],
    comparisons: sgp4Comparisons,
  },
  sixDigitIdentity: {
    source: retrieval.sixDigitOmm.url,
    objectName: sixOmm.OBJECT_NAME,
    noradCatId: sixOmm.NORAD_CAT_ID,
    parsedSatnum: sixSatrec.satnum,
    ommPreserved: sixSatrec.satnum === String(sixOmm.NORAD_CAT_ID),
    tleStatus: retrieval.sixDigitTle.status,
    tleResponse: sixTleText.slice(0, 180),
    policy:
      'Six-digit identity is accepted only through OMM/JSON. Legacy TLE fixed columns are not truncated or fabricated.',
  },
  limitations: [
    'This validates the bounded low-precision lunar position model, not a P5 lunar navigation feature.',
    'The SGP4 vectors validate parser/propagator implementation against independent published outputs; they do not establish real-world orbit accuracy.',
    'No SPICE kernels, terrain datasets, renderer selection, or lunar product code is installed.',
  ],
};
await fs.writeFile(
  path.join(outputDirectory, 'science-result.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      status: report.status,
      moon: moonComparisons.map((entry) => entry.positionErrorKm),
      sgp4MaxKm: Math.max(
        ...sgp4Comparisons.map((entry) => entry.positionErrorKm),
      ),
      sixDigit: report.sixDigitIdentity,
    },
    null,
    2,
  ),
);
if (report.status !== 'complete') process.exitCode = 1;
