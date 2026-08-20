/* ============================================================================
   REVISAR_TEMAS.js  —  revision de los temas ANTES de publicar
   ----------------------------------------------------------------------------
   Correr desde la carpeta VADEMED:      node REVISAR_TEMAS.js
   Sale con codigo 1 si encuentra algo roto, para poder frenar una publicacion.

   POR QUE EXISTE
   En celular los temas NO se abren en iframe: se inyectan dentro de la app y sus
   <script> se concatenan y se corren juntos. Eso significa que UN solo detalle
   tumba TODO el tema: se ve perfecto pero ningun boton, pestana ni calculadora
   responde. Paso de verdad con Fluidoterapia: llevaba un
   <script type="application/json"> con su ficha, el JSON se colaba al JavaScript,
   el bloque entero dejaba de compilar y el tema quedaba muerto.
   Este script reproduce esas mismas reglas y avisa antes de que llegue al cliente.
   ========================================================================== */
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const DIR = path.join(RAIZ, 'RESUMENCLINIC', 'RESUMENES');
const INDEX = path.join(RAIZ, 'index.html');

/* palabras que no son llamadas a funciones del tema */
const KW = { 'if': 1, 'for': 1, 'while': 1, 'return': 1, 'var': 1, 'let': 1, 'const': 1, 'function': 1, 'typeof': 1, 'new': 1, 'this': 1, 'true': 1, 'false': 1, 'null': 1, 'void': 1, 'delete': 1, 'in': 1, 'do': 1, 'else': 1, 'switch': 1, 'catch': 1, 'throw': 1, 'instanceof': 1 };
const NATIVO = { alert: 1, confirm: 1, prompt: 1, setTimeout: 1, setInterval: 1, parseInt: 1, parseFloat: 1, isNaN: 1, String: 1, Number: 1, Boolean: 1, Array: 1, Object: 1, Math: 1, JSON: 1, Date: 1, RegExp: 1, encodeURIComponent: 1, decodeURIComponent: 1, print: 1, open: 1, close: 1, focus: 1, blur: 1 };

/* MISMA regla que renderTemaInline(): solo se ejecuta el JavaScript de verdad */
function bloquesScript(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\ssrc\s*=/i.test(attrs)) continue;
    const tm = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    const tipo = tm ? tm[1].trim().toLowerCase() : '';
    const esJs = !tipo || /^(text|application)\/(java|ecma)script$/.test(tipo);
    out.push({ tipo: tipo || '(sin type)', esJs, js: m[2] });
  }
  return out;
}

function errorDeSintaxis(js) {
  try { new Function(js); return null; } catch (e) { return e.message; }
}

const problemas = [];
const avisos = [];

/* ---------- 1) cada tema, por dentro ---------- */
const archivos = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter(f => /\.html$/i.test(f)).sort() : [];
for (const f of archivos) {
  const html = fs.readFileSync(path.join(DIR, f), 'utf8');
  const bloques = bloquesScript(html);
  const js = bloques.filter(b => b.esJs);

  /* type="module" no lo corre el visor inline: el tema quedaria sin JavaScript */
  bloques.filter(b => !b.esJs && b.tipo === 'module')
    .forEach(() => problemas.push(f + ': tiene <script type="module">, que el visor de celular NO ejecuta'));

  js.forEach((b, i) => {
    const e = errorDeSintaxis(b.js);
    if (e) problemas.push(f + ': el bloque de JavaScript #' + (i + 1) + ' no compila -> ' + e);
  });

  /* al inyectarse, los bloques corren JUNTOS: aqui salen los const/let repetidos */
  const todo = js.map(b => '\n;\n' + b.js).join('');
  const eJunto = errorDeSintaxis(todo);
  if (eJunto && !js.some(b => errorDeSintaxis(b.js)))
    problemas.push(f + ': los bloques por separado compilan, pero JUNTOS no -> ' + eJunto);

  /* botones que llaman a funciones que nadie define */
  const estatico = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const llamadas = new Set();
  for (const a of estatico.matchAll(/\son\w+\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
    const v = (a[2] !== undefined ? a[2] : a[3]) || '';
    for (const c of v.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g))
      if (!KW[c[1]] && !NATIVO[c[1]]) llamadas.add(c[1]);
  }
  const definidas = new Set();
  for (const d of todo.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) definidas.add(d[1]);
  for (const d of todo.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g)) definidas.add(d[1]);
  for (const d of todo.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)) definidas.add(d[1]);
  const sinDef = [...llamadas].filter(n => !definidas.has(n) && !new RegExp('\\.\\s*' + n + '\\s*\\(').test(estatico));
  if (sinDef.length) problemas.push(f + ': botones que llaman a funciones inexistentes -> ' + sinDef.join(', '));
}

/* ---------- 2) el registro en index.html ---------- */
if (fs.existsSync(INDEX)) {
  const idx = fs.readFileSync(INDEX, 'utf8');
  const registrados = new Set();
  for (const m of idx.matchAll(/file:\s*'([^']*RESUMENES\/[^']+)'/g)) registrados.add(path.basename(m[1]));

  for (const f of registrados) {
    if (!fs.existsSync(path.join(DIR, f)))
      problemas.push('index.html registra "' + f + '" pero ese archivo no existe');
  }
  const sueltos = archivos.filter(f => !registrados.has(f));
  if (sueltos.length) avisos.push(sueltos.length + ' archivo(s) en RESUMENES que nadie abre desde la app: ' + sueltos.slice(0, 6).join(', ') + (sueltos.length > 6 ? ' ...' : ''));
}

/* ---------- resultado ---------- */
console.log('Temas revisados: ' + archivos.length + '\n');
if (avisos.length) { console.log('AVISOS (no frenan la publicacion):'); avisos.forEach(a => console.log('  - ' + a)); console.log(''); }
if (!problemas.length) {
  console.log('Todo en orden: ningun tema quedaria muerto al abrirlo en celular.');
  process.exit(0);
}
console.log('PROBLEMAS (' + problemas.length + '):');
problemas.forEach(p => console.log('  * ' + p));
console.log('\nNO publiques hasta corregir esto.');
process.exit(1);
