import { expect } from 'chai';
import contractService from '../src/contract-service'
import { ipfsHashes } from './fixtures'

const methodNames = [
  'submitListing',
  'getBytes32FromIpfsHash',
  'getIpfsHashFromBytes32'
]

describe('ContractService', () => {

  methodNames.forEach((methodName) => {
    it(`should have ${methodName} method`, () => {
      expect(contractService[methodName]).to.be.an.instanceof(Function)
    })
  })

  describe('getBytes32FromIpfsHash', () => {
    ipfsHashes.forEach(({ ipfsHash, bytes32 }) => {
      it(`should correctly convert from IPFS hash ${ipfsHash}`, () => {
        const result = contractService.getBytes32FromIpfsHash(ipfsHash);
        expect(result).to.equal(bytes32);
      })
    })
  })

  describe('getIpfsHashFromBytes32', () => {
    ipfsHashes.forEach(({ ipfsHash, bytes32 }) => {
      it(`should correctly convert to IPFS hash ${ipfsHash}`, () => {
        const result = contractService.getIpfsHashFromBytes32(bytes32);
        expect(result).to.equal(ipfsHash);
      })
    })
  })

  describe('submitListing', () => {
    // Skipped by default because it pops up MetaMask confirmation dialogue every time you make a
    // change which slows down dev. Should add alternate tests that mock MetaMask and only enable
    // this one as part of manual testing before releases to ensure library works with MetaMask.
    xit('should successfully submit listing', async () => {
      await contractService.submitListing('Qmbjig3cZbUUufWqCEFzyCppqdnmQj3RoDjJWomnqYGy1f', '0.00001', 1)
    })
  })

  describe('getListing', () => {
    // Skipped because of https://github.com/OriginProtocol/platform/issues/27
    xit('should reject when listing cannot be found', (done) => {
      contractService.getListing('foo').then(done.fail, (error) => {
        expect(error).to.match(/Error fetching listingId/);
        done();
      });
    })
  })

})
