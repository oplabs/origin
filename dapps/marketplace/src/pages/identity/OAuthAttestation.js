import React, { Component } from 'react'
import { Query, Mutation } from 'react-apollo'
import get from 'lodash/get'
import { fbt } from 'fbt-runtime'
import { withRouter } from 'react-router-dom'

import withIsMobile from 'hoc/withIsMobile'

import Modal from 'components/Modal'
import MobileModal from 'components/MobileModal'
import AutoMutate from 'components/AutoMutate'

import VerifyOAuthAttestation from 'mutations/VerifyOAuthAttestation'
import query from 'queries/GetAuthUrl'

import { getProviderDisplayName } from 'utils/profileTools'

function InfoStoredOnChain({ provider, isMobile }) {
  const providerName = getProviderDisplayName(provider)

  let content = (
    <fbt desc="OAuthAttestation.verify.explanation">
      Other users will know that you have a verified{' '}
      <fbt:param name="provider">{providerName}</fbt:param> account, but your
      account details will not be published on the blockchain. We will never
      post on your behalf.
    </fbt>
  )

  let classList = ''

  switch (provider) {
    case 'facebook':
      content = (
        <fbt desc="OAuthAttestation.facebookOnChain">
          That you have a verified Facebook account but NOT any information
          about you or your friends
        </fbt>
      )
      break

    case 'twitter':
      classList += ' yellow'
      content = (
        <fbt desc="OAuthAttestation.twitterOnChain">Your Twitter username</fbt>
      )
      break
  }

  if (isMobile) {
    return (
      <div className={`info mt-auto${classList}`}>
        <span className="title">
          <fbt desc="OAuthAttestation.visibleOnBlockchain">
            What will be visible on the blockchain?
          </fbt>
        </span>
        {content}
      </div>
    )
  }

  return <div className="help">{content}</div>
}

class OAuthAttestation extends Component {
  constructor(props) {
    super(props)
    this.state = {
      stage: 'GenerateCode'
    }
  }

  componentDidUpdate(prevProps, prevState) {
    const didOpen = !prevProps.open && this.props.open,
      didChangeStage = prevState.stage !== this.state.stage
    if (this.inputRef && (didOpen || didChangeStage)) {
      this.inputRef.focus()
    }
  }

  isMobile() {
    return this.props.ismobile === 'true'
  }

  render() {
    if (!this.props.open) {
      return null
    }

    const isMobile = this.isMobile()

    const { origin, pathname } = window.location
    const { provider } = this.props
    const redirect = isMobile
      ? encodeURIComponent(`${origin}${pathname}#/profile/${provider}`)
      : null

    const ModalComp = isMobile ? MobileModal : Modal

    return (
      <ModalComp
        title={
          <fbt desc="OAuthAttestation.verifyAccount">
            Verify{' '}
            <fbt:param name="provider">
              {getProviderDisplayName(provider)}
            </fbt:param>{' '}
            Account
          </fbt>
        }
        className={`${provider} attestation-modal oauth${
          this.state.stage === 'VerifiedOK' ? ' success' : ''
        }`}
        shouldClose={this.state.shouldClose}
        onClose={() => {
          this.setState({
            shouldClose: false,
            error: false,
            stage: 'GenerateCode'
          })
          this.props.onClose()
          this.props.history.replace('/profile')
        }}
      >
        <Query
          query={query}
          variables={{ redirect, provider }}
          fetchPolicy="network-only"
          skip={get(this.props, 'match.params.attestation') ? true : false}
        >
          {({ data }) => {
            const authUrl = get(data, 'identityEvents.GetAuthUrl')
            return (
              <div>
                {this[`render${this.state.stage}`]({
                  authUrl,
                  redirect
                })}
              </div>
            )
          }}
        </Query>
      </ModalComp>
    )
  }

  renderGenerateCode({ authUrl, redirect }) {
    const isMobile = this.isMobile()

    const providerName = getProviderDisplayName(this.props.provider)

    const header = isMobile ? (
      <fbt desc="OAuthAttestation.tapToBegin">
        Tap the button below to begin.
      </fbt>
    ) : (
      <fbt desc="OAuthAttestation.verify">
        Verify your <fbt:param name="provider">{providerName}</fbt:param>{' '}
        Account
      </fbt>
    )

    let helpContent = (
      <fbt desc="OAuthAttestation.verify.explanation">
        Other users will know that you have a verified{' '}
        <fbt:param name="provider">{providerName}</fbt:param> account, but your
        account details will not be published on the blockchain. We will never
        post on your behalf.
      </fbt>
    )

    helpContent = isMobile ? (
      <div className={`info mt-auto`}>
        <span className="title">
          <fbt desc="OAuthAttestation.visibleOnBlockchain">
            What will be visible on the blockchain?
          </fbt>
        </span>
        {helpContent}
      </div>
    ) : (
      <div className="help">{helpContent}</div>
    )

    return (
      <>
        <h2>{header}</h2>
        {!isMobile ? null : (
          <div className="help mt-0 mb-3">
            <fbt desc="OAuthAttestation.neverPost">
              We will never post on your behalf.
            </fbt>
          </div>
        )}
        {this.state.error && (
          <div className="alert alert-danger mt-3">{this.state.error}</div>
        )}
        {helpContent}
        <div className="actions mt-5">
          {this.renderVerifyButton({ authUrl, redirect })}
          <button
            className="btn btn-link"
            onClick={() => this.setState({ shouldClose: true })}
            children={fbt('Cancel', 'Cancel')}
          />
        </div>
      </>
    )
  }

  renderVerifyButton({ authUrl, redirect }) {
    const matchSid = window.location.href.match(/sid=([a-zA-Z0-9_-]+)/i)
    const sid = matchSid && matchSid[1] ? matchSid[1] : null
    const isMobile = this.isMobile()

    return (
      <Mutation
        mutation={VerifyOAuthAttestation}
        onCompleted={res => {
          const result = res.verifyOAuthAttestation
          if (result.success) {
            this.setState({
              stage: 'VerifiedOK',
              data: result.data,
              loading: false
            })
            this.props.history.replace('/profile')
          } else {
            this.setState({ error: result.reason, loading: false })
          }
        }}
        onError={errorData => {
          console.error('Error', errorData)
          this.setState({ error: 'Check console', loading: false })
        }}
      >
        {verifyCode => {
          const runMutation = () => {
            if (this.state.loading) return
            this.setState({ error: false, loading: true })
            verifyCode({
              variables: {
                provider: this.props.provider,
                identity: this.props.wallet,
                redirect,
                authUrl,
                code: sid
              }
            })
          }
          return (
            <>
              {sid && this.props.wallet ? (
                <AutoMutate mutatation={runMutation} />
              ) : null}
              <button
                className={`btn ${
                  isMobile ? 'btn-primary' : 'btn-outline-light'
                }`}
                onClick={runMutation}
                children={
                  this.state.loading
                    ? fbt('Loading...', 'Loading...')
                    : fbt('Continue', 'Continue')
                }
              />
            </>
          )
        }}
      </Mutation>
    )
  }

  renderVerifiedOK() {
    const providerName = getProviderDisplayName(this.props.provider)
    const isMobile = this.isMobile()

    return (
      <>
        <h2>
          <fbt desc="OAuthAttestation.verified">
            <fbt:param name="provider">{providerName}</fbt:param> account
            verified!
          </fbt>
        </h2>
        <div className="instructions">
          <fbt desc="Attestation.DontForget">
            Don&apos;t forget to publish your changes.
          </fbt>
        </div>
        <InfoStoredOnChain provider={this.props.provider} isMobile={isMobile} />
        <div className="actions mt-5">
          <button
            className={`btn ${isMobile ? 'btn-primary' : 'btn-outline-light'}`}
            onClick={() => {
              this.props.onComplete(this.state.data)
              this.setState({ shouldClose: true })
            }}
            children={fbt('Continue', 'Continue')}
          />
        </div>
      </>
    )
  }
}

export default withIsMobile(withRouter(OAuthAttestation))

require('react-styl')(`
  .mobile-modal-light .attestation-modal.oauth:not(.success) h2
    padding-top: 9rem
`)
