import React, { Component } from 'react'
import { Mutation, withApollo } from 'react-apollo'
import { fbt } from 'fbt-runtime'

import DeployIdentityMutation from 'mutations/DeployIdentity'

import TransactionError from 'components/TransactionError'
import WaitForTransaction from 'components/WaitForTransaction'

import withCanTransact from 'hoc/withCanTransact'
import withWallet from 'hoc/withWallet'
import AutoMutate from 'components/AutoMutate'

class DeployIdentity extends Component {
  state = {}
  render() {
    return (
      <Mutation
        mutation={DeployIdentityMutation}
        onCompleted={({ deployIdentity }) =>
          this.setState({ waitFor: deployIdentity.id, mutationCompleted: true })
        }
        onError={errorData =>
          this.setState({ waitFor: false, error: 'mutation', errorData })
        }
      >
        {upsertIdentity => (
          <>
            <button
              className={`${this.props.className} ${
                this.props.disabled ? 'disabled' : ''
              }`}
              onClick={() => {
                if (this.props.disabled) {
                  return
                }

                let canDeploy = true
                if (this.props.validate) {
                  canDeploy = this.props.validate()
                }
                if (canDeploy) {
                  this.onClick(upsertIdentity)
                }
              }}
              children={this.props.children}
            />
            {this.renderWaitModal()}
            {this.state.error && (
              <TransactionError
                reason={this.state.error}
                data={this.state.errorData}
                onClose={() => this.setState({ error: false })}
              />
            )}
          </>
        )}
      </Mutation>
    )
  }

  onClick(upsertIdentity) {
    if (this.props.cannotTransact) {
      this.setState({
        error: this.props.cannotTransact,
        errorData: this.props.cannotTransactData
      })
      return
    }

    this.setState({ waitFor: 'pending' })
    const profile = this.props.profile
    const variables = {
      from: this.props.walletProxy,
      attestations: this.props.attestations,
      profile
    }

    upsertIdentity({ variables })
  }

  renderWaitModal() {
    if (!this.state.waitFor) return null

    const { skipSuccessScreen } = this.props
    const content = skipSuccessScreen ? (
      <AutoMutate
        mutatation={() => {
          this.setState({
            shouldClose: true
          })
        }}
      />
    ) : (
      <div className="make-offer-modal">
        <div className="success-icon" />
        <div>
          <fbt desc="success">Success!</fbt>
        </div>
        <button
          className="btn btn-outline-light"
          onClick={async () => {
            this.setState({ shouldClose: true })
          }}
          children={fbt('OK', 'OK')}
        />
      </div>
    )

    return (
      <WaitForTransaction
        shouldClose={this.state.shouldClose}
        onClose={() => {
          if (this.props.refetch) {
            this.props.refetch()
          }
          if (this.props.refetchObservables !== false) {
            this.props.client.reFetchObservableQueries()
          }
          this.setState({ waitFor: false, error: false, shouldClose: false })
          if (this.props.onComplete && this.state.mutationCompleted) {
            this.props.onComplete()
          }
        }}
        hash={this.state.waitFor}
        event="IdentityUpdated"
      >
        {() => content}
      </WaitForTransaction>
    )
  }
}

export default withApollo(withWallet(withCanTransact(DeployIdentity)))
