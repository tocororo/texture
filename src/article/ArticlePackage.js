import { BasePackage } from '../shared'

import ArticleConfigurator from './ArticleConfigurator'

import ModelPackage from './ArticleModelPackage'
import EditorPackage from './editor/EditorPackage'
import MetadataPackage from './metadata/MetadataPackage'
import ReaderPackage from './reader/ReaderPackage'

import ArticlePanel from './ArticlePanel'
import ManuscriptEditor from './editor/ManuscriptEditor'
import MetadataEditor from './metadata/MetadataEditor'

export default {
  name: 'Article',
  configure (parentConfig) {
    parentConfig.addComponent('article', ArticlePanel)
    // create a configuration scope
    let config = parentConfig.createScope('article')

    // used during import
    let modelConfig = new ArticleConfigurator().import(ModelPackage)
    config.setConfiguration('model', modelConfig)
    // used for the manuscript editor view
    let manuscriptEditorConfig = ArticleConfigurator.createFrom(modelConfig).import(EditorPackage)
    config.setConfiguration('manuscript', manuscriptEditorConfig)
    // used for the metadata editor view
    let metadataEditorConfig = ArticleConfigurator.createFrom(modelConfig).import(MetadataPackage)
    config.setConfiguration('metadata', metadataEditorConfig)
    // used for preview
    let previewConfig = ArticleConfigurator.createFrom(modelConfig).import(ReaderPackage)
    config.setConfiguration('preview', previewConfig)

    config.import(BasePackage)
    // UI stuff for the ArticlePanel
    config.addComponent('manuscript-editor', ManuscriptEditor)
    config.addComponent('metadata-editor', MetadataEditor)

    config.addToolPanel('nav-bar', [
      {
        name: 'views',
        type: 'tool-dropdown',
        showDisabled: true,
        style: 'descriptive',
        items: [
          { type: 'command-group', name: 'switch-view' }
        ]
      }
    ])

    // config.addCommand('open-manuscript', SwitchViewCommand, {
    //   view: 'manuscript',
    //   commandGroup: 'switch-view'
    // })
    // config.addCommand('open-metadata', SwitchViewCommand, {
    //   view: 'metadata',
    //   commandGroup: 'switch-view'
    // })

    config.addViewMode({
      name: 'open-manuscript',
      view: 'manuscript',
      commandGroup: 'switch-view',
      icon: 'fa-align-left',
      label: 'Open Manuscript'
    })

    config.addViewMode({
      name: 'open-metadata',
      view: 'metadata',
      commandGroup: 'switch-view',
      icon: 'fa-th-list',
      label: 'Open Metadata'
    })

    // config.addTool('open-manuscript', ToggleTool)
    // config.addLabel('open-manuscript', 'Open Manuscript')
    // config.addIcon('open-manuscript', { 'fontawesome': 'fa-align-left' })

    // config.addTool('open-metadata', ToggleTool)
    // config.addLabel('open-metadata', 'Open Metadata')
    // config.addIcon('open-metadata', { 'fontawesome': 'fa-th-list' })
  }
}
