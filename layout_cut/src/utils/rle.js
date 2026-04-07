// 將後端回傳的簡單 RLE 解碼成二值 mask（Uint8Array，0/1）
export function decodeRLEToMask(rle) {
  if (!rle || !rle.size || !rle.counts) return null

  const [height, width] = rle.size
  const counts = rle.counts
  const total = width * height

  const mask = new Uint8Array(total)
  let idx = 0
  let value = 0

  for (let i = 0; i < counts.length; i++) {
    const runLength = counts[i]
    const end = idx + runLength
    if (end > total) break

    if (value === 1) {
      // 填 1 的區段
      mask.fill(1, idx, end)
    }

    idx = end
    value = 1 - value

    if (idx >= total) break
  }

  return {
    width,
    height,
    data: mask
  }
}

// 將 RLE + bbox 解碼成裁切後的彩色 ImageData 所需資料
// 回傳 { width, height, data: Uint8ClampedArray, offsetX, offsetY }
export function decodeRLEToColoredImageData(rle, bbox, color) {
  const mask = decodeRLEToMask(rle)
  if (!mask) return null

  const [bx, by, bw, bh] = bbox.map(v => Number.isFinite(v) ? v : 0)
  const { width: fullW, height: fullH, data: maskData } = mask

  const x0 = Math.max(0, Math.min(fullW, bx))
  const y0 = Math.max(0, Math.min(fullH, by))
  const x1 = Math.max(0, Math.min(fullW, bx + bw))
  const y1 = Math.max(0, Math.min(fullH, by + bh))

  const w = Math.max(0, x1 - x0)
  const h = Math.max(0, y1 - y0)

  const outData = new Uint8ClampedArray(w * h * 4)

  const { r, g, b, a } = color
  const alpha = a != null ? a : 128

  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const srcX = x0 + xx
      const srcY = y0 + yy
      const srcIndex = srcY * fullW + srcX

      if (maskData[srcIndex]) {
        const dstIndex = (yy * w + xx) * 4
        outData[dstIndex] = r
        outData[dstIndex + 1] = g
        outData[dstIndex + 2] = b
        outData[dstIndex + 3] = alpha
      }
    }
  }

  return {
    width: w,
    height: h,
    data: outData,
    offsetX: x0,
    offsetY: y0
  }
}

// 生成隨機顏色（偏亮，方便辨識）
export function getRandomMaskColor() {
  const r = 100 + Math.floor(Math.random() * 155)
  const g = 100 + Math.floor(Math.random() * 155)
  const b = 100 + Math.floor(Math.random() * 155)

  // 讓實際透明度由前端 Konva 的 globalAlpha 控制
  return { r, g, b, a: 255 }
}

