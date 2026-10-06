import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from 'three'

/** One bounded scene-resident card; HTML controls are not visible in immersive WebXR. */
export function spatialPanel(width = 1.2, height = 0.75) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = Math.round((1024 * height) / width)
  const context = canvas.getContext('2d')!
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  const material = new MeshBasicMaterial({ map: texture, depthTest: false })
  const mesh = new Mesh(new PlaneGeometry(width, height), material)
  mesh.renderOrder = 10
  return {
    mesh,
    draw(lines: string[], image?: CanvasImageSource) {
      context.fillStyle = '#101c30'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.strokeStyle = '#56779f'
      context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)
      context.fillStyle = '#f1f5f9'
      const fontSize = lines.length === 1 ? 60 : 28
      context.font = `${fontSize}px system-ui`
      let y = lines.length === 1 ? canvas.height / 2 + 18 : 48
      for (const text of lines) {
        const words = text.split(/\s+/u)
        let line = ''
        for (const word of words) {
          if (context.measureText(line + word).width > canvas.width - 60) {
            context.fillText(line, 28, y)
            y += 36
            line = ''
          }
          line += `${word} `
          if (y > canvas.height - 40) break
        }
        if (y > canvas.height - 40) break
        context.fillText(line, 28, y)
        y += 42
      }
      if (image) context.drawImage(image, canvas.width - 244, canvas.height - 154, 216, 126)
      texture.needsUpdate = true
    },
    buttons(labels: string[], caption: string) {
      context.fillStyle = '#101c30'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.font = '28px system-ui'
      context.textAlign = 'center'
      const cell = canvas.width / labels.length
      for (const [i, label] of labels.entries()) {
        context.strokeStyle = '#56779f'
        context.strokeRect(i * cell + 2, 2, cell - 4, canvas.height * 0.62)
        context.fillStyle = '#f1f5f9'
        context.fillText(label, (i + 0.5) * cell, canvas.height * 0.34)
      }
      context.fillStyle = '#a8b8ce'
      context.fillText(caption, canvas.width / 2, canvas.height * 0.86)
      context.textAlign = 'start'
      texture.needsUpdate = true
    },
    dispose() {
      mesh.geometry.dispose()
      material.dispose()
      texture.dispose()
    }
  }
}
