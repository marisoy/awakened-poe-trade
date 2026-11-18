import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { makeIndexFiles } from '../src/assets/make-index-files.mjs'

const root = new URL('../', import.meta.url)
const { outputFiles } = await build({
  stdin: {
    contents: `export * from './src/parser/index.ts'; export * as Data from './src/assets/data/index.ts'`,
    resolveDir: fileURLToPath(root)
  },
  alias: { '@': fileURLToPath(new URL('src', root)) },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  define: { 'import.meta.env.BASE_URL': JSON.stringify(new URL('public/', root).href) }
})
const { parseClipboard, ItemCategory, Data } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)

const sample = `Item Class: Viscera
Diseased Wing
--------
Torso
--------
Item Level: 72
--------
{ Implicit Modifier }
+12(10-14)% to Chaos Damage over Time Multiplier
--------
Take this to the Wickerman in a town or hideout to attach it.`

// Load the application's real data and generated indexes, without network access.
makeIndexFiles()
const originalFetch = globalThis.fetch
globalThis.fetch = async url => new Response(await readFile(new URL(url)))
try {
  await Data.loadForLang('en')
  const result = parseClipboard(sample)
  assert(result.isOk(), result.isErr() && result.error)
  const item = result.value
  assert.equal(item.category, ItemCategory.Viscera)
  assert.equal(item.rarity, undefined)
  assert.equal(item.info.refName, 'Diseased Wing')
  assert.equal(item.itemLevel, 72)
  assert.deepEqual(item.unknownModifiers, [])
  assert.equal(item.statsByType[0].type, 'implicit')
  assert.deepEqual(item.statsByType[0].stat.trade.ids.implicit, ['implicit.stat_4055307827'])
  assert.deepEqual(item.statsByType[0].sources[0].contributes, { value: 12, min: 10, max: 14 })

  for (const [name, slot, level, modifier, baseName, tradeId, roll] of [
    ['Lesser Golemic Stone', 'Torso', 14, '14(10-15)% chance to Avoid being Stunned',
      'Golemic Stone', 'implicit.stat_4262448838', { value: 14, min: 10, max: 15 }],
    ['Lesser Spectral Hood', 'Head', 27, '+11(7-13)% to Chaos Resistance',
      'Spectral Hood', 'implicit.stat_2923486259', { value: 11, min: 7, max: 13 }],
    ["Lesser Mariner's Tricorne", 'Head', 11,
      '9(8-12)% chance to gain Phasing for 4 seconds on Kill\n(While you have Phasing, your movement is not blocked by Enemies)',
      "Mariner's Tricorne", 'implicit.stat_2918708827', { value: 9, min: 8, max: 12 }],
    ["Hag's Head", 'Head', 64, 'Enemies Cursed by you cannot deal Critical Strikes — Unscalable Value',
      "Hag's Head", 'implicit.stat_3723063276', undefined],
    ['Greater Golemic Stone', 'Torso', 72,
      "You cannot be Stunned if you've been Stunned or Blocked\na Stunning Hit in the past 2 seconds",
      'Golemic Stone', 'implicit.stat_2755326667', undefined]
  ]) {
    const clipboard = `Item Class: Viscera\n${name}\n--------\n${slot}\n--------\nItem Level: ${level}\n--------\n{ Implicit Modifier }\n${modifier}\n--------\nTake this to the Wickerman in a town or hideout to attach it.`
    const parsed = parseClipboard(clipboard)
    assert(parsed.isOk(), `${name}: ${parsed.isErr() && parsed.error}`)
    assert.equal(parsed.value.category, ItemCategory.Viscera)
    assert.equal(parsed.value.info.name, baseName)
    assert.equal(parsed.value.info.refName, baseName)
    assert.equal(parsed.value.itemLevel, level)
    assert.equal(parsed.value.rawText, clipboard)
    assert.deepEqual(parsed.value.unknownModifiers, [])
    assert.equal(parsed.value.statsByType[0].type, 'implicit')
    assert.deepEqual(parsed.value.statsByType[0].stat.trade.ids.implicit, [tradeId])
    if (roll) assert.deepEqual(parsed.value.statsByType[0].sources[0].contributes, roll)
  }

  // Tier stripping must not turn other items or unknown names into Viscera.
  for (const name of ['Lesser Iron Ring', 'Greater Iron Ring', 'Lesser Unknown Viscera']) {
    const parsed = parseClipboard(sample.replace('Diseased Wing', name))
    assert(parsed.isErr(), name)
    assert.equal(parsed.error, 'item.unknown')
  }
  const currency = parseClipboard('Item Class: Stackable Currency\nRarity: Currency\nLesser Eldritch Ember\n--------\nStack Size: 1/10')
  assert(currency.isOk(), currency.isErr() && currency.error)
  assert.equal(currency.value.info.refName, 'Lesser Eldritch Ember')
  assert.equal(currency.value.category, ItemCategory.Currency)

  // Gemling Torso's High1/High2/High3 share a base name, but not an implicit.
  for (const [modifier, tradeId] of [
    ['65(60-70)% increased Armour from Equipped Body Armour', 'implicit.stat_2840285057'],
    ['32(30-35)% increased Energy Shield from Equipped Body Armour', 'implicit.stat_1195319608'],
    ['65(60-70)% increased Evasion Rating from Equipped Body Armour', 'implicit.stat_3509362078']
  ]) {
    for (const name of ['Gemling Torso', 'Greater Gemling Torso']) {
      const variant = parseClipboard(sample
        .replace('Diseased Wing', name)
        .replace('+12(10-14)% to Chaos Damage over Time Multiplier', modifier))
      assert(variant.isOk(), `${name}: ${variant.isErr() && variant.error}`)
      assert.equal(variant.value.info.refName, 'Gemling Torso')
      assert.deepEqual(variant.value.unknownModifiers, [])
      assert.deepEqual(variant.value.statsByType[0].stat.trade.ids.implicit, [tradeId])
    }
  }
} finally {
  globalThis.fetch = originalFetch
}
console.log('Viscera samples, Lesser/Greater names, and High1/High2/High3 modifier parsing passed.')
