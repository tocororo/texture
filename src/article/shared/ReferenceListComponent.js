import { Component } from 'substance'
import { Button } from '../../kit'

export default class ReferenceListComponent extends Component {
  getInitialState () {
    let bibliography = this._getBibliography()
    return {
      hidden: (bibliography.length === 0)
    }
  }

  render ($$) {
    const RefComponent = this.getComponent('ref')
    const bibliography = this._getBibliography()

    let el = $$('div').addClass('sc-ref-list')
      .attr('data-id', 'ref-list')

    if (this.state.hidden) {
      el.addClass('sm-hidden')
      return el
    }

    if (bibliography.length > 0) {
      el.append(
        $$('div').addClass('se-title').append(
          this.getLabel('references')
        )
      )
    }

    // ATTENTION: bibliography still works with document nodes
    bibliography.forEach(referenceNode => {
      el.append(
        $$('div').addClass('se-ref-item').append(
          $$(RefComponent, { node: referenceNode }),
          $$('div').addClass('se-ref-actions').append(
            $$(Button, {icon: 'pencil', tooltip: this.getLabel('edit-ref')})
              .on('click', this._editReference.bind(this, referenceNode)),
            $$(Button, {icon: 'trash', tooltip: this.getLabel('remove-ref')})
              .on('click', this._removeReference.bind(this, referenceNode))
          )
        )
      )
    })

    let options = $$('div').addClass('se-ref-list-options').append(
      $$('button').addClass('sc-button sm-style-big').append(
        this.getLabel('add-ref')
      ).on('click', this._addNewReference)
    )

    el.append(options)

    return el
  }

  _addNewReference () {
    console.error('TODO: implement ReferenceListComponent._addNewReference()')
  }

  _editReference (reference) {
    console.error('TODO: implement ReferenceListComponent._editReference()')
  }

  _removeReference (reference) {
    console.error('TODO: implement ReferenceListComponent._editReference()')
  }

  _getBibliography () {
    const api = this.context.api
    const referenceManager = api.getReferenceManager()
    return referenceManager.getBibliography()
  }
}
