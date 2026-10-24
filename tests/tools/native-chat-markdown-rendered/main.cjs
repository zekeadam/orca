const { app, BrowserWindow } = require('electron')

if (process.env.ORCA_BACKGROUND_LAUNCH !== '1') {
  throw new Error('Background launch is required')
}
app.setPath('userData', process.env.MARKDOWN_PROFILE)
app.setPath('sessionData', process.env.MARKDOWN_PROFILE)
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
let window
app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.setActivationPolicy('accessory')
  }
  window = new BrowserWindow({
    width: 1040,
    height: 780,
    show: false,
    focusable: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      offscreen: true,
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  for (const event of ['show', 'focus']) {
    window.on(event, () => {
      console.error(`Forbidden window event: ${event}`)
      app.exit(2)
    })
  }
  await window.loadURL(process.env.MARKDOWN_URL)
  window.webContents.setFrameRate(60)
  window.webContents.startPainting()
  window.webContents.invalidate()
  console.log(JSON.stringify({ hidden: !window.isVisible(), focused: window.isFocused() }))
})
app.on('window-all-closed', () => app.quit())
