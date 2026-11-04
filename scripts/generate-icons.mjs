// Erstellt PWA-Icons ohne Fremdpakete. Laeuft vor Vite dev/build.
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const output = 'public/icons'
mkdirSync(output, { recursive: true })

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let i = 0; i < 8; i++) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1)
  return crc >>> 0
})
function crc32(buffer) {
  let crc = 0xFFFFFFFF
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}
function chunk(type, data) {
  const label = Buffer.from(type)
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([label, data])))
  return Buffer.concat([len, label, data, checksum])
}
function icon(size) {
  const rowLength = size * 4 + 1
  const scanlines = Buffer.alloc(rowLength * size)
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size
    const offset = y * rowLength
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      let [r, g, b] = [23, 36, 43] // Dunkles Dashboard-Blau
      const roofY = 0.295 + 0.64 * Math.abs(u - 0.5)
      const roof = u >= 0.18 && u <= 0.82 && Math.abs(v - roofY) <= 0.027
      const wall = u >= 0.285 && u <= 0.715 && v >= 0.51 && v <= 0.79
      const border = wall && (u < 0.33 || u > 0.67 || v < 0.56 || v > 0.74)
      const door = u >= 0.475 && u <= 0.525 && v >= 0.645 && v <= 0.76
      const windows = v >= 0.60 && v <= 0.655 && ((u >= 0.36 && u <= 0.425) || (u >= 0.575 && u <= 0.64))
      const floor = u > 0.22 && u < 0.78 && v >= 0.81 && v <= 0.825
      if (roof || border || door || windows || floor) [r,g,b] = [187, 234, 218]
      else if (wall) [r,g,b] = [42, 78, 74]
      const ix = offset + 1 + 4 * x
      scanlines[ix] = r; scanlines[ix+1] = g; scanlines[ix+2] = b; scanlines[ix+3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ])
}
for (const size of [64, 180, 192, 512]) {
  const filename = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  writeFileSync(`${output}/${filename}`, icon(size))
}
console.log('PWA-Icons erstellt.')
