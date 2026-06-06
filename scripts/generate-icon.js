const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.on('ready', async () => {
  const svgPath = path.join(__dirname, '../resources/icon.svg')
  const svgContent = fs.readFileSync(svgPath, 'utf8')
  const base64Svg = Buffer.from(svgContent).toString('base64')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
html, body { margin: 0; padding: 0; width: 1024px; height: 1024px; overflow: hidden; background: transparent; }
img { display: block; }
</style>
</head>
<body>
<img src="data:image/svg+xml;base64,${base64Svg}" width="1024" height="1024">
</body>
</html>`

  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    useContentSize: true,
    show: false,
    frame: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)

  win.webContents.on('did-finish-load', async () => {
    await new Promise(resolve => setTimeout(resolve, 500))
    const dpr = win.webContents.getZoomFactor() || 1
    const { width: ww, height: wh } = win.getContentSize
      ? { width: win.getContentSize()[0], height: win.getContentSize()[1] }
      : { width: 1024, height: 1024 }

    const image = await win.webContents.capturePage()
    const pngBuffer = image.toPNG()
    const outputPath = path.join(__dirname, '../resources/icon.png')
    fs.writeFileSync(outputPath, pngBuffer)
    const { width, height } = image.getSize()
    console.log(`icon saved: ${outputPath} (${width}x${height}) content=${ww}x${wh}`)
    app.quit()
  })
})
