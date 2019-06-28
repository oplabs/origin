import express from 'express'
import expressWs from 'express-ws'
import Linker from './logic/linker'
// TODO: uncomment
import Hot from './logic/hot'
import Webrtc from './logic/webrtc'
import logger from 'logger'
import { Readable } from 'stream'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import AttestationError from 'utils/attestation-error'

const router = express.Router()
//doing this is a hack for detached routers...
expressWs(router)

const CLIENT_TOKEN_COOKIE = 'ct'
const NOTIFY_TOKEN = process.env.NOTIFY_TOKEN

const getClientToken = req => {
  return req.cookies[CLIENT_TOKEN_COOKIE]
}

const clientTokenHandler = (res, clientToken) => {
  if (clientToken) {
    res.cookie(CLIENT_TOKEN_COOKIE, clientToken, {
      expires: new Date(Date.now() + 15 * 24 * 3600 * 1000),
      httpOnly: true
    })
  }
}

const hot = new Hot()
const linker = new Linker()
const webrtc = new Webrtc(linker, hot)

router.post('/generate-code', async (req, res) => {
  try {
    const _clientToken = getClientToken(req)
    const {
      return_url,
      session_token,
      pub_key,
      pending_call,
      notify_wallet
    } = req.body
    const { clientToken, sessionToken, code, linked } = await linker.generateCode(
      _clientToken,
      session_token,
      pub_key,
      req.useragent,
      return_url,
      pending_call,
      notify_wallet
    )
    clientTokenHandler(res, clientToken)
    res.send({ session_token: sessionToken, link_code: code, linked })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/link-info/:code', async (req, res) => {
  try {
    const { code } = req.params
    // this is the context
    const { appInfo, linkId, pubKey } = await linker.getLinkInfo(code)
    res.send({ app_info: appInfo, link_id: linkId, pub_key: pubKey })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/server-info/:version?', (req, res) => {
  try {
    const { version } = req.params
    // this is the context
    const info = linker.getServerInfo(version)
    if (hot.account)
    {
      info.verifier = hot.account.address
    }
    res.send(info)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/eth-usd', async (req, res) => {
  const rate = await webrtc.getEthToUsdRate()
  res.send({rate})
})

router.post('/call-wallet/:sessionToken', async (req, res) => {
  try {
    const clientToken = getClientToken(req)
    const { sessionToken } = req.params
    const { account, call_id, call, return_url } = req.body
    const success = await linker.callWallet(
      clientToken,
      sessionToken,
      account,
      call_id,
      call,
      return_url
    )
    res.send({ success })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/wallet-called/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { call_id, link_id, session_token, result } = req.body
    const success = await linker.walletCalled(
      walletToken,
      call_id,
      link_id,
      session_token,
      result
    )
    res.send({ success })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/link-wallet/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { code, current_rpc, current_accounts, priv_data } = req.body
    const {
      linked,
      pendingCallContext,
      appInfo,
      linkId,
      linkedAt
    } = await linker.linkWallet(
      walletToken,
      code,
      current_rpc,
      current_accounts,
      priv_data
    )

    res.send({
      linked,
      pending_call_context: pendingCallContext,
      app_info: appInfo,
      link_id: linkId,
      linked_at: linkedAt
    })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/prelink-wallet/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { pub_key, current_rpc, current_accounts, priv_data } = req.body
    const { code, linkId } = await linker.prelinkWallet(
      walletToken,
      pub_key,
      current_rpc,
      current_accounts,
      priv_data
    )

    res.send({ code, link_id: linkId })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/link-prelinked', async (req, res) => {
  try {
    const { code, link_id, return_url } = req.body
    const { clientToken, sessionToken, linked } = await linker.linkPrelinked(
      code,
      link_id,
      req.useragent,
      return_url
    )

    clientTokenHandler(res, clientToken)
    res.send({ session_token: sessionToken, linked })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/wallet-links/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const links = await linker.getWalletLinks(walletToken)
    res.send(links)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/wallet-update-links/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { updates } = req.body
    const update_count = await linker.updateWalletLinks(walletToken, updates)
    res.send({ update_count })
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/eth-notify', async (req, res) => {
  try {
    const { receivers, token } = req.body
    if (token == NOTIFY_TOKEN) {
      linker.ethNotify(receivers)
    }
    res.send(true)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/unlink', async (req, res) => {
  try {
    const clientToken = getClientToken(req)
    const success = await linker.unlink(clientToken)
    res.send(success)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/unlink-wallet/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { link_id } = req.body
    const success = await linker.unlinkWallet(walletToken, link_id)
    res.send(success)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/register-wallet-notification/:walletToken', async (req, res) => {
  try {
    const { walletToken } = req.params
    const { eth_address, device_type, device_token } = req.body
    const success = await linker.registerWalletNotification(
      walletToken,
      eth_address,
      device_type,
      device_token
    )
    res.send(success)
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.ws('/linked-messages/:sessionToken/:readId', async (ws, req) => {
  try {
    const clientToken = getClientToken(req)
    const { sessionToken, readId } = req.params
    //filter out sessionToken
    const realSessionToken = ['-', 'null', 'undefined'].includes(sessionToken)
      ? null
      : sessionToken

    logger.info(
      `Messages link sessionToken:${sessionToken} clientToken:${clientToken} readId:${readId}`
    )

    if (!clientToken) {
      ws.close(1000, 'No client token available.')
      return
    }
    //this prequeues some messages before establishing the connection
    const closeHandler = await linker.handleSessionMessages(
      clientToken,
      realSessionToken,
      readId,
      (msg, msgId) => {
        ws.send(JSON.stringify({ msg, msgId }))
      }
    )
    ws.on('close', () => {
      closeHandler()
    })
  } catch (error) {
    logger.info('we encountered an error:', error)
    ws.close(1000, error)
  }
})

router.ws('/webrtc-relay/:ethAddress', (ws, req) => {
  const { ethAddress } = req.params
  logger.info(
    `Webrtc relay opened for:${ethAddress}`
  )

  if (!ethAddress) {
    ws.close()
  }

  ws.on('message', msg => {
    logger.info("we got a message for:", msg)
    const { signature, message, rules, timestamp, walletToken } = JSON.parse(msg)

    try {
      const sub = webrtc.subscribe(ethAddress, signature, message, rules, timestamp, walletToken)

      sub.onServerMessage(msg => {
        ws.send(msg)
      })

      ws.removeAllListeners("message") //clear out the auth handler
      ws.on('message', msg => {
        sub.clientMessage(JSON.parse(msg))
      })

      ws.on('close', () => {
        logger.info("closing connection...")
        sub.clientClose()
      })
    } catch(error) {
      logger.error(error)
      ws.close(1000, 'Client auth error.')
    }
  })

})

router.get('/webrtc-addresses', async (req, res) => {
  try {
    const actives = await webrtc.getActiveAddresses()
    res.send(actives)
  } catch (e) {
    logger.error('Internal server error: ', e)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/webrtc-flag/:address', async (req, res) => {
  const { address } = req.params
  const {flagger, reason, timestamp, signature} = req.body
  try {
    await webrtc.flagAddress(address, flagger, reason, timestamp, signature)
    res.send({flagged:1})
  } catch (e) {
    logger.error('Internal server error: ', e)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/webrtc-offer/:listingID/:offerID', async (req, res) => {
  try {
    const {listingID, offerID} = req.params
    const offer = await webrtc.getOffer(listingID, offerID)

    if (offer) {
      const data = offer.get({plain:true})
      //do not expose the code
      delete data.code
      res.send(data)
    } else {
      res.send({})
    }
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/wr-reg-ref/:accountAddress', async (req, res) => {
  try {
    const {accountAddress} = req.params
    const {attestUrl, referralUrl} = req.body
    const attest = await webrtc.registerReferral(accountAddress, attestUrl, referralUrl)
    res.status(200).json(attest)
  } catch (e) {
    if (e instanceof AttestationError) {
      logger.error('Attestation error: ', e.message)
      res.status(400).json({ message: e.message })  
    } else {
      logger.error('Internal server error: ', e.message)
      res.status(500).json({ message: 'Unexpected error has occurred' })
    }
  }
})

router.get('/webrtc-attests/:accountAddress', async (req, res) => {
  try {
    const {accountAddress} = req.params
    res.send(await webrtc.getAllAttests(accountAddress))
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.get('/webrtc-static/:pathAddress?', async (req, res) => {
  const { pathAddress } = req.params
  const accountAddress = req.query.p
  res.send(await webrtc.getPage(pathAddress||accountAddress))
})

router.get('/linkedin-authed', async (req, res) => {
  if (req.useragent.browser != "EthCam") {
    // this is not submitted by our app.
    //
    // assume https because https is required for universal linking
    const fullUrl = 'https://' + req.get('host') + req.originalUrl
    res.send(`<!DOCTYPE html><html><body link="blue"><p><a href="${fullUrl}" target="_blank">Open in chai</a></p></body></html>`)
  } else {
    const result = await webrtc.processLinkedinAuth(req.query)
    
    res.send(result)
  }
})

router.post('/webrtc-user-info', async (req, res) => {
  try {
    const { ipfsHash } = req.body
    res.send(await webrtc.submitUserInfo(ipfsHash))
  } catch (e) {
    logger.error('Internal server error: ', e.message)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/webrtc-user-video/:ethAddress', async (req, res) => {
  const {ethAddress} = req.params
  if (!req.files || !req.files.video || !req.files.video.tempFilePath) {
    return res.status(400).json({message:'No video file was uploaded.'});
  }
  console.log("written to temp file:", req.files.video)

  const videoHash = req.files.video.md5
  const outfile = process.env.VIDEOS_DIRECTORY + `${ethAddress}-${videoHash}.mp4`

  await new Promise((resolve, reject) => {
    ffmpeg(req.files.video.tempFilePath)
      .audioCodec('aac').videoCodec('libx264')
      .on('error', (err)=> { 
      console.log("Error processing video file:", err.message)
      reject(err.message)
    }).on('end', ()=> {
      console.log('finish processing')
      resolve(true)
    }).save(outfile)
  })

  //clean it all up
  //fs.unlink(outfile, (err)=> { if(err) { console.log("Cannot remove:", outfile)}})
  fs.unlink(req.files.video.tempFilePath, (err)=> {if(err) {console.log("cannot remove:", req.files.video.tempFilePath)}})
  res.send({videoHash})
})


router.get('/webrtc-user-info/:accountAddress/:watcherAddress?', async (req, res) => {
  const {accountAddress, watcherAddress} = req.params

  try {
    const info = await webrtc.getUserInfo(accountAddress, watcherAddress)
    if (info) {
      res.send(info)
    } else {
      res.status(404).send({
        message: 'User not found'
      })
    }
  } catch (error) {
    logger.error("Error getting user info:", error)
    res.status(500).json({ message: 'Unexpected error has occurred' })
  }
})

router.post('/webrtc-verify-accept', async (req, res) => {
  const {ethAddress, ipfsHash, behalfFee, sig, listingID, offerID, args} = req.body

  const result = await webrtc.verifyAcceptOffer(ethAddress, ipfsHash, behalfFee, sig, listingID, offerID, args)
  res.send(result)
})

router.post('/webrtc-verify-finalize', async (req, res) => {
  const {listingID, offerID, ipfsHash, behalfFee, fee, payout, sellerSig, sig} = req.body

  const result = await webrtc.verifySubmitFinalize(listingID, offerID, ipfsHash, behalfFee, fee, payout, sellerSig, sig)
  res.send(result)
})


router.ws('/wallet-messages/:walletToken/:readId', (ws, req) => {
  const { walletToken, readId } = req.params

  logger.info(
    `Wallet messages link walletToken:${walletToken} readId:${readId}`
  )

  if (!walletToken) {
    ws.close()
  }

  const closeHandler = linker.handleMessages(
    walletToken,
    readId,
    (msg, msgId) => {
      ws.send(JSON.stringify({ msg, msgId }))
    }
  )
  ws.on('close', () => {
    closeHandler()
  })
})

router.post('/submit-marketplace-onbehalf', async (req, res) => {
  const { cmd, params } = req.body

  const result = await hot.submitMarketplace(cmd, params)
  res.send(result)
})

router.post('/verify-offer', async (req, res) => {
  const { offerId, params } = req.body
  const result = await hot.verifyOffer(offerId, params)
  res.send(result)
})


// For debugging one's dev environment
router.get('/marketplace-addresses', async (req, res) => {
  logger.info(req.params)
  const name = req.query.name || 'V00_Marketplace'
  const { contractAddresses } = linker.getServerInfo()
  try {
    const addresses = Object.entries(contractAddresses[name])
      .map(([networkId, entry]) => `network ${networkId}: ${entry.address}`)
      .join('\n')
    res.send(`Addresses for ${name}:\n${addresses}\n`)
  } catch (e) {
    logger.error(e)
    res.status(500).send(`Error getting address for contract ${name}\n`)
  }
})

router.post('/webrtc-create-offer', async (req, res) => {
  const { offer, signature } = req.body

  const result = await webrtc.createOffer(offer, signature)
  res.send(result)
})

router.post('/webrtc-accept-offer', async (req, res) => {
  const { acceptance, signature, args } = req.body

  const result = await webrtc.acceptOffer(acceptance, signature, args)
  res.send(result)
})

router.post('/webrtc-withdraw-offer', async (req, res) => {
  const { withdrawal, signature } = req.body

  const result = await webrtc.withdrawOffer(withdrawal, signature)
  res.send(result)
})

router.post('/webrtc-claim-offer', async (req, res) => {
  const { listingID, offerID, ipfsBytes, payout, signature } = req.body

  const result = await webrtc.claimOffer(listingID, offerID, ipfsBytes, payout, signature)
  res.send(result)
})

export default router
