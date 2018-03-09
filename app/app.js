const {
  getQueryStringParam, Component,
  InMemoryDarBuffer, substanceGlobals,
  platform, DefaultDOMElement
} = window.substance

const { JATSImportDialog, TextureArchive, Texture } = window.texture

const ipc = require('electron').ipcRenderer
const darServer = require('dar-server')
const { FSStorageClient } = darServer
const url = require('url')
const path = require('path')

window.addEventListener('load', () => {
  substanceGlobals.DEBUG_RENDERING = platform.devtools
  App.mount({}, window.document.body)
})

class App extends Component {

  didMount() {
    this._init()
    this._archive.on('archive:changed', this._archiveChanged, this)
    ipc.on('document:save', () => {
      this._save()
    })
    ipc.on('document:save-as', (event, newArchiveDir) => {
      this._saveAs(newArchiveDir)
    })
    DefaultDOMElement.getBrowserWindow().on('keydown', this._keyDown, this)
  }

  dispose() {
    DefaultDOMElement.getBrowserWindow().off(this)
    // TODO: is it necessary to do ipc.off?
    // (App component is never unmounted, only the full window is killed)
  }

  getInitialState() {
    return {
      archive: undefined,
      error: undefined
    }
  }

  render($$) {
    let el = $$('div').addClass('sc-app')
    let { archive, error } = this.state

    if (archive) {
      el.append(
        $$(Texture, {
          archive
        })
      )
    } else if (error) {
      if (error.type === 'jats-import-error') {
        el.append(
          $$(JATSImportDialog, { errors: error.detail })
        )
      } else {
        el.append(
          'ERROR:',
          error.message
        )
      }
    } else {
      // LOADING...
    }
    return el
  }

  _init() {
    let archiveDir = getQueryStringParam('archiveDir')
    // let isNew = getQueryStringParam('isNew')
    console.info('archiveDir', archiveDir)
    let storage = new FSStorageClient()
    let buffer = new InMemoryDarBuffer()
    let archive = new TextureArchive(storage, buffer)
    this._archive = archive
    let promise = archive.load(archiveDir)
      .then(() => {
        this._updateTitle()
        this.setState({archive})
      })

    if (!platform.devtools) {
      promise.catch(error => {
        console.error(error)
        this.setState({error})
      })
    }
  }

  /*
    We may want an explicit save button, that can be configured on app level,
    but passed down to editor toolbars.
  */
  _save() {
    this.state.archive.save().then(() => {
      this._updateTitle(false)
    }).catch(err => {
      console.error(err)
    })
  }

  _saveAs(newArchiveDir) {
    console.info('saving as', newArchiveDir)
    this.state.archive.saveAs(newArchiveDir).then(() => {
      this._updateTitle(false)
      ipc.send('document:save-as:successful')
      // Update the browser url, so on reload, we get the contents from the
      // new location
      let newUrl = url.format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file:',
        query: {
          archiveDir: newArchiveDir
        },
        slashes: true
      })
      window.history.replaceState({}, 'After Save As', newUrl);
    }).catch(err => {
      console.error(err)
    })
  }

  _archiveChanged() {
    const hasPendingChanges = this._archive.hasPendingChanges()
    if (hasPendingChanges) {
      ipc.send('document:unsaved')
      this._updateTitle(hasPendingChanges)
    }
  }

  _updateTitle(hasPendingChanges) {
    let newTitle = this._archive.getTitle()
    if (hasPendingChanges) {
      newTitle += " *"
    }
    document.title = newTitle
  }

  _keyDown(event) {
    if ( event.key === 'Dead' ) return
    // Handle custom keyboard shortcuts globally
    let archive = this.state.archive
    if (archive) {
      let manuscriptSession = archive.getEditorSession('manuscript')
      manuscriptSession.keyboardManager.onKeydown(event)
    }
  }
}
