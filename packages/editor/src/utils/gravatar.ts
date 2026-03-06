function leftRotate(value: number, amount: number): number {
  return (value << amount) | (value >>> (32 - amount))
}

function md5(input: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(input)
  const originalBitLength = bytes.length * 8
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6
  const padded = new Uint8Array(paddedLength)

  padded.set(bytes)
  padded[bytes.length] = 0x80

  const bitLengthView = new DataView(padded.buffer)
  bitLengthView.setUint32(paddedLength - 8, originalBitLength >>> 0, true)
  bitLengthView.setUint32(paddedLength - 4, Math.floor(originalBitLength / 0x100000000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
    14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]

  const constants = Array.from({ length: 64 }, (_, index) =>
    Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000)
  )

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(16)
    for (let index = 0; index < 16; index += 1) {
      words[index] = bitLengthView.getUint32(offset + index * 4, true)
    }

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let index = 0; index < 64; index += 1) {
      let f = 0
      let g = 0

      if (index < 16) {
        f = (b & c) | (~b & d)
        g = index
      } else if (index < 32) {
        f = (d & b) | (~d & c)
        g = (5 * index + 1) % 16
      } else if (index < 48) {
        f = b ^ c ^ d
        g = (3 * index + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * index) % 16
      }

      const nextD = d
      d = c
      c = b
      const sum = (a + f + constants[index]! + words[g]!) >>> 0
      b = (b + leftRotate(sum, shifts[index]!)) >>> 0
      a = nextD
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const output = new DataView(new ArrayBuffer(16))
  output.setUint32(0, a0, true)
  output.setUint32(4, b0, true)
  output.setUint32(8, c0, true)
  output.setUint32(12, d0, true)

  return Array.from(new Uint8Array(output.buffer))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export function createGravatarUrl(input: string, size = 64): string {
  const normalized = input.trim().toLowerCase()
  const hash = md5(normalized)
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`
}

export { md5 }
