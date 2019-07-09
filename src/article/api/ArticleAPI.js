import {
  documentHelpers, includes, orderBy, without, copySelection, selectionHelpers,
  isArray, getKeyForPath
} from 'substance'
import { createValueModel } from '../../kit'
import TableEditingAPI from '../shared/TableEditingAPI'
import { importFigures } from '../articleHelpers'
import { findParentByType } from '../shared/nodeHelpers'
import renderEntity from '../shared/renderEntity'
import FigurePanel from '../nodes/FigurePanel'
import SupplementaryFile from '../nodes/SupplementaryFile'
import BlockFormula from '../nodes/BlockFormula'
import { INTERNAL_BIBR_TYPES } from '../ArticleConstants'
import FigureManager from '../shared/FigureManager'
import FootnoteManager from '../shared/FootnoteManager'
import FormulaManager from '../shared/FormulaManager'
import ReferenceManager from '../shared/ReferenceManager'
import TableManager from '../shared/TableManager'
import SupplementaryManager from '../shared/SupplementaryManager'
import ArticleModel from './ArticleModel'
import Footnote from '../nodes/Footnote'
import { InlineFormula, Xref, TableFigure, InlineGraphic } from '../nodes'

export default class ArticleAPI {
  constructor (editorSession, archive, config, contextProvider) {
    let doc = editorSession.getDocument()

    this.editorSession = editorSession
    this.config = config
    this.archive = archive
    this._contextProvider = contextProvider
    this._document = doc

    this._articleModel = new ArticleModel(this)
    this._valueModelCache = new Map()

    // TODO: rethink this
    // we created a sub-api for table manipulations in an attempt of modularisation
    this._tableApi = new TableEditingAPI(editorSession)

    // TODO: rethink this
    // Instead we should register these managers as a service, and instantiate on demand
    this._figureManager = new FigureManager(editorSession, config.getValue('figure-label-generator'))
    this._footnoteManager = new FootnoteManager(editorSession, config.getValue('footnote-label-generator'))
    this._formulaManager = new FormulaManager(editorSession, config.getValue('formula-label-generator'))
    this._referenceManager = new ReferenceManager(editorSession, config.getValue('reference-label-generator'))
    this._supplementaryManager = new SupplementaryManager(editorSession, config.getValue('supplementary-file-label-generator'))
    this._tableManager = new TableManager(editorSession, config.getValue('table-label-generator'))
  }

  getDocument () {
    return this._document
  }

  getEditorSession () {
    return this.editorSession
  }

  getSelection () {
    return this.editorSession.getSelection()
  }

  getArticleModel () {
    return this._articleModel
  }

  /**
   * Provides a model for a property of the document.
   *
   * @param {string|array} propKey path of a property as string or array
   */
  getValueModel (propKey) {
    if (isArray(propKey)) {
      propKey = getKeyForPath(propKey)
    }
    let valueModel = this._valueModelCache.get(propKey)
    if (!valueModel) {
      let doc = this.getDocument()
      let path = propKey.split('.')
      let prop = doc.getProperty(path)
      if (!prop) throw new Error('Property does not exist')
      valueModel = createValueModel(this, path, prop)
    }
    return valueModel
  }

  /**
   * Provides a sub-api for editing tables.
   */
  getTableAPI () {
    return this._tableApi
  }

  _getContainerPathForNode (node) {
    let last = node.getXpath()
    let prop = last.property
    let prev = last.prev
    if (prev && prop) {
      return [prev.id, prop]
    }
  }

  // EXPERIMENTAL: trying to derive a surfaceId for a property in a specific node
  // exploiting knowledge about the implemented view structure
  // in manuscript it is either top-level (e.g. title, abstract) or part of a container (body)
  _getSurfaceId (node, propertyName) {
    let xpath = node.getXpath().toArray()
    let idx = xpath.findIndex(entry => entry.id === 'body')
    let relXpath
    if (idx >= 0) {
      relXpath = xpath.slice(idx)
    } else {
      relXpath = xpath.slice(-1)
    }
    // the 'trace' is concatenated using '/' and the property name appended via '.'
    return relXpath.map(e => e.id).join('/') + '.' + propertyName
  }

  // EXPERIMENTAL need to figure out if we really need this
  // This is used by ManyRelationshipComponent (which is kind of weird)
  selectValue (path) {
    this._setSelection(this._createValueSelection(path))
  }

  selectFirstRequiredPropertyOfMetadataCard (nodeId) {
    this._setSelection(this._selectFirstRequiredPropertyOfMetadataCard(nodeId))
  }

  getAppState () {
    return this.getContext().appState
  }

  getContext () {
    return this._contextProvider.context
  }

  // TODO: we need a better way to update settings
  _loadSettings (settings) {
    let appState = this.getContext().appState
    appState.settings.load(settings)
    appState._setDirty('settings')
    appState.propagateUpdates()
  }

  // Basic editing

  copy () {
    if (this._tableApi.isTableSelected()) {
      return this._tableApi.copySelection()
    } else {
      const sel = this.getSelection()
      const doc = this.getDocument()
      if (sel && !sel.isNull() && !sel.isCollapsed()) {
        return copySelection(doc, sel)
      }
    }
  }

  cut () {
    if (this._tableApi.isTableSelected()) {
      return this._tableApi.cut()
    } else {
      const sel = this.getSelection()
      if (sel && !sel.isNull() && !sel.isCollapsed()) {
        let snippet = this.copy()
        this.deleteSelection()
        return snippet
      }
    }
  }

  dedent () {
    let editorSession = this.getEditorSession()
    editorSession.transaction(tx => {
      tx.dedent()
    })
  }

  deleteSelection (options) {
    const sel = this.getSelection()
    if (sel && !sel.isNull() && !sel.isCollapsed()) {
      this.editorSession.transaction(tx => {
        tx.deleteSelection(options)
      }, { action: 'deleteSelection' })
    }
  }

  indent () {
    let editorSession = this.getEditorSession()
    editorSession.transaction(tx => {
      tx.indent()
    })
  }

  insertText (text) {
    if (this._tableApi.isTableSelected()) {
      this._tableApi.insertText(text)
    } else {
      const sel = this.getSelection()
      if (sel && !sel.isNull()) {
        this.editorSession.transaction(tx => {
          tx.insertText(text)
        }, { action: 'insertText' })
      }
    }
  }

  paste (content, options) {
    // TODO: how could we modularise this, i.e. there could be other
    // types with a special paste support
    if (this._tableApi.isTableSelected()) {
      return this._tableApi.paste(content, options)
    } else {
      this.editorSession.transaction(tx => {
        tx.paste(content, options)
      }, { action: 'paste' })
      return true
    }
  }

  renderEntity (entity, options) {
    let exporter = this.config.createExporter('html')
    return renderEntity(entity, exporter)
  }

  selectNode (nodeId) {
    const editorSession = this.editorSession
    const doc = editorSession.getDocument()
    const node = doc.get(nodeId)
    if (node) {
      const sel = editorSession.getSelection()
      const containerPath = this._getContainerPathForNode(node)
      const surface = editorSession.surfaceManager._getSurfaceForProperty(containerPath)
      const surfaceId = surface ? surface.getId() : (sel ? sel.surfaceId : null)
      editorSession.setSelection({
        type: 'node',
        nodeId: node.id,
        containerPath,
        // TODO: we need a way to look up surfaceIds by path
        surfaceId
      })
    }
  }

  _appendChild (collectionPath, data) {
    this.editorSession.transaction(tx => {
      let node = tx.create(data)
      documentHelpers.append(tx, collectionPath, node.id)
    })
  }

  _deleteChild (collectionPath, child, txHook) {
    this.editorSession.transaction(tx => {
      documentHelpers.removeFromCollection(tx, collectionPath, child.id)
      documentHelpers.deepDeleteNode(tx, child)
      if (txHook) {
        txHook(tx)
      }
    })
  }

  _moveChild (collectionPath, child, shift, txHook) {
    this.editorSession.transaction(tx => {
      let ids = tx.get(collectionPath)
      let pos = ids.indexOf(child.id)
      if (pos === -1) return
      documentHelpers.removeAt(tx, collectionPath, pos)
      documentHelpers.insertAt(tx, collectionPath, pos + shift, child.id)
      if (txHook) {
        txHook(tx)
      }
    })
  }

  _createValueSelection (path) {
    return {
      type: 'custom',
      customType: 'value',
      nodeId: path[0],
      data: {
        path,
        propertyName: path[1]
      },
      surfaceId: path[0]
    }
  }

  // TODO: how could we make this extensible via plugins?
  _getAvailableXrefTargets (xref) {
    let refType = xref.refType
    let manager
    switch (refType) {
      case BlockFormula.refType: {
        manager = this._formulaManager
        break
      }
      case 'fig': {
        manager = this._figureManager
        break
      }
      case 'fn': {
        // EXPERIMENTAL: table footnotes
        // TableFootnoteManager is stored on the TableFigure instance
        let tableFigure = findParentByType(xref, 'table-figure')
        if (tableFigure) {
          manager = tableFigure.getFootnoteManager()
        } else {
          manager = this._footnoteManager
        }
        break
      }
      case 'table-fn': {
        let tableFigure = findParentByType(xref, 'table-figure')
        if (tableFigure) {
          manager = tableFigure.getFootnoteManager()
        }
        break
      }
      case 'bibr': {
        manager = this._referenceManager
        break
      }
      case 'table': {
        manager = this._tableManager
        break
      }
      case 'file': {
        manager = this._supplementaryManager
        break
      }
      default:
        throw new Error('Unsupported xref type: ' + refType)
    }
    if (!manager) return []

    let selectedTargets = xref.resolve('refTargets')
    // retrieve all possible nodes that this
    // xref could potentially point to,
    // so that we can let the user select from a list.
    let availableTargets = manager.getSortedCitables()
    let targets = availableTargets.map(target => {
      // ATTENTION: targets are not just nodes
      // but entries with some information
      return {
        selected: includes(selectedTargets, target),
        node: target,
        id: target.id
      }
    })
    // Determine broken targets (such that don't exist in the document)
    let brokenTargets = without(selectedTargets, ...availableTargets)
    if (brokenTargets.length > 0) {
      targets = targets.concat(brokenTargets.map(id => {
        return { selected: true, id }
      }))
    }
    // Makes the selected targets go to top
    targets = orderBy(targets, ['selected'], ['desc'])
    return targets
  }

  // EXPERIMENTAL
  // this is called by ManyRelationshipComponent and SingleRelationshipComponent to get
  // options for the selection
  // TODO: I am not sure if it is the right approach, trying to generalize this
  // Instead we could use dedicated Components derived from the ones from the kit
  // and use specific API to accomplish this
  _getAvailableOptions (model) {
    let targetTypes = Array.from(model._targetTypes)
    if (targetTypes.size !== 1) {
      throw new Error('Unsupported relationship. Expected to find one targetType')
    }
    let doc = this.getDocument()
    let first = targetTypes.values().next()
    let targetType = first.value
    switch (targetType) {
      case 'funder': {
        return doc.get('metadata').resolve('funders')
      }
      case 'organisation': {
        return doc.get('metadata').resolve('organisations')
      }
      case 'group': {
        return doc.get('metadata').resolve('groups')
      }
      default:
        throw new Error('Unsupported relationship: ' + targetType)
    }
  }

  _toggleRelationship (path, id) {
    this.editorSession.transaction(tx => {
      let ids = tx.get(path)
      let idx = ids.indexOf(id)
      if (idx === -1) {
        tx.update(path, { type: 'insert', pos: ids.length, value: id })
      } else {
        tx.update(path, { type: 'delete', pos: idx, value: id })
      }
      tx.setSelection(this._createValueSelection(path))
    })
  }

  _toggleXrefTarget (xref, targetId) {
    let targetIds = xref.refTargets
    let index = targetIds.indexOf(targetId)
    if (index >= 0) {
      this.editorSession.transaction(tx => {
        tx.update([xref.id, 'refTargets'], { type: 'delete', pos: index })
      })
    } else {
      this.editorSession.transaction(tx => {
        tx.update([xref.id, 'refTargets'], { type: 'insert', pos: targetIds.length, value: targetId })
      })
    }
  }

  _isFieldRequired (path) {
    // ATTENTION: this API is experimental
    let settings = this.getAppState().settings
    let valueSettings = settings.getSettingsForValue(path)
    return Boolean(valueSettings['required'])
  }

  _getFirstRequiredProperty (node) {
    // TODO: still not sure if this is the right approach
    // Maybe it would be simpler to just use configuration
    // and fall back to 'node' or 'card' selection otherwise
    let schema = node.getSchema()
    for (let p of schema) {
      if (p.name === 'id' || !this._isFieldRequired([node.type, p.name])) continue
      return p
    }
  }

  _setSelection (sel) {
    this.editorSession.setSelection(sel)
  }

  // TODO: can we improve this?
  // Here we would need a transaction on archive level, creating assets, plus placing them inside the article body.
  _insertFigures (files) {
    const articleSession = this.editorSession
    let paths = files.map(file => {
      return this.archive.addAsset(file)
    })
    let sel = articleSession.getSelection()
    if (!sel || !sel.containerPath) return
    articleSession.transaction(tx => {
      importFigures(tx, sel, files, paths)
    })
  }

  _replaceSupplementaryFile (file, supplementaryFile) {
    const articleSession = this.editorSession
    const path = this.archive.addAsset(file)
    articleSession.transaction(tx => {
      const mimeData = file.type.split('/')
      tx.set([supplementaryFile.id, 'mime-subtype'], mimeData[1])
      tx.set([supplementaryFile.id, 'mimetype'], mimeData[0])
      tx.set([supplementaryFile.id, 'href'], path)
    })
  }

  // # Actions

  addFigurePanel (figureId, file) {
    const doc = this.getDocument()
    const figure = doc.get(figureId)
    if (!figure) throw new Error('Figure does not exist')
    const pos = figure.getCurrentPanelIndex()
    const href = this.archive.addAsset(file)
    const insertPos = pos + 1
    // NOTE: with this method we are getting the structure of the active panel
    // to replicate it, currently only for metadata fields
    const panelTemplate = figure.getTemplateFromCurrentPanel()
    this.editorSession.transaction(tx => {
      let template = FigurePanel.getTemplate()
      template.content.href = href
      template.content.mimeType = file.type
      Object.assign(template, panelTemplate)
      let node = documentHelpers.createNodeFromJson(tx, template)
      documentHelpers.insertAt(tx, [figure.id, 'panels'], insertPos, node.id)
      tx.set([figure.id, 'state', 'currentPanelIndex'], insertPos)
    })
  }

  addReference (refData) {
    this.addReferences([refData])
  }

  addReferences (refsData) {
    let editorSession = this.getEditorSession()
    editorSession.transaction(tx => {
      let refNodes = refsData.map(refData => documentHelpers.createNodeFromJson(tx, refData))
      refNodes.forEach(ref => {
        documentHelpers.append(tx, ['article', 'references'], ref.id)
      })
      if (refNodes.length > 0) {
        let newSelection = this._selectFirstRequiredPropertyOfMetadataCard(refNodes[0])
        tx.setSelection(newSelection)
      }
    })
  }

  // TODO: it is not so common to add footnotes without an xref in the text
  addFootnote (footnoteCollectionPath) {
    let editorSession = this.getEditorSession()
    editorSession.transaction(tx => {
      let node = documentHelpers.createNodeFromJson(tx, Footnote.getTemplate())
      documentHelpers.append(tx, footnoteCollectionPath, node.id)
      let p = tx.get(node.content[0])
      tx.setSelection({
        type: 'property',
        path: p.getPath(),
        startOffset: 0,
        surfaceId: this._getSurfaceId(node, 'content'),
        containerPath: [node.id, 'content']
      })
    })
  }

  canInsertInlineGraphic () {
    return this.canInsertInlineNode(InlineGraphic.type)
  }

  insertInlineGraphic (file) {
    if (!this.canInsertInlineGraphic()) return
    const editorSession = this.getEditorSession()
    const sel = editorSession.getSelection()
    if (!sel) return
    const href = this.archive.addAsset(file)
    const mimeType = file.type
    editorSession.transaction(tx => {
      const node = tx.create({
        type: InlineGraphic.type,
        mimeType,
        href
      })
      tx.insertInlineNode(node)
      tx.setSelection(node.getSelection())
    })
  }

  canInsertCrossReference () {
    return this.canInsertInlineNode(Xref.type, true)
  }

  insertCrossReference (refType) {
    if (!this.canInsertCrossReference()) throw new Error('Invalid manipulation.')
    this._insertCrossReference(refType)
  }

  insertFootnoteReference () {
    if (!this.canInsertCrossReference()) throw new Error('Invalid manipulation.')
    // In table-figures we want to allow only cross-reference to table-footnotes
    let selectionState = this.getAppState().selectionState
    const xpath = selectionState.xpath
    let refType = xpath.find(n => n.type === TableFigure.type) ? 'table-fn' : 'fn'
    this._insertCrossReference(refType)
  }

  _insertCrossReference (refType) {
    this._insertInlineNode(tx => {
      return tx.create({
        type: Xref.type,
        refType
      })
    })
  }

  insertInlineFormula (content) {
    if (!this.canInsertInlineNode(InlineFormula.type)) throw new Error('Invalid manipulation.')
    this._insertInlineNode(tx => {
      return tx.create({
        type: InlineFormula.type,
        contentType: 'math/tex',
        content
      })
    })
  }

  /**
   * Checks if an inline node can be inserted for the current selection.
   *
   * @param {string} type the type of the inline node
   * @param {boolean} collapsedOnly true if insertion is allowed only for collapsed selection
   */
  canInsertInlineNode (type, collapsedOnly) {
    let appState = this.getAppState()
    const sel = appState.selection
    const selectionState = appState.selectionState
    if (sel && !sel.isNull() && sel.isPropertySelection() && (!collapsedOnly || sel.isCollapsed())) {
      // make sure that the schema allows to insert that node
      let targetTypes = selectionState.property.targetTypes
      if (targetTypes.size > 0 && targetTypes.has(type)) {
        return true
      }
    }
    return false
  }

  _insertInlineNode (createNode) {
    let editorSession = this.getEditorSession()
    editorSession.transaction(tx => {
      let inlineNode = createNode(tx)
      tx.insertInlineNode(inlineNode)
      // TODO: some inline nodes have an input field
      // which we might want to focus initially
      // instead of selecting the whole node
      tx.setSelection(this._selectInlineNode(inlineNode))
    })
  }

  _selectInlineNode (inlineNode) {
    return {
      type: 'property',
      path: inlineNode.getPath(),
      startOffset: inlineNode.start.offset,
      endOffset: inlineNode.end.offset
    }
  }

  insertSupplementaryFile (file, url) {
    const articleSession = this.editorSession
    if (file) url = this.archive.addAsset(file)
    let sel = articleSession.getSelection()
    articleSession.transaction(tx => {
      let containerPath = sel.containerPath
      let nodeData = SupplementaryFile.getTemplate()
      nodeData.mimetype = file ? file.type : ''
      nodeData.href = url
      nodeData.remote = !file
      let supplementaryFile = documentHelpers.createNodeFromJson(tx, nodeData)
      tx.insertBlockNode(supplementaryFile)
      selectionHelpers.selectNode(tx, supplementaryFile.id, containerPath)
    })
  }

  removeFootnote (footnoteId) {
    // ATTENTION: footnotes appear in different contexts
    // e.g. article.footnotes, or table-fig.footnotes
    let doc = this.getDocument()
    let footnote = doc.get(footnoteId)
    let parent = footnote.getParent()
    this._removeItemFromCollection(footnoteId, [parent.id, 'footnotes'])
  }

  _removeItemFromCollection (itemId, collectionPath) {
    const editorSession = this.getEditorSession()
    editorSession.transaction(tx => {
      let item = tx.get(itemId)
      documentHelpers.removeFromCollection(tx, collectionPath, itemId)
      this._removeCorrespondingXrefs(tx, item)
      documentHelpers.deepDeleteNode(tx, itemId)
      tx.selection = null
    })
  }

  // This method is used to cleanup xref targets
  // during footnote or reference removing
  _removeCorrespondingXrefs (tx, node) {
    let manager
    if (INTERNAL_BIBR_TYPES.indexOf(node.type) > -1) {
      manager = this._referenceManager
    } else if (node.type === 'footnote') {
      manager = this._footnoteManager
    } else {
      return
    }
    manager._getXrefs().forEach(xref => {
      const index = xref.refTargets.indexOf(node.id)
      if (index > -1) {
        tx.update([xref.id, 'refTargets'], { type: 'delete', pos: index })
      }
    })
  }

  replaceFile (hrefPath, file) {
    const articleSession = this.editorSession
    const path = this.archive.addAsset(file)
    articleSession.transaction(tx => {
      tx.set(hrefPath, path)
    })
  }

  switchFigurePanel (figure, newPanelIndex) {
    const editorSession = this.editorSession
    let sel = editorSession.getSelection()
    if (!sel.isNodeSelection() || sel.getNodeId() !== figure.id) {
      this.selectNode(figure.id)
    }
    editorSession.updateNodeStates([[figure.id, { currentPanelIndex: newPanelIndex }]], { propagate: true })
  }
}
