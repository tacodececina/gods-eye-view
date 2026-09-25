/**
 * Andamiaje común de los arneses de navegador P4 (eyeinsky-p4, eyeinsky-p4-ux):
 * argumentos `<url> <salida>`, salida nueva obligatoria (nunca sobrescribe un
 * result.json), registro de comprobaciones, capturas y cierre.
 *
 * Nunca arranca servidor: los arneses se apuntan a uno vivo.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer';

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** |value / target − 1| ≤ tolerance, con value finito. */
export const near = (value, target, tolerance) =>
  Number.isFinite(value) && Math.abs(value / target - 1) <= tolerance;

/**
 * Lee `<url> <salida>` y garantiza una salida nueva.
 * @param {string} script Nombre del arnés, para el mensaje de uso.
 * @returns {Promise<{baseUrl: string, out: string, resultPath: string}>}
 */
export async function prepareRun(script) {
  const [baseUrl, out] = process.argv.slice(2);
  if (!baseUrl || !out)
    throw new Error(`uso: ${script} <url> <directorio-de-salida>`);
  const resultPath = path.join(out, 'result.json');
  try {
    await fs.access(resultPath);
    throw new Error(
      `${resultPath} ya existe: usa un directorio nuevo por corrida para no sobrescribir evidencia`,
    );
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(out, { recursive: true });
  return { baseUrl, out, resultPath };
}

/**
 * Registro de la corrida. `check(id, ok, detalle, matriz?)` anota una
 * comprobación; `matriz` es el id P4-xx (o lista) que la comprobación cubre.
 */
export function createRecorder(fields = {}) {
  const result = {
    startedAt: new Date().toISOString(),
    browserMode: 'perfil temporal nuevo, Chrome headless, GPU nativa',
    ...fields,
    checks: [],
    snapshots: {},
    pageErrors: [],
    consoleErrors: [],
    screenshots: [],
  };
  const check = (id, ok, detail, matrix = []) => {
    const ids = Array.isArray(matrix) ? matrix : [matrix];
    result.checks.push({ id, ok: Boolean(ok), matrix: ids, detail });
    console.log(`${ok ? 'ok  ' : 'FALLA'} ${id}`);
    return Boolean(ok);
  };
  return { result, check };
}

/** Chrome headless con GPU nativa y un perfil temporal nuevo. */
export async function launchBrowser(prefix) {
  const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist'],
    userDataDir: profileDir,
  });
  const close = async () => {
    await browser.close();
    await fs.rm(profileDir, { recursive: true, force: true }).catch(() => {});
  };
  return { browser, close };
}

/** Captura de página registrada en el resultado. */
export async function screenshot(result, out, page, name) {
  const file = path.join(out, name);
  await page.screenshot({ path: file });
  result.screenshots.push(file);
  return file;
}

/** Cierra la corrida: veredicto, result.json con `wx` y resumen por consola. */
export async function finishRun(result, resultPath) {
  result.finishedAt = new Date().toISOString();
  result.passed =
    !result.fatal && result.checks.every((entry) => entry.ok === true);
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
  });
  console.log(
    JSON.stringify(
      {
        passed: result.passed,
        failed: result.checks.filter(({ ok }) => !ok).map(({ id }) => id),
        checks: result.checks.length,
        fatal: result.fatal ?? null,
      },
      null,
      2,
    ),
  );
  process.exitCode = result.passed ? 0 : 1;
}
