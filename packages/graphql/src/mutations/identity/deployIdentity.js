import { post } from '@origin/ipfs'
import validator from '@origin/validator'

import txHelper, { checkMetaMask } from '../_txHelper'
import contracts from '../../contracts'
import validateAttestation from '../../utils/validateAttestation'
import { hasProxy, resetProxyCache } from '../../utils/proxy'
import costs from '../_gasCost.js'

async function deployIdentity(
  _,
  { from = contracts.defaultMobileAccount, profile = {}, attestations = [] }
) {
  await checkMetaMask(from)

  let wallet = await hasProxy(from)
  if (!wallet) wallet = from

  attestations = attestations
    .map(a => {
      try {
        return {
          ...JSON.parse(a),
          schemaId: 'https://schema.originprotocol.com/attestation_1.0.0.json'
        }
      } catch (e) {
        console.log('Error parsing attestation', a)
        return null
      }
    })
    .filter(a => validateAttestation(wallet, a))

  profile.schemaId = 'https://schema.originprotocol.com/profile_2.0.0.json'
  profile.ethAddress = wallet

  const data = {
    schemaId: 'https://schema.originprotocol.com/identity_1.0.0.json',
    profile,
    attestations
  }

  validator('https://schema.originprotocol.com/identity_1.0.0.json', data)
  validator('https://schema.originprotocol.com/profile_2.0.0.json', profile)
  attestations.forEach(a => {
    validator('https://schema.originprotocol.com/attestation_1.0.0.json', a)
  })

  const ipfsHash = await post(contracts.ipfsRPC, data)

  return txHelper({
    tx: contracts.identityEventsExec.methods.emitIdentityUpdated(ipfsHash),
    from,
    mutation: 'deployIdentity',
    gas: costs.emitIdentityUpdated,
    onConfirmation: () => resetProxyCache()
  })
}

export default deployIdentity
