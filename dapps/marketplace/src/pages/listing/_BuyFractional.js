import React, { useState, useContext } from 'react'
import dayjs from 'dayjs'
import get from 'lodash/get'
import { fbt } from 'fbt-runtime'

import CurrencyContext from 'constants/CurrencyContext'

import Price from 'components/Price'
import OgnBadge from 'components/OgnBadge'
import Tooltip from 'components/Tooltip'
import WithPrices from 'components/WithPrices'
import PaymentOptions from './_PaymentOptions'

import Buy from './mutations/Buy'

const Fractional = ({
  listing,
  from,
  range,
  availability,
  refetch,
  growthReward
}) => {
  const selectedCurrency = useContext(CurrencyContext)
  const acceptsDai = listing.acceptedTokens.find(t => t.id === 'token-DAI')
  const [token, setToken] = useState(acceptsDai ? 'token-DAI' : 'token-ETH')

  let startDateDisplay = fbt('Check in', 'Check in'),
    endDateDisplay = fbt('Check out', 'Check out'),
    startDate = null,
    endDate = null,
    totalPrice,
    available = false,
    showUnavailable = false

  if (range) {
    const split = range.split('/')
    startDate = split[0]
    endDate = split[1]
    startDateDisplay = dayjs(startDate).format('ddd, MMM D') // Needs l10n
    endDateDisplay = dayjs(endDate)
      .add(1, 'day')
      .format('ddd, MMM D') // Needs l10n
    const priceEstimate = availability.estimateNightlyPrice(range)
    available = priceEstimate.available
    if (available) {
      totalPrice = {
        amount: String(priceEstimate.price),
        currency: listing.price.currency
      }
    } else {
      showUnavailable = true
    }
  }

  return (
    <WithPrices
      price={totalPrice}
      target={token}
      targets={['token-ETH', 'token-DAI', listing.price.currency.id]}
    >
      {({ prices, tokenStatus }) => {
        return (
          <div className="listing-buy fractional">
            <div className="price">
              <div className="d-flex justify-content-between">
                <Price listing={listing} descriptor />
                <OgnBadge
                  amount={growthReward}
                  className="listing-detail-growth-reward"
                />
              </div>
              {listing.price.currency.id === selectedCurrency ? null : (
                <span className="orig">
                  <Price
                    price={listing.price}
                    target={listing.price.currency.id}
                  />
                </span>
              )}
            </div>
            <div className="choose-dates form-control">
              <Tooltip
                tooltip={fbt(
                  'Scroll down for availability calendar',
                  'Scroll down for availability calendar'
                )}
                placement="top"
              >
                <div>{startDateDisplay}</div>
              </Tooltip>
              <div className="arr" />
              <Tooltip
                tooltip={fbt(
                  'Scroll down for availability calendar',
                  'Scroll down for availability calendar'
                )}
                placement="top"
              >
                <div>{endDateDisplay}</div>
              </Tooltip>
            </div>
            {!showUnavailable ? null : (
              <div className="total">
                <fbt desc="Unavailable">Unavailable</fbt>
              </div>
            )}
            {!totalPrice ? (
              <button className="btn btn-primary disabled">
                {fbt('Book', 'Book')}
              </button>
            ) : (
              <>
                <div className="total">
                  <span>
                    <fbt desc="totalPrice">Total Price</fbt>
                  </span>
                  <span>
                    <Price price={totalPrice} />
                  </span>
                </div>
                <PaymentOptions
                  tokens={prices}
                  price={totalPrice}
                  acceptedTokens={listing.acceptedTokens}
                  value={token}
                  onChange={setToken}
                  hasBalance={tokenStatus.hasBalance}
                >
                  <Buy
                    refetch={refetch}
                    listing={listing}
                    from={from}
                    value={get(prices, `['${token}'].amount`)}
                    quantity={1}
                    disabled={available ? false : true}
                    startDate={startDate}
                    endDate={endDate}
                    currency={token}
                    tokenStatus={tokenStatus}
                    className={`btn btn-primary${available ? '' : ' disabled'}`}
                    children={fbt('Book', 'Book')}
                  />
                </PaymentOptions>
              </>
            )}
          </div>
        )
      }}
    </WithPrices>
  )
}

export default Fractional
