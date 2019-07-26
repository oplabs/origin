import Stripe from 'stripe'
const SK = process.env.STRIPE_SK
const stripe = Stripe(SK)

export async function createCharge(token, description, amountUsd, currency = 'usd', descriptor = 'chai request') {
  //stripe uses cents
  const amount = Math.round(100 * amountUsd)
  const charge = await stripe.charges.create({amount, currency, description, source:token, 
    statement_descriptor:descriptor, capture:false})
  return charge
}

export async function captureCharge(chargeId) {
  const charge = await stripe.charges.capture(chargeId)
  return charge
}

export async function refundCharge(chargeId, amountUsd, request) {
  const amount = amountUsd ? Math.round(100 * amountUsd) : undefined
  const refundRequest = {charge:chargeId, amount}
  if (request) {
    refundRequest.reason = 'requested_by_customer'
  }
  const refund = await stripe.refunds.create(refundRequest)
  return refund
}
