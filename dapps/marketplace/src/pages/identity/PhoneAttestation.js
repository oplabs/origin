import React, { Component } from 'react'
import { Mutation } from 'react-apollo'
import pick from 'lodash/pick'
import { fbt } from 'fbt-runtime'

import withIsMobile from 'hoc/withIsMobile'
import withWallet from 'hoc/withWallet'

import Modal from 'components/Modal'
import MobileModal from 'components/MobileModal'
import CountryDropdown from './_CountryDropdown'

import GeneratePhoneCodeMutation from 'mutations/GeneratePhoneCode'
import VerifyPhoneCodeMutation from 'mutations/VerifyPhoneCode'

class PhoneAttestation extends Component {
  state = {
    active: 'us',
    dropdown: true,
    stage: 'GenerateCode',
    phone: '',
    code: '',
    prefix: '1',
    method: 'sms'
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

    const ModalComponent = this.isMobile() ? MobileModal : Modal

    return (
      <ModalComponent
        title={fbt('Verify Phone Number', 'PhoneAttestation.verifyPhoneNumber')}
        className={`attestation-modal phone${
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
        }}
      >
        <div>{this[`render${this.state.stage}`]()}</div>
      </ModalComponent>
    )
  }

  renderGenerateCode() {
    const isMobile = this.isMobile()

    const header = isMobile ? null : (
      <fbt desc="PhoneAttestation.title">Verify your Phone Number</fbt>
    )

    const descEl = isMobile ? (
      <fbt desc="PhoneAttestation.mobile.description">
        Enter a valid 10-digit phone number
      </fbt>
    ) : (
      <fbt desc="PhoneAttestation.description">
        Enter your phone number below and OriginID will send you a verification
        code via SMS.
      </fbt>
    )

    const storedOnBlockchain = isMobile ? (
      <div className="info mt-3 mb-3">
        <span className="title">
          <fbt desc="PhoneAttestation.visibleOnBlockchain">
            What will be visible on the blockchain?
          </fbt>
        </span>
        <fbt desc="PhoneAttestation.verifiedButNotNumber">
          That you have a verified phone number, but NOT your actual phone
          number
        </fbt>
      </div>
    ) : null

    return (
      <Mutation
        mutation={GeneratePhoneCodeMutation}
        onCompleted={res => {
          const result = res.generatePhoneCode
          if (result.success) {
            this.setState({ stage: 'VerifyCode', loading: false })
          } else {
            this.setState({ error: result.reason, loading: false })
          }
        }}
        onError={errorData => {
          console.error('Error', errorData)
          this.setState({ error: 'Check console' })
        }}
      >
        {generateCode => (
          <form
            onSubmit={e => {
              e.preventDefault()
              if (this.state.loading) return
              this.setState({ error: false, loading: true })
              generateCode({
                variables: pick(this.state, ['prefix', 'method', 'phone'])
              })
            }}
          >
            <h2>{header}</h2>
            <div className="instructions">{descEl}</div>
            <div className="d-flex mt-3">
              <CountryDropdown
                onChange={({ code, prefix }) =>
                  this.setState({ active: code, prefix })
                }
                active={this.state.active}
              />
              <div className="form-control-wrap">
                <input
                  type="tel"
                  ref={ref => (this.inputRef = ref)}
                  className="form-control form-control-lg"
                  placeholder="Area code and phone number"
                  value={this.state.phone}
                  onChange={e => this.setState({ phone: e.target.value })}
                />
              </div>
            </div>
            {this.state.error && (
              <div className="alert alert-danger mt-3">{this.state.error}</div>
            )}
            <div className="help">
              <fbt desc="Attestation.phonePublishClarification">
                By verifying your phone number, you give Origin permission to
                send you occasional text messages such as notifications about
                your transactions.
              </fbt>
            </div>
            {storedOnBlockchain}
            <div className="actions">
              <button
                type="submit"
                className={`btn ${
                  isMobile ? 'btn-primary' : 'btn-outline-light'
                }`}
                disabled={this.state.loading}
                children={
                  this.state.loading
                    ? fbt('Loading...', 'Loading...')
                    : fbt('Continue', 'Continue')
                }
              />
              {!isMobile && (
                <button
                  className="btn btn-link"
                  type="button"
                  onClick={() => this.setState({ shouldClose: true })}
                  children={fbt('Cancel', 'Cancel')}
                />
              )}
            </div>
          </form>
        )}
      </Mutation>
    )
  }

  renderVerifyCode() {
    const isMobile = this.isMobile()

    const storedOnBlockchain = isMobile ? (
      <div className="info mt-3 mb-3">
        <span className="title">
          <fbt desc="PhoneAttestation.visibleOnBlockchain">
            What will be visible on the blockchain?
          </fbt>
        </span>
        <fbt desc="PhoneAttestation.verifiedButNotNumber">
          That you have a verified phone number, but NOT your actual phone
          number
        </fbt>
      </div>
    ) : null

    return (
      <Mutation
        mutation={VerifyPhoneCodeMutation}
        onCompleted={res => {
          const result = res.verifyPhoneCode
          if (result.success) {
            this.setState({
              stage: 'VerifiedOK',
              data: result.data,
              loading: false
            })
          } else {
            this.setState({ error: result.reason, loading: false })
          }
        }}
        onError={errorData => {
          console.error('Error', errorData)
          this.setState({ error: 'Check console', loading: false })
        }}
      >
        {verifyCode => (
          <form
            onSubmit={e => {
              e.preventDefault()
              if (this.state.loading) return
              this.setState({ error: false, loading: true })

              const trimmedCode = this.state.code.trim()

              if (trimmedCode.length === 0) {
                this.setState({
                  error: 'Verification code is required',
                  loading: false
                })
                return
              }

              if (trimmedCode.length !== 6 || isNaN(trimmedCode)) {
                this.setState({
                  error: 'Verification code should be a 6 digit number',
                  loading: false
                })
                return
              }

              verifyCode({
                variables: {
                  identity: this.props.wallet,
                  prefix: this.state.prefix,
                  phone: this.state.phone,
                  code: this.state.code
                }
              })
            }}
          >
            <h2>
              <fbt desc="PhoneAttestation.title">Verify your Phone Number</fbt>
            </h2>
            <div className="instructions">
              <fbt desc="PhoneAttestation.enterCode">
                Enter the code we sent you below
              </fbt>
            </div>
            <div className="my-3 verification-code">
              <input
                type="tel"
                maxLength="6"
                ref={ref => (this.inputRef = ref)}
                className="form-control form-control-lg"
                placeholder="Verification code"
                value={this.state.code}
                onChange={e => this.setState({ code: e.target.value })}
              />
              {this.state.error && (
                <div className="alert alert-danger mt-3">
                  {this.state.error}
                </div>
              )}
            </div>
            {storedOnBlockchain}
            <div className="actions">
              <button
                type="submit"
                className={`btn ${
                  isMobile ? 'btn-primary' : 'btn-outline-light'
                }`}
                disabled={this.state.loading}
                children={
                  this.state.loading
                    ? fbt('Loading...', 'Loading...')
                    : fbt('Continue', 'Continue')
                }
              />
              {!isMobile && (
                <button
                  className="btn btn-link"
                  type="button"
                  onClick={() => this.setState({ shouldClose: true })}
                  children={fbt('Cancel', 'Cancel')}
                />
              )}
            </div>
          </form>
        )}
      </Mutation>
    )
  }

  renderVerifiedOK() {
    const isMobile = this.isMobile()

    return (
      <>
        <h2>
          <fbt desc="PhoneAttestation.verified">Phone number verified!</fbt>
        </h2>
        <div className="instructions">
          <fbt desc="Attestation.DontForget">
            Don&apos;t forget to publish your changes.
          </fbt>
        </div>
        <div className="help">
          <fbt desc="Attestation.publishingBlockchain">
            Publishing to the blockchain lets other users know that you have a
            verified profile.
          </fbt>
        </div>
        <div className="actions">
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

export default withWallet(withIsMobile(PhoneAttestation))

require('react-styl')(`
  .attestation-modal
    padding-bottom: 1.5rem !important
    > div
      h2
        background: url(images/identity/verification-shape-grey.svg) no-repeat center
        background-size: 7rem
        padding-top: 9rem
        background-position: center top
        position: relative
        &::before
          content: ""
          position: absolute
          top: 0
          left: 0
          height: 7.5rem
          right: 0
          background-repeat: no-repeat
          background-position: center
      font-size: 18px
      .form-control-wrap
        flex: 1
      .form-control
        background-color: var(--dark-two)
        border: 0
        color: var(--white)
        &::-webkit-input-placeholder
          color: var(--dusk)
      .help
        font-size: 14px
        margin-top: 1rem
      .verification-code
        display: flex
        flex-direction: column
        align-items: center
        .form-control
          text-align: center
      .actions
        display: flex
        flex-direction: column !important
        align-items: center
        margin-top: 1.5rem
        .btn-link
          text-decoration: none
      form
        display: flex
        flex: auto
        flex-direction: column
    &.phone
      > div
        .verification-code
          max-width: 15rem
    &.phone > div h2::before
      background-image: url(images/identity/phone-icon-dark.svg)
      background-size: 2rem
    &.email > div h2::before
      background-image: url(images/identity/email-icon-dark.svg)
      background-size: 3.5rem
    &.facebook > div h2::before
      background-image: url(images/identity/facebook-icon-dark.svg)
      background-size: 2rem
    &.twitter > div h2::before
      background-image: url(images/identity/twitter-icon-dark.svg)
      background-size: 3.5rem
    &.airbnb > div h2::before
      background-image: url(images/identity/airbnb-icon-dark.svg)
      background-size: 4rem
    &.google > div h2::before
      background-image: url(images/identity/google-icon-dark.svg)
      background-size: 4rem
    &.website > div h2::before
      background-image: url(images/identity/website-icon-dark.svg)
      background-size: 4rem
    &.kakao > div h2::before
      background-image: url(images/identity/kakao-icon-large-dark.svg)
      background-size: 4rem
    &.github > div h2::before
      background-image: url(images/identity/github-icon-large-dark.svg)
      background-size: 4rem
    &.linkedin > div h2::before
      background-image: url(images/identity/linkedin-icon-large-dark.svg)
      background-size: 4rem
    &.wechat > div h2::before
      background-image: url(images/identity/wechat-icon-large-dark.svg)
      background-size: 4rem

    &.success
      > div
        h2
          color: var(--greenblue)
          background-image: url(images/circular-check-button.svg)
          background-size: 3.5rem
          padding-top: 5rem
          &::before
            background-image: none
        .actions
          margin-bottom: 1.5rem

  .mobile-modal-light .attestation-modal
    padding: 20px
    text-align: center
    h2
      padding-top: 7.5rem
    .btn
      width: 100%
      border-radius: 2rem
      padding: 0.75rem
    .verification-code .form-control
      display: inline-block
    .country-code, .form-control
      border: solid 1px #c2cbd3
      background-color: var(--white)
      color: black
    .dropdown .dropdown-menu
      border: solid 1px #c2cbd3
      background-color: var(--white)
      .dropdown-item
        .name
          color: black
        .prefix
          color: #6f8294
        &:hover
          background-color: var(--light-footer)
    .info
      text-align: center
      border-radius: 5px
      border: solid 1px var(--bluey-grey)
      background-color: rgba(152, 167, 180, 0.1)
      font-family: Lato
      font-size: 14px
      color: black
      padding: 10px
      margin-top: 1rem
      .title
        display: block
        font-weight: bold
        margin-bottom: 3px
    &.phone > div h2::before
      background-image: url(images/identity/phone-icon-light.svg)
    &.email > div h2::before
      background-image: url(images/identity/email-icon-light.svg)
    &.facebook > div h2::before
      background-image: url(images/identity/facebook-icon-light.svg)
    &.twitter > div h2::before
      background-image: url(images/identity/twitter-icon-light.svg)
    &.airbnb > div h2::before
      background-image: url(images/identity/airbnb-icon-light.svg)
    &.google > div h2::before
      background-image: url(images/identity/google-icon.svg)
    &.website > div h2::before
      background-image: url(images/identity/website-icon-light.svg)
    &.kakao > div h2::before
      background-image: url(images/identity/kakao-icon-large.svg)
    &.github > div h2::before
      background-image: url(images/identity/github-icon-large.svg)
    &.linkedin > div h2::before
      background-image: url(images/identity/linkedin-icon-large.svg)
    &.wechat > div h2::before
      background-image: url(images/identity/wechat-icon-large.svg)

    > div
      flex: auto
      display: flex
      flex-direction: column
  
    &.success > div h2::before
      background-image: none
`)
