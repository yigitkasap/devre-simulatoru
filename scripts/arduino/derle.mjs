// Arduino örnek kodlarını (src/arduino/sketches/*.ino) Uno (ATmega328P) için derler ve
// src/arduino/programs.gen.ts'e yazar (her program: kaynak metni + flash görüntüsü, base64). Bu
// üretilmiş dosya depoya girer: site derlenirken derleyici gerekmez. Derleyici
// @horang-corp/avr-gcc-wasm'ın WebAssembly araçlarıdır (cc1plus, avr-as, avr-ld, avr-objcopy);
// Node'da çalışır, yerel derleyici gerekmez. Arduino çekirdeği ve kütüphaneler paketle önceden
// derlenmiş gelir.
//
// Kullanım: npm run arduino:derle

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PKG = path.join(ROOT, 'node_modules/@horang-corp/avr-gcc-wasm');
const SKETCHES = path.join(ROOT, 'src/arduino/sketches');
const OUT = path.join(ROOT, 'src/arduino/programs.gen.ts');
const UNO_APP_FLASH_BYTES = 32256;

const tool = async (name) => (await import(pathToFileURL(path.join(PKG, 'tools', `${name}.mjs`)).href)).default;
const asset = (virtualPath) => readFile(path.join(PKG, 'assets', virtualPath.replace(/^\/+/, '')));
const manifest = JSON.parse(await readFile(path.join(PKG, 'assets/manifest.json'), 'utf8'));

/** Kütüphane başlığı → bağlanacak önceden derlenmiş nesneler. */
const LIBRARIES = {
  'Servo.h': ['/objects/lib_Servo.o'],
  'Wire.h': ['/objects/lib_Wire.o', '/objects/lib_twi.o'],
  'SPI.h': ['/objects/lib_SPI.o'],
};

function writeFs(fs, file, data) {
  const parts = file.split('/').filter(Boolean);
  let dir = '';
  for (const part of parts.slice(0, -1)) {
    dir += `/${part}`;
    try { fs.mkdir(dir); } catch { /* var */ }
  }
  fs.writeFile(file, data);
}

async function run(name, args, inputs, output) {
  const stderr = [];
  const mod = await (await tool(name))({
    noInitialRun: true,
    wasmBinary: await readFile(path.join(PKG, 'tools', `${name}.wasm`)),
    print() {},
    printErr: (line) => line && stderr.push(line),
  });
  for (const [file, data] of inputs) writeFs(mod.FS, file, data);
  try {
    const status = mod.callMain(args);
    if (status) throw Object.assign(new Error(`çıkış kodu ${status}`), { status });
  } catch (error) {
    if (error?.status !== 0 && !/exit\(0\)/.test(String(error?.message ?? error))) {
      throw new Error(`${name}: ${error?.message ?? error}\n${stderr.join('\n')}`);
    }
  }
  try {
    return mod.FS.readFile(output);
  } catch {
    throw new Error(`${name} çıktı üretmedi:\n${stderr.join('\n')}`);
  }
}

/**
 * Arduino IDE'nin .ino ön işlemesinin küçük bir karşılığı: Arduino.h eklenir ve dosyadaki üst
 * düzey işlevler için bildirimler başa yazılır (bir işlev tanımından önce çağrılabilsin).
 */
function preprocess(source) {
  const prototypes = [];
  const fn = /^[ \t]*((?:unsigned |signed |const |static )*[A-Za-z_][\w<>]*[\s*&]+)([A-Za-z_]\w*)\s*\(([^)]*)\)\s*\{/gm;
  for (const m of source.matchAll(fn)) {
    const [, type, name, params] = m;
    if (['if', 'for', 'while', 'switch', 'return', 'else'].includes(name)) continue;
    if (name === 'setup' || name === 'loop') continue;
    prototypes.push(`${type.trim()} ${name}(${params});`);
  }
  return `#include <Arduino.h>\n${prototypes.join('\n')}\n#line 1 "sketch.ino"\n${source}`;
}

let headers;
async function loadHeaders() {
  headers ??= await Promise.all(manifest.headerFiles.map(async (p) => [p, await asset(`fs${p}`)]));
  return headers;
}

async function compile(source) {
  const cpp = preprocess(source);
  const assembly = await run('cc1plus', [
    '-quiet', '-imultilib', 'avr5',
    '-D__AVR_ATmega328P__', '-D__AVR_DEVICE_NAME__=atmega328p', '-DF_CPU=16000000L',
    '-DARDUINO=10819', '-DARDUINO_AVR_UNO', '-DARDUINO_ARCH_AVR',
    '-isystem', '/sysroot/gcc/include', '-isystem', '/sysroot/avr/include',
    '-I', '/arduino/core', '-I', '/arduino/variant',
    '-I', '/arduino/libraries/Wire/src', '-I', '/arduino/libraries/Wire/src/utility',
    '-I', '/arduino/libraries/SPI/src', '-I', '/libraries/Servo/src', '-I', '/libraries/Servo/src/avr',
    '/build/sketch.cpp', '-mn-flash=1', '-mno-skip-bug', '-dumpbase', 'sketch.cpp', '-mmcu=avr5',
    '-auxbase-strip', '/build/sketch.s', '-Os', '-std=gnu++11', '-fpermissive', '-fno-exceptions',
    '-fno-threadsafe-statics', '-fno-rtti', '-fno-enforce-eh-specs', '-ffunction-sections', '-fdata-sections',
    '-Wall', '-o', '/build/sketch.s',
  ], [...(await loadHeaders()), ['/build/sketch.cpp', cpp]], '/build/sketch.s');

  const object = await run('avr-as', ['-mmcu=atmega328p', '-o', '/build/sketch.o', '/build/sketch.s'],
    [['/build/sketch.s', assembly]], '/build/sketch.o');

  const core = manifest.objectGroups.base.filter((p) => p.includes('/core_'));
  const libs = Object.entries(LIBRARIES).flatMap(([h, objs]) => (source.includes(`<${h}>`) ? objs : []));
  const objects = ['/objects/core_abi.o', ...core, ...libs];
  const linkInputs = [['/build/sketch.o', object], ['/ldscripts/avr5.xn', await asset('ldscripts/avr5.xn')]];
  for (const p of [...objects, ...manifest.libs]) linkInputs.push([p, await asset(p)]);
  const elf = await run('avr-ld', [
    '-m', 'avr5', '-Tdata=0x800100', '--gc-sections', '-o', '/build/sketch.elf',
    '/libs/crtatmega328p.o', '/build/sketch.o', ...objects, '-L/libs', '-lm', '-lc', '-lgcc',
  ], linkInputs, '/build/sketch.elf');

  const hex = new TextDecoder().decode(await run('avr-objcopy',
    ['-O', 'ihex', '-R', '.eeprom', '/build/sketch.elf', '/build/sketch.hex'],
    [['/build/sketch.elf', elf]], '/build/sketch.hex'));
  // Intel HEX → flash görüntüsü (veri kayıtları; 02 kaydı kesim adresi).
  const image = new Uint8Array(UNO_APP_FLASH_BYTES);
  let base = 0;
  let size = 0;
  for (const line of hex.split(/\r?\n/)) {
    if (!line.startsWith(':')) continue;
    const count = parseInt(line.slice(1, 3), 16);
    const address = parseInt(line.slice(3, 7), 16);
    const type = parseInt(line.slice(7, 9), 16);
    if (type === 0x02) base = parseInt(line.slice(9, 13), 16) << 4;
    if (type !== 0x00) continue;
    for (let i = 0; i < count; i++) {
      const at = base + address + i;
      if (at >= UNO_APP_FLASH_BYTES) throw new Error(`program Uno'ya sığmaz (${UNO_APP_FLASH_BYTES} bayt)`);
      image[at] = parseInt(line.slice(9 + 2 * i, 11 + 2 * i), 16);
      size = Math.max(size, at + 1);
    }
  }
  return { image: image.subarray(0, size + (size & 1)), flash: size };
}

const files = (await readdir(SKETCHES)).filter((f) => f.endsWith('.ino')).sort();
const programs = [];
let failed = 0;
for (const file of files) {
  const name = file.slice(0, -4);
  const t0 = performance.now();
  const source = (await readFile(path.join(SKETCHES, file), 'utf8')).replace(/\r\n/g, '\n');
  try {
    const { image, flash } = await compile(source);
    programs.push({ name, source, firmware: Buffer.from(image).toString('base64'), flash });
    console.log(`${name.padEnd(20)} ${String(flash).padStart(6)} bayt  ${Math.round(performance.now() - t0)} ms`);
  } catch (error) {
    failed++;
    console.error(`${name}: DERLENEMEDİ\n${error.message}`);
  }
}
if (failed) process.exit(1);
const body = programs
  .map((p) => `  ${JSON.stringify(p.name)}: {\n    flash: ${p.flash},\n    source: ${JSON.stringify(p.source)},\n    firmware:\n      ${JSON.stringify(p.firmware)},\n  },`)
  .join('\n');
await writeFile(OUT, `// ÜRETİLMİŞ DOSYA, elle değiştirme. Kaynak: src/arduino/sketches/*.ino; üretici: npm run arduino:derle
// (scripts/arduino/derle.mjs: avr-gcc WebAssembly, -Os, Arduino AVR çekirdeği 1.8.x).

export interface CompiledProgram {
  /** Flash'ta kapladığı bayt. */
  readonly flash: number;
  /** Arduino kodu (.ino). */
  readonly source: string;
  /** Flash görüntüsü (adres 0'dan), base64. */
  readonly firmware: string;
}

export const PROGRAMS: Readonly<Record<string, CompiledProgram>> = {
${body}
};
`);
console.log(`${programs.length} program → ${path.relative(ROOT, OUT)}`);
