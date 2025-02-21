import React from 'react'
import { Query } from 'react-apollo'
import get from 'lodash/get'
import { fbt } from 'fbt-runtime'

import query from 'queries/Identity'
import Reviews from 'components/Reviews'
import Avatar from 'components/Avatar'
import DocumentTitle from 'components/DocumentTitle'
import QueryError from 'components/QueryError'
import LoadingSpinner from 'components/LoadingSpinner'
import FormattedDescription from 'components/FormattedDescription'

import UserListings from './_UserListings'
import { getProviderDisplayName } from 'utils/profileTools'

const User = ({ match }) => {
  const id = match.params.id
  const vars = { id: match.params.id }
  return (
    <div className="container user-profile">
      <Query query={query} variables={vars}>
        {({ data, loading, error }) => {
          if (error) {
            return <QueryError error={error} query={query} vars={vars} />
          }
          if (loading) return <LoadingSpinner />

          const profile = get(data, 'web3.account.identity') || {}
          const verifiedAttestations = profile.verifiedAttestations

          const noVerifications =
            !verifiedAttestations || verifiedAttestations.length === 0

          return (
            <>
              <DocumentTitle
                pageTitle={
                  profile.fullName || fbt('Unnamed User', 'User.title')
                }
              />
              <div className="row">
                <div className="col-lg-2 col-md-3">
                  <div className="avatar-wrap">
                    <Avatar profile={profile} className="main-avatar" />
                  </div>
                  {noVerifications ? null : (
                    <div className="verified-info">
                      <h5>
                        <fbt desc="User.verifiedInfo">Verified Info</fbt>
                      </h5>
                      {verifiedAttestations.map(attestation => (
                        <div key={attestation.id}>
                          <div className={`attestation ${attestation.id}`} />
                          {getProviderDisplayName(attestation.id)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="col-lg-10 col-md-9">
                  <h1 className="mb-0">
                    {profile.fullName || fbt('Unnamed User', 'User.unamedUser')}
                  </h1>
                  <div className="description">
                    {profile.description ? (
                      <FormattedDescription text={profile.description} />
                    ) : (
                      fbt('No description', 'User.noDescription')
                    )}
                  </div>

                  <UserListings user={id} />
                  <Reviews id={id} hideWhenZero />
                </div>
              </div>
            </>
          )
        }}
      </Query>
    </div>
  )
}

export default User

require('react-styl')(`
  .user-profile
    padding-top: 3rem
    h1
      line-height: 1.25
    .listings-count
      font-size: 32px
    .avatar-wrap
      .main-avatar
        border-radius: 1rem
    .description
      max-width: 50rem
      margin-bottom: 2rem

    .verified-info
      background-color: var(--pale-grey)
      padding: 1rem
      margin-top: 2rem
      border-radius: 1rem
      font-size: 14px
      h5
        font-size: 14px
        margin-bottom: 0.75rem
      > div
        display: flex
        align-items: center
        margin-bottom: 0.5rem
        &:last-child
          margin-bottom: 0
        .attestation
          margin-right: 0.5rem
          width: 1.5rem
          height: 1.5rem
    .reviews
      margin-top: 2rem

  .attestations
    display: flex
  .attestation
    background-repeat: no-repeat
    background-position: center
    background-size: contain
    width: 1.25rem
    height: 1.25rem
    margin-right: 0.25rem
    &.email
      background-image: url(images/identity/email-icon-verified.svg)
    &.facebook
      background-image: url(images/identity/facebook-icon-verified.svg)
    &.phone
      background-image: url(images/identity/phone-icon-verified.svg)
    &.twitter
      background-image: url(images/identity/twitter-icon-verified.svg)
    &.airbnb
      background-image: url(images/identity/airbnb-icon-verified.svg)
    &.google
      background-image: url(images/identity/google-icon-verified.svg)
    &.website
      background-image: url(images/identity/website-icon-verified.svg)
    &.kakao
      background-image: url(images/identity/kakao-icon-small.svg)
    &.github
      background-image: url(images/identity/github-icon-small.svg)
    &.linkedin
      background-image: url(images/identity/linkedin-icon-small.svg)
    &.wechat
      background-image: url(images/identity/wechat-icon-small.svg)

  @media (max-width: 767.98px)
    .user-profile
      padding-top: 2rem
      .avatar-wrap
        max-width: 8rem
        margin: 0 auto 1rem auto
`)
