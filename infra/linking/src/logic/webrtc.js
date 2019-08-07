import redis from 'redis'
import origin, { web3 } from './../services/origin'
import db from './../models/'
import extractAttestInfo, {extractAccountStat, extractLinkedin} from './../utils/extract-attest'
import createHtml from './../utils/static-web'
import * as stripe from './../utils/stripe'
import emailSupport from './../utils/email-support'
import { getEthToUSDRate } from './../utils/currency'
import { setTurnCred } from './../utils/turn'
import { sha3_224 } from 'js-sha3'
import querystring from 'querystring'
import shortid from 'shortid'
import _ from 'lodash'

import AttestationError from 'utils/attestation-error'
import logger from 'logger'

const CHANNEL_PREFIX = "webrtc."
const CHANNEL_ALL = "webrtcall"

const emptyAddress = '0x0000000000000000000000000000000000000000'

const ACTIVE_INFO_ONLY = process.env.ACTIVE_INFO_ONLY

const TURN_KEY = process.env.TURN_KEY
const TURN_PREFIX = process.env.TURN_PREFIX
const TURN_HOST = process.env.TURN_HOST


const ADMIN_ADDRESSES = process.env.ADMIN_ADDRESSES ? process.env.ADMIN_ADDRESSES.split(',') : []

const CALL_STARTED = 'started'
const CALL_DECLINED = 'declined'
const CALL_ENDED = 'ended'


const CENTRALIZED_OFFER_PREFIX = 'C.'

const PROMOTE_COIN = "p_coin"
const LOCKED_COINT = "l_coin"
const COIN = "coin"

const CALL_COUNT_PREFIX = 'count.'
const CALL_DECLINE_PREFIX = "decline."

const USD_MIN_COST_RATE = 100

const DECLINE_SECONDS = 5* 60 //decline lasts for 60 seconds

function getFullId(listingID, offerID) {
  return `${listingID}-${offerID}`
}

function isCentralized(listingID) {
  return listingID.startsWith(CENTRALIZED_OFFER_PREFIX)
}

function toSignListingID(listingID) {
  if (isCentralized(listingID)) {
    return web3.utils.hexToNumberString('0x' + listingID.slice(2))
  } else {
    return listingID
  }
}

function splitFullId(fullId) {
  const ids = fullId.split('-')
  return {listingID:ids[0], offerID:ids[1]}
}

function getBlockKey(fromAddress, toAddress) {
  return `blocked.${fromAddress}.${toAddress}`
}



function addBNs(value1, value2) {
  return web3.utils.toBN(value1).add(web3.utils.toBN(value2)).toString()
}

// Objects returned from web3 often have redundant entries with numeric
// keys, so we filter those out.
const filterObject = (obj) => {
  const filteredObj = {}
  for (const [key, value] of Object.entries(obj)) {
    if (isNaN(parseInt(key[0], 10))) {
      filteredObj[key] = value
    }
  }
  return filteredObj
}

class WebrtcSub {
  constructor(ethAddress, redis, redisSub, activeAddresses, logic, walletToken) {
    redisSub.subscribe(CHANNEL_PREFIX + ethAddress)
    redisSub.subscribe(CHANNEL_ALL)
    this.activeAddresses = activeAddresses
    this.peers = []
    this.redis = redis
    this.redisSub = redisSub
    this.subscriberEthAddress = ethAddress
    this.walletToken = walletToken
    this.logic = logic

    this.redisSub.on("subscribe", (channel, count) => {
      if (channel == CHANNEL_ALL) {
        if (this.active) {
          this.publish(CHANNEL_ALL, {from:this.subscriberEthAddress, join:1})
        }
      }
    })

    this.incomingMsgHandlers = [this.handleApiVersion, this.handleSubscribe, this.handleExchange, this.handleLeave, this.handleDisableNotification, 
      this.handleNotification, this.handleSetPeer, this.handleVoucher, this.handleGetOffers, this.handleRead, this.handleReject, 
      this.handleDismiss, this.handleCollected, this.handleStartSession, this.handleBlock, this.handleAdmin]

    this.setUserInfo()
    this.getPendingOffers({ignoreBlockchain:true})
  }

  setActive() {
    if (!this.active) {
      const ethAddress = this.subscriberEthAddress
      this.activeAddresses[ethAddress] = 1 + (this.activeAddresses[ethAddress] || 0)
      this.active = true
      this.publish(CHANNEL_ALL, {from:this.subscriberEthAddress, join:1})
    }
  }

  removeActive() {
    if (this.active) {
      const ethAddress = this.subscriberEthAddress
      if (this.activeAddresses[ethAddress] > 1)
      {
        this.activeAddresses[ethAddress] -= 1
      } else {
        delete this.activeAddresses[ethAddress]
      }
      this.publish(CHANNEL_ALL, {left:1})
      this.active = false
    }
  }

  sendBalance() {
    const balances = {}
    if (this.user) {
      for (const key of ['balance', 'lockedBalance', 'promoteBalance']) {
        if (this.user[key] && this.user[key] != '0') {
          balances[key] = this.user[key]
        }
      }
      balances.lastOfferId = this.user.lastOfferId
    }
    this.sendMsg({balances})
  }

  async setUserInfo() {
    const user = await db.UserInfo.findOne({ where: {ethAddress:this.subscriberEthAddress} })
    if (user) {
      this.user = user
      if (user.banned) {
        this.banned = true
      }
      this.userInfo = user.info
    }
    this.sendBalance()
    // set active only after user info is gotten
    this.setActive()
  }

  getName() {
    return (this.userInfo && this.userInfo.name) || this.subscriberEthAddress
  }

  getMinCost(amountType) {
    const minCost = (this.userInfo && this.userInfo.minCost) || 0.01
    if (amountType == 'chai') {
      return web3.utils.toWei((Number(minCost) * USD_MIN_COST_RATE).toString())
    } else {
      return web3.utils.toWei(minCost.toString())
    }
  }

  publish(channel, data, callback) {
    this.redis.publish(channel, JSON.stringify(data), callback)
  }

  onServerMessage(handler) {
    this.redisSub.on('message', (channel, msg) => {
      const {from, subscribe, updated, rejected, collected, declined} = JSON.parse(msg)
      const { offer, accept } = subscribe || {}
      if (channel == CHANNEL_ALL || this.peers.includes(from) || offer || accept || rejected || collected || declined || updated)
      {
        logger.info("sending message to client:", msg)
        try {
          handler(msg)
        } catch(error) {
          logger.info(error)
        }
      }
      if(from == this.subscriberEthAddress && updated) {
        this.setUserInfo()
      }
    })
    this.msgHandler = handler
  }



  removePeer(ethAddress) {
    if (this.peers.includes(ethAddress)) {
      this.peers = this.peers.filter(a => a != ethAddress)
      this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, leave:1})
    }
  }

  addPeer(ethAddress) {
    if(!this.peers.includes(ethAddress)) {
      this.peers.push(ethAddress)
    }
  }

  setActivePeer(ethAddress) {
    if (this.peers)
    {
      for (const peer of this.peers) {
        //leave all other conversations
        if(peer != ethAddress)
        {
          this.removePeer(peer)
        }
      }
    }
    this.peers = [ethAddress]
  }

  sendMsg(msg) {
    this.msgHandler(JSON.stringify(msg))
  }

  sendOffer(updatedOffer) {
    this.sendMsg({updatedOffer})
  }

  decorateOffer(e, offer) {
    e.amount = offer.amount
    e.amountType = offer.amountType
    e.totalValue = offer.contractOffer.totalValue
    e.status = offer.contractOffer.status
    if (offer.initInfo)
    {
      e.terms = offer.initInfo.offerTerms
    }
    if (offer.lastVoucher)
    {
      e.lastVoucher = offer.lastVoucher
    }
  }

  getTurn(ethAddress, offer) {
    const pass = sha3_224(`${TURN_KEY}:${ethAddress}:${offer.fullId}`).slice(0, 16)
    const prefix = TURN_PREFIX
    setTurnCred(prefix+ethAddress.slice(2), pass)
    return {pass, prefix, host:TURN_HOST}
  }


  handleApiVersion({apiVersion}) {
    if (apiVersion) {
      const version = this.logic.linker.apiVersion
      if (Number(apiVersion) < Number(version)){
        this.sendMsg({updateRequired:{version}})
      }
      return true
    }
  }

  getCallKey(to, offer) {
    return `call.${to}.${offer.listingID}.${offer.offerID}`
  }

  
  async incrRedis(key) {
    return new Promise((resolve, reject) => {
      this.redis.incr(key, (err, reply) => {
        if (err) {
          reject(err)
        } else {
          resolve(Number(reply))
        }
      })
    })
  }

  async checkDeclined(ethAddress, offer) {
    const declineCheckKey = CALL_DECLINE_PREFIX + this.getCallKey(ethAddress, offer)
    return this.getRedis(declineCheckKey)
  }

  clearDeclined(offer) {
    const declineCheckKey = CALL_DECLINE_PREFIX + this.getCallKey(this.subscriberEthAddress, offer)
    this.redis.del(declineCheckKey)
  }

  setDeclined(offer) {
    const declineCheckKey = CALL_DECLINE_PREFIX + this.getCallKey(this.subscriberEthAddress, offer)
    this.redis.set(declineCheckKey, '1', 'EX', 300) // decline for 5 minutes
  }

  async getExistingCall(offer) {
    const key = this.getCallKey(this.subscriberEthAddress, offer)
    return await this.getRedis(key)
  }

  async sendCallRequest(ethAddress, offer, callId) {
    const {listingID, offerID} = offer
    const key = this.getCallKey(ethAddress, offer)

    const declined = await this.checkDeclined(ethAddress, offer)
    if (declined) {
      this.sendMsg({from:ethAddress, declined:{offer, callId}})
      return false
    }
    const existingCall = await this.getRedis(key)
    if (existingCall && existingCall != callId) {
      this.sendMsg({from:ethAddress, declined:{offer, callId, existingCall}})
      return false
    }

    const expKey = `exp.${this.subscriberEthAddress}.${callId}`
    const dateStr = await this.getRedis(expKey)

    if (!dateStr) {
      const countKey = CALL_COUNT_PREFIX + key
      const count = Number((await this.getRedis(countKey)))
      if (count > 3) {
        this.sendMsg({from:ethAddress, declined:{offer, callId, maxCalls:count}})
        return false
      }
      // this is a brand new call
      this.redis.incr(countKey)
      this.redis.expire(countKey, 1800)
      // clear incoming calls for me, since I'm expecting an answer from the caller
      this.redis.del(CALL_COUNT_PREFIX + this.getCallKey(this.subscriberEthAddress, offer))

      //This should be set to the correct time
      this.redis.set(expKey, new Date().toISOString(), 'EX', 24* 60 * 60) // call attempts last for a day
    } else if ((new Date() - new Date(dateStr)) > 35 * 1000) { // you can only ring someone for 35 seconds
      this.sendMsg({from:ethAddress, declined:{offer, callId, expired:true}})
      return false
    } 
    //clear the decline for the offer if I had any.
    this.clearDeclined(offer)

    // send not silent with a TLL and max priority
    this.logic.sendNotificationMessage(ethAddress, `${this.getName()} is calling you.`, {listingID, offerID, callId}, callId, false, true)
    this.redis.set(key, callId, 'EX', 5)
    setTimeout(() => {
      this.redis.get(key, (err, reply) => {
        if (reply != callId) {
          this.logic.sendNotificationMessage(ethAddress, `Missed chai call from ${this.getName()}`, {listingID, offerID, callId}, callId, true)
        }
      })
    }, 5500) //after six seconds if that value is still there well then it's probably ended
    return true
  }

  async isBlocked(ethAddress) {
    return this.getRedis(getBlockKey(this.subscriberEthAddress, ethAddress))
  }

  clearBlock(ethAddress) {
    //clear the block if it exists
    this.redis.del(getBlockKey(ethAddress, this.subscriberEthAddress))
  }

  handleBlock({block, unblock}){
    if (block) {
      const key = getBlockKey(block, this.subscriberEthAddress)
      this.redis.set(key, "1")
      logger.info("setting: ", key)
      this.logic.sendUpdated(block)
      return true
    } else if (unblock) {
      const key = getBlockKey(unblock, this.subscriberEthAddress)
      this.redis.del(key)
      this.logic.sendUpdated(unblock)
      logger.info("clearing: ", key)
      return true
    }
  }

  handleSubscribe({ethAddress, subscribe}) {
    if (subscribe)
    {
      (async () => {
        const {offer, accept} = subscribe
        if (offer) {
          //check and clear blocks
          const blocked = await this.isBlocked(ethAddress)
          if (blocked) {
            this.sendMsg({from:ethAddress, rejected:{offer}})
          }
          this.clearBlock(ethAddress)

          const { listingID, offerID, transactionHash, blockNumber } = subscribe.offer
          const offer = await this.logic.getOffer(listingID, offerID, transactionHash, blockNumber)

          if (!subscribe.callId) {
            logger.info("Offer is:", offer)
          }
          const accepted = this.logic.isOfferAccepted(offer)

          // TODO: we need a price on this offer so need to load up profiles here as well
          if (offer && offer.active && !offer.rejected
            && offer.from == this.subscriberEthAddress && (!offer.to || offer.to == ethAddress) &&
            (web3.utils.toBN(offer.contractOffer.totalValue).gte(this.getMinCost(offer.amountType)) || accepted))
          {
            if (subscribe.callId && accepted) {
              // you can only call into accepted offers
              //
              if (!(await this.sendCallRequest(ethAddress, {listingID, offerID}, subscribe.callId))) {
                // couldn't call for some reason
                return
              }
              offer.lastNotify = new Date()
            } else if( ethAddress) {
              if (!offer.lastNotify || (new Date() - offer.lastNotify) > 1000 * 60* 60 && !accepted) {
                const usdAmount = this.logic.getUsdAmount(offer.amount, offer.amountType)
                this.logic.sendNotificationMessage(ethAddress, `You have received an offer to talk for ${offer.amount} ${offer.amountType.toUpperCase()}($${usdAmount}) from ${this.getName()}.`, {listingID, offerID})
                offer.lastNotify = new Date()
              } else {
                logger.info("Limit for sending offers sent.")
                return
              }
            }
            offer.fromNewMsg = false
            offer.toNewMsg = true
            offer.save()

            this.decorateOffer(subscribe.offer, offer)
            if (ethAddress) {
              subscribe.turn = this.getTurn(ethAddress, offer)

              // this is a good offer
              this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, subscribe})
            }
            if (transactionHash) {
              this.sendOffer(offer)
            }
          }
        } else if (accept) {
          const {
            listingID,
            offerID,
            transactionHash
          } = subscribe.accept

          //check and clear blocks
          const blocked = await this.isBlocked(ethAddress)
          if (blocked) {
            this.sendMsg({from:ethAddress, rejected:{offer: subscribe.accept}})
          }
          this.clearBlock(ethAddress)

          const offer = await this.logic.getOffer(listingID, offerID)

          if (offer && offer.active
            && (offer.to == this.subscriberEthAddress || !offer.to) && offer.from == ethAddress
            && this.logic.isOfferAccepted(offer))
          {
            if (transactionHash) {
              this.logic.sendNotificationMessage(ethAddress, `${this.getName()} has accepted your invitation to talk.`, {listingID, offerID})
            }

            if (subscribe.callId) {
              // you can only call into accepted offers
              if (!(await this.sendCallRequest(ethAddress, {listingID, offerID}, subscribe.callId))) {
                // couldn't call for some reason
                return
              }
              offer.lastFromNotify = new Date()
            }

            //we already read this offer
            offer.fromNewMsg = true
            offer.toNewMsg = false
            offer.save()

            //if we have a voucher from before send it
            this.decorateOffer(subscribe.accept, offer)
            if (subscribe.callId) {
              subscribe.turn = this.getTurn(ethAddress, offer)
            }

            this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, subscribe})
            if (transactionHash) {
              this.sendOffer(offer)
            }
          }
        }
      }) ()
      return true
    }
  }

  handleReject({reject}) {
    if (reject) {
      (async () => {
        const {listingID, offerID} = reject.offer
        const sendOffer = {listingID, offerID}
        const offer = await this.logic.getDbOffer(listingID, offerID)
        if (!offer.active)
        {
          //do nothing
          return
        }

        if (offer.to == this.subscriberEthAddress)
        {
          if (offer.lastVoucher || this.logic.isOfferAccepted(offer))
          {
            offer.toNewMsg = false
            this.setDeclined(sendOffer)
          } else {
            offer.rejected = true
            this.publish(CHANNEL_PREFIX + offer.from, {from:this.subscriberEthAddress, rejected:{offer: sendOffer}})
            this.logic.sendNotificationMessage(offer.from, `Your offer to ${this.getName()} has been declined.`, sendOffer)
          }
          await offer.save()
        } 
        else if (offer.from == this.subscriberEthAddress)
        {
          offer.fromNewMsg = false
          await offer.save()
          this.setDeclined(sendOffer)
        }
      })()
      return true
    }
  }


  handleCollected({collected}) {
    if (collected) {
      (async () => {
        const {listingID, offerID} = collected.offer
        const offer = await this.logic.getOffer(listingID, offerID)
        logger.info("collecting offer:", offer)

        if (!offer.active && offer.to == this.subscriberEthAddress)
        {
          this.publish(CHANNEL_PREFIX + offer.from, {from:this.subscriberEthAddress, collected:{offer:{listingID, offerID}}})
        }
      })()
      return true
    }
  }

  handleDismiss({dismiss}) {
    if (dismiss) {
      (async () => {
        const {listingID, offerID} = dismiss.offer
        const offer = await this.logic.getDbOffer(listingID, offerID)

        if (offer.active && offer.from == this.subscriberEthAddress)
        {
          offer.dismissed = true
          await offer.save()
        }
      })()
      return true
    }
  }

  handleRead({read}) {
    if(read) {
      (async () => {
        const {listingID, offerID} = read.offer
        const offer = await this.logic.getDbOffer(listingID, offerID)

        if (offer.active)
        {
          if (offer.from == this.subscriberEthAddress)
          {
            offer.fromNewMsg = false
            await offer.save()
          } else if (offer.to == this.subscriberEthAddress) {
            offer.toNewMsg = false
            await offer.save()
          }
        }
          
      })()
      return true
    }
  }

  handleStartSession({startSession}) {
    if(startSession) {
      (async () => {
        const {listingID, offerID} = startSession.offer
        const offer = await this.logic.getDbOffer(listingID, offerID)
        if(offer.from == this.subscriberEthAddress && 
          offer.active && this.logic.isOfferAccepted(offer) && offer.fromNewMsg) {
          await offer.update({toNewMsg:true}) // let the other guy know we've started as well, this should both be now true
        }
      })()
      return true
    }
  }

  handleSetPeer({activePeer}) {
    if (activePeer) {
      this.setActivePeer(activePeer)
      return true
    }
  }

  handleExchange({ethAddress, exchange}) {
    if (exchange){
      if (ethAddress == this.subscriberEthAddress) {
        logger.info("Trying to subscribe to self:", ethAddress)
      } else {
        this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, exchange})
      }
      return true
    }
  }

  handleLeave({ethAddress, leave}){
    if (leave) {
      this.removePeer(ethAddress)
      return true
    }
  }

  handleDisableNotification({disableNotification}) {
    if (disableNotification) {
      this.removeActive()
      const {walletToken} = this
      if (walletToken) {
        (async () => {
          const notify = await db.WebrtcNotificationEndpoint.findOne({ where: { walletToken } })
          if (notify) {
            notify.active = false
            await notify.save()
          }
        })()
      }
      return true
    }
  }

  handleNotification({notification}) {
    if (notification) {
      this.setActive()
      const {deviceToken, deviceType} = notification
      const {walletToken} = this
      const ethAddress = this.subscriberEthAddress
      const lastOnline = new Date()
      if (walletToken && ethAddress) {
        (async () => {
          const notify = await db.WebrtcNotificationEndpoint.findOne({ where:{ walletToken } })
          if (notify) {
            await notify.update({ active:true, ethAddress, deviceToken, deviceType, lastOnline })
          } else {
            await db.WebrtcNotificationEndpoint.upsert({ walletToken, active:true, ethAddress, deviceToken, deviceType, lastOnline } )
          }
        })()
      }
      return true
    }
  }

  handleVoucher({ethAddress, voucher}) {
    if(voucher) {
      (async () => {
        if(await this.logic.updateIncreasingVoucher(ethAddress, voucher)) {
          this.publish(CHANNEL_PREFIX + ethAddress, {from:this.subscriberEthAddress, voucher})
        }
      })()
      return true
    }
  }

  handleGetOffers({getOffers}) {
    if (getOffers) {
      const options = getOffers
      this.getPendingOffers(options)
      return true
    }
  }

  handleAdmin({admin}) {
    if (admin && ADMIN_ADDRESSES.includes(this.subscriberEthAddress)) {
      (async () => {
        if (admin.getAllUsers) {
          this.sendMsg({allUsers:await this.logic.getAllUsers()})
        } else if (admin.ban) {
          const {ethAddress, banned} = admin.ban
          const userInfo = await db.UserInfo.findOne({ where: {ethAddress} })
          if (!userInfo) {
            await db.UserInfo.upsert({ethAddress:ethAddress, banned})
          } else {
            await userInfo.update({banned})
            this.logic.broadcastUpdated(ethAddress)
          }
        } else if (admin.hide) {
          const {ethAddress, hidden} = admin.hide
          const userInfo = await db.UserInfo.findOne({ where: {ethAddress} })
          if (!userInfo) {
            await db.UserInfo.upsert({ethAddress:ethAddress, hidden})
          } else {
            await userInfo.update({hidden})
            this.logic.broadcastUpdated(ethAddress)
          }
        } else if (admin.givePromote) {
          const {ethAddress, amount} = admin.givePromote
          await this.logic.givePromoteCoins(ethAddress, amount)
          this.logic.broadcastUpdated(ethAddress)
        }
      })()
      return true
    }
  }

  async getRedis(key) {
    return this.logic.getRedis(key)
  }

  async getPendingOffers(options) {
    const pendingOffers = await this.logic.getOffers(this.subscriberEthAddress, options)
    await Promise.all(pendingOffers.map(async o => {  
      if (await this.getExistingCall(o)) {
        o.incomingCall = true
      }
    }))
    this.sendMsg({pendingOffers})
  }


  clientMessage(msgObj) {
    logger.info("We have a message from the client:", msgObj)
    if (this.banned) {
      logger.info(`User ${this.subscriberEthAddress} is banned not handling messages`)
      return
    }
    for (const handler of this.incomingMsgHandlers) {
      if (handler.call(this, msgObj) ) {
        return
      }
    }
  }

  async clientClose() {
    for (const peer of this.peers) {
      this.removePeer(peer)
    }
    this.redisSub.removeAllListeners()
    await this.redisSub.quit()
    this.removeActive()
  }
}


export default class Webrtc {
  constructor(linker, hot) {
    this.redis = redis.createClient(process.env.REDIS_URL)
    this.activeAddresses = {}
    this.linker = linker
    this.hot = hot
    this.initContract()
  }

  async initContract() {
    this.contract = await origin.contractService.deployed(origin.contractService.marketplaceContracts.VB_Marketplace)
  }

  subscribe(ethAddress, authSignature, message, rules, timestamp, walletToken) {
    logger.info("call subscribing...", ethAddress)
    if (message && !(message.includes(rules.join(",")) && message.includes(timestamp))) {
      throw new Error("Invalid subscription message sent")
    }

    if (walletToken && !message.includes(walletToken)) {
      throw new Error("Signature message does not include the wallet token")
    }

    const currentDate = new Date()
    const tsDate = new Date(timestamp)
    logger.info("subscribing...", ethAddress)
    const recovered = web3.eth.accounts.recover(message, authSignature)
    // we keep thje signature fresh for every 15 days
    if (ethAddress == recovered && currentDate - tsDate < 15 * 24 * 60 * 60 * 1000)
    {
      if (rules.includes("VIDEO_MESSAGE"))
      {
        logger.info("Authorized connection for:", ethAddress)
        return new WebrtcSub(ethAddress, this.redis, this.redis.duplicate(), this.activeAddresses, this, walletToken)
      }
    }
    logger.error("signature mismatch:", recovered, " vs ", ethAddress)
    throw new Error(`We cannot auth the signature`)
  }

  async getAllUsers() {
    const users = await db.UserInfo.findAll({order:[['createdAt', 'DESC']]})
    return users.map(u=> u.get({plain:true}))
  }

  async getActiveAddresses() {
    const actives = []
    if (ACTIVE_INFO_ONLY)
    {
      const activeNotifcations = await db.WebrtcNotificationEndpoint.findAll({
        include:[ {model:db.UserInfo, required:true, attributes:["info", [db.Sequelize.literal('"WebrtcNotificationEndpoint"."last_online" + "UserInfo"."rank" * interval \'1 second\''), 'lastOnlineRank']]} ],
        where: { active:true, '$UserInfo.flags$':{[db.Sequelize.Op.lt]:3}, '$UserInfo.banned$':{[db.Sequelize.Op.ne]:true}, '$UserInfo.hidden$':{[db.Sequelize.Op.ne]:true} }, order:[[db.Sequelize.literal('"UserInfo.lastOnlineRank"'), 'DESC']], limit:100})

      for (const notify of activeNotifcations) {
        if (!actives.includes(notify.ethAddress) && notify.UserInfo.info && notify.UserInfo.info.icon)
        {
          actives.push(notify.ethAddress)
        }
      }
    } else {
      actives.push(...Object.keys(this.activeAddresses))
      const activeNotifcations = await db.WebrtcNotificationEndpoint.findAll({
        include:[ {model:db.UserInfo, required:false} ],
        where: { active:true, '$UserInfo.banned$':{[db.Sequelize.Op.ne]:true} }, order:[['lastOnline', 'DESC']], limit:50})

      for (const notify of activeNotifcations) {
        if (!actives.includes(notify.ethAddress))
        {
          actives.push(notify.ethAddress)
        }
      }
    }
    return actives
  }

  broadcastUpdated(ethAddress) {
    this.redis.publish(CHANNEL_ALL, JSON.stringify({from:ethAddress, updated:1}))
  }

  sendUpdated(ethAddress) {
    this.redis.publish(CHANNEL_PREFIX + ethAddress, JSON.stringify({from:ethAddress, updated:1}))
  }

  async getRank(ethAddress, info) {
    let rank = 0
    if (info && info.attests) {
      try {
        const attestedSites = await db.AttestedSite.findAll({where:{ethAddress, verified:true}})
        const attests = info.attests
        for (const attest of attests.slice()) {
          attest.verified = false
          for(const attested of attestedSites) {
            if (attested.accountUrl == attest.accountUrl 
              && attested.site == attest.site 
              && attested.account == attest.account)
            {
              rank += 24 * 3600
              const count = attested.info && (attested.info.subscribers || attested.info.followers)
              if (count) {
                let num = count
                if (typeof num  == 'string') {
                  num = parseInt(count.replace(/\,/g,''), 10)
                }
                rank += num * 600
              }
            }
          }
        }
      } catch (error) {
        console.log("ERROR verifying attests:", error)
      }
    }
    return rank
  }

  async submitUserInfo(ipfsHash) {
    const info = await origin.ipfsService.loadObjFromFile(ipfsHash)
    // we should verify the signature for this
    if (await this.hot.verifyProfile(info))
    {
      logger.info("submitting ipfsHash:", ipfsHash)
      const rank = await this.getRank(info.address, info)
      await db.UserInfo.upsert({ethAddress:info.address, ipfsHash, info, rank})
      this.broadcastUpdated(info.address)

      return true
    }
    return false
  }

  async createOffer(offer, signature) {
    const {createDate, promote, from, to, offerID, value, verifier, offerTerms, tokenInfo } = offer

    const currentDate = new Date()
    const tsDate = new Date(createDate)
    const message = JSON.stringify(offer)
    const recovered = web3.eth.accounts.recover(message, signature)
    const listingID = CENTRALIZED_OFFER_PREFIX + from.slice(2)
    const {stripeToken} = tokenInfo || {}

    if (offerID && recovered == from && currentDate - tsDate <  60 * 1000) //you got a minute to submit this thing
    {
      // let's figure out what the offer id is
      //
      const fullId = getFullId(listingID, offerID)

      await db.sequelize.transaction(async (transaction) => {
        const user = await db.UserInfo.findOne({ where: {ethAddress:from } }, {transaction})
        const userTo = await db.UserInfo.findOne({ where: {ethAddress:to } })
        const balanceUpdate = {}
        const funding = {}
        const BNValue = web3.utils.toBN(value)
        const toName = (userTo && userTo.info && userTo.info.name) || to
        let stripeCharge

        if (Number(offerID) < user.lastOfferId) {
          throw new Error(`OfferID ${offerID} not greater than last offerID ${user.lastOfferId}`)
        }

        if (stripeToken) {
          const description = `Chai conversation with ${toName}`
          stripeCharge = await stripe.createCharge(stripeToken, description, web3.utils.fromWei(BNValue))
        } else if (promote) {
          const BNPromoteBalance = web3.utils.toBN(user.promoteBalance)
          if (BNPromoteBalance.lt(BNValue))
          {
            throw new Error(`Balance ${BNPromoteBalance.toString()} not greater than last value ${value}`)
          }

          balanceUpdate.promoteBalance = BNPromoteBalance.sub(BNValue).toString()
          funding.promoteBalance = BNValue.toString()
        } else {

          const BNBalance = web3.utils.toBN(user.balance)
          const BNLockedBalance = web3.utils.toBN(user.lockedBalance)
          const BNTotalBalance = BNBalance.add(BNLockedBalance)

          if (BNTotalBalance.lt(BNValue))
          {
            throw new Error(`Total balance ${BNTotalBalance.toString()} not greater than last value ${value}`)
          }
          let BNRunningValue = BNValue
          if(!BNLockedBalance.isZero()) {
            if (BNRunningValue.gt(BNLockedBalance)) {
              balanceUpdate.lockedBalance = '0'
              funding.lockedBalance = BNLockedBalance.toString()
              BNRunningValue = BNRunningValue.sub(BNLockedBalance) //use up the entire lock balance
            } else {
              funding.lockedBalance = BNRunningValue.toString()
              balanceUpdate.lockedBalance = BNLockedBalance.sub(BNRunningValue).toString()
              BNRunningValue = web3.utils.toBN('0')
            }
          }

          if (!BNRunningValue.isZero()) {
            if (BNRunningValue.eq(BNBalance)) {
              balanceUpdate.balance = '0'
              funding.balance = BNBalance.toString()
            } else if (BNRunningValue.lt(BNBalance)) {
              funding.balance = BNRunningValue.toString()
              balanceUpdate.balance = BNBalance.sub(BNRunningValue).toString()
            } else {
              throw new Error('Running balance exceeds balance')
            }
          }
        }
        let code
        if (!to && offerTerms.useServerCode) {
          code = shortid.generate()
        }

        const initInfo = {offerCreated:{listingID, offerID}, offerTerms}
        const contractOffer = { funding, promote, status:'1', totalValue:value, value, seller:to, buyer:from, verifier }
        

        const offerData = {
          from,
          to,
          fullId,
          amount : web3.utils.fromWei( contractOffer.totalValue ),
          amountType: 'chai',
          contractOffer,
          initInfo,
          active: true
        }
        if (code) {
          offerData.code = code
        }

        if (stripeCharge) {
          // store the stripe charge as part of the contract
          offerData.ccInfo = {stripeCharge}
          // expires in seven days
          initInfo.expiresDate = (new Date( stripeCharge.created * 1000 + 7 * 24 * 3600 * 1000)).toISOString()
        }
        await db.WebrtcOffer.create(offerData, {transaction})
        await user.update({...balanceUpdate, lastOfferId:offerID}, {transaction})
      })
      this.sendUpdated(from)
      return {listingID, offerID, transactionHash:'C'}
    } else {
      throw new Error("Cannot auth create offer")
    }
  }

  async acceptOffer(acceptance, signature, args) {
    const {accept, offerID, listingID, from, createDate} = acceptance
    const currentDate = new Date()
    const tsDate = new Date(createDate)
    const message = JSON.stringify(acceptance)
    const recovered = web3.eth.accounts.recover(message, signature)

    if (!isCentralized(listingID)) {
      throw new Error("Cannot accept none centralized offer")
    }

    if (accept && recovered == from && currentDate - tsDate <  60 * 1000) //you got a minute to submit this thing
    {
      const fullId = getFullId(listingID, offerID)
      const dbOffer = await db.WebrtcOffer.findOne({ where: {fullId}})

      if (dbOffer.active && !dbOffer.to && args.code == dbOffer.code) {
        //if the codes match let's accept it
        await dbOffer.update({to:from})
      }

      if (dbOffer.to == from && dbOffer.contractOffer.status == '1') {
        const contractOffer = dbOffer.contractOffer
        const {stripeCharge} = dbOffer.ccInfo || {}
        const ccInfo = dbOffer.ccInfo

        //actually capture and lock in the charge
        if (stripeCharge) {
          ccInfo.capturedStripeCharge = await stripe.captureCharge(stripeCharge.id)
        }

        //set as accepted
        contractOffer.status = '2'
        //ensure the reciever actually exists
        await db.UserInfo.upsert({ethAddress:from})
        await dbOffer.update({contractOffer, ccInfo})
        return {listingID, offerID, transactionHash:'C'}
      }
    } else {
      throw new Error("Acceptance signature not validated")
    }
  }

  async withdrawOffer(withdrawal, signature) {
    const {withdraw, offerID, listingID, from, createDate} = withdrawal
    const currentDate = new Date()
    const tsDate = new Date(createDate)
    const message = JSON.stringify(withdrawal)
    const recovered = web3.eth.accounts.recover(message, signature)

    if (!isCentralized(listingID)) {
      throw new Error("Cannot accept none centralized offer")
    }

    if (withdrawal && recovered == from && currentDate - tsDate <  60 * 1000) //you got a minute to submit this thing
    {
      const fullId = getFullId(listingID, offerID)

      await db.sequelize.transaction(async (transaction) => {
        const dbOffer = await db.WebrtcOffer.findOne({ where: {fullId}}, {transaction})
        if (dbOffer.from == from && dbOffer.contractOffer.status == '1') {
          const contractOffer = dbOffer.contractOffer
          const {stripeCharge} = dbOffer.ccInfo || {}
          const ccInfo = dbOffer.ccInfo
          //set as accepted
          contractOffer.status = null
          const funding = contractOffer.funding

          const payer = await db.UserInfo.findOne({ where: {ethAddress:from } }, {transaction})
          const balanceUpdate = {}

          if (funding.promoteBalance) {
            balanceUpdate.promoteBalance = addBNs(payer.promoteBalance, funding.promoteBalance)
          }

          if (funding.lockedBalance) {
            balanceUpdate.lockedBalance = addBNs(payer.lockedBalance, funding.lockedBalance)
          }

          if (funding.balance) {
            balanceUpdate.balance = addBNs(payer.balance, funding.balance)
          }

          if (stripeCharge) {
            ccInfo.stripeRefund = await stripe.refundCharge(stripeCharge.id, undefined, true)
          }

          await payer.update(balanceUpdate, {transaction})
          await dbOffer.update({active:false, contractOffer, ccInfo}, {transaction})
        } else {
          throw new Error("invalid offer to withdraw")
        }
      })
      this.sendUpdated(from)
      return true
    }
  }

  _consumeRefundBalance(BNRefund, user, funding, update, key) {
    if (!BNRefund.isZero() && funding[key]) {
      const BNBalance = web3.utils.toBN(funding[key])
      if (BNBalance.gt(BNRefund)) {
        update[key] = addBNs(user[key], BNRefund)
        return web3.utils.toBN('0')
      } else {
        update[key] = addBNs(user[key], BNBalance)
        return BNRefund.sub(BNBalance)
      }
    }
    return BNRefund
  }

  async claimOffer(listingID, offerID, ipfsBytes, payout, signature) {
    //
    // TODO: move this to client side later
    //
    //
    const fullId = getFullId(listingID, offerID)
    if (!isCentralized(listingID)) {
      throw new Error("Cannot claim none centralized offer")
    }

    const recoveredAddress = await this.hot.recoverFinalize(toSignListingID(listingID), offerID, ipfsBytes, payout, '0', signature)

    let from, to;

    await db.sequelize.transaction(async (transaction) => {
      const dbOffer = await db.WebrtcOffer.findOne({ where: {fullId}}, {transaction})
      if (dbOffer && dbOffer.active && dbOffer.contractOffer) {
        const {contractOffer} = dbOffer

        if (dbOffer.to != recoveredAddress) {
          throw new Error(`${recoveredAddress} does not offer to ${dbOffer.to}`)
        }
        
        if (contractOffer.status != '2') {
          throw new Error(`Claim invalid offer status of ${contractOffer.status}`)
        }
        from = dbOffer.from
        to = dbOffer.to
        
        if (payout != dbOffer.lastVoucher.payout) {
          throw new Error(`${payout} does not match voucher payout: ${dbOffer.lastVoucher.payout}`)
        }

        const payerBalanceUpdate = {}
        const recBalanceUpdate = {}

        const payer = await db.UserInfo.findOne({ where: {ethAddress:dbOffer.from } }, {transaction})
        const receiver = await db.UserInfo.findOne({ where: {ethAddress:dbOffer.to } }, {transaction})

        if (contractOffer.promote) {
          //promote moves from promote into locked
          recBalanceUpdate.lockedBalance = addBNs(receiver.lockedBalance, payout)
        } else {
          recBalanceUpdate.balance = addBNs(receiver.balance, payout)
        }

        let BNRefund = web3.utils.toBN(contractOffer.value).sub(web3.utils.toBN(payout))
        const funding = contractOffer.funding

        BNRefund = this._consumeRefundBalance(BNRefund, payer, funding, payerBalanceUpdate, 'balance')
        BNRefund = this._consumeRefundBalance(BNRefund, payer, funding, payerBalanceUpdate, 'lockedBalance')
        BNRefund = this._consumeRefundBalance(BNRefund, payer, funding, payerBalanceUpdate, 'promoteBalance')

        const {stripeCharge} = dbOffer.ccInfo || {}
        const ccInfo = dbOffer.ccInfo

        if (stripeCharge && !BNRefund.isZero()) {
          ccInfo.stripeRefund = await stripe.refundCharge(stripeCharge.id, web3.utils.fromWei(BNRefund))
          //consume it all
          BNRefund = web3.utils.toBN('0')
        }

        if (!BNRefund.isZero()) {
          throw new Error(`We cannot consume the entire refund ${funding}  refund: ${BNRefund.toString()}`)
        }

        await payer.update(payerBalanceUpdate, {transaction})
        await receiver.update(recBalanceUpdate, {transaction})       

        contractOffer.status = null
        //collected via server
        contractOffer.collected = true
        await dbOffer.update({active:false, contractOffer, ccInfo}, {transaction})
      } else {
        throw new Error("invalid offer to claim")
      }
    })

    this.sendUpdated(from)
    this.sendUpdated(to)
    return true
  }

  async getUserInfo(ethAddress, watcherAddress) {
    const data = {}
    let info = {}
    const userInfo = await db.UserInfo.findOne({ where: {ethAddress } })
    if (userInfo)
    {
      if (!userInfo.banned && userInfo.info) {
        info = userInfo.info
      } 
      data.hidden = userInfo.hidden
      data.banned = userInfo.banned
      data.reports = userInfo.flags
      data.blockingYou = (await this.getRedis(getBlockKey(watcherAddress, ethAddress))) ? true:undefined
      data.blockedByYou = (await this.getRedis(getBlockKey(ethAddress, watcherAddress))) ? true:undefined
    }

    if (userInfo && userInfo.info && userInfo.info.attests) {
      try {
        const attestedSites = await db.AttestedSite.findAll({where:{ethAddress, verified:true}})
        const attests = userInfo.info.attests
        for (const attest of attests.slice()) {
          attest.verified = false
          for(const attested of attestedSites) {
            if (attested.accountUrl == attest.accountUrl 
              && attested.site == attest.site 
              && attested.account == attest.account)
            {
              attest.verified = true
              if(attested.info) {
                attest.info = attested.info
              }
            }
          }
        }
        info.attests = attests.filter(a => a.verified)
      } catch (error) {
        console.log("ERROR verifying attests:", error)
        info.attests = []
      }
    }
    data.active = ethAddress in this.activeAddresses
    return {data, info}
  }

  async getAllAttests(ethAddress) {
    // TODO: this might need to be secured
    const attestedSites = await db.AttestedSite.findAll({where:{ethAddress, verified:true}})
    const result = []

    for (const attestedSite of attestedSites) {
      const {site, account, accountUrl} = attestedSite

      const inboundLinks = await db.InboundAttest.findAll({where:{attestedSiteId:attestedSite.id}})

      const links = inboundLinks.map(l => l.sanitizedUrl)

      result.push({site, account, accountUrl, links})
    }

    return result
  }

  async forceAttest(ethAddress, referralUrl) {
    const attestUrl = this.linker.getDappUrl() + "profile/" + ethAddress + "?attest"
    const attest = await this.registerReferral(ethAddress, attestUrl, referralUrl, true)
    const user = await db.UserInfo.findOne({ where: {ethAddress} })
    if (user.info) {
      const info = user.info
      const attests = info.attests || []
      attests.push(attest)
      info.attests = attests
      await user.update({info})
      return true
    }
  }

  async registerReferral(ethAddress, attestUrl, referralUrl, ignoreAttest) {
    const a = new URL(attestUrl)
    const paths = a.pathname.split("/")
    const query = querystring.parse(a.search.substring(1))
    let passedAddress = query.p
    if (paths[paths.length -2] == 'profile' || paths[paths.length -2] == 'p'){
      passedAddress = paths[paths.length -1]
    }
    if (!(passedAddress == ethAddress && "attest" in query))
    {
      // TODO:need to make sure domain matches as well! 
      // a.host  == some config value
      throw new Error(`${attestUrl} does not match ${ethAddress}`)
    }
    const inbound = await db.InboundAttest.findOne({ where: {ethAddress, url:referralUrl } })

    if (!inbound || !inbound.verified) {
      // TODO: check the update time so that we don't hammer the sites
      const {site, account, accountUrl, sanitizedUrl} = await extractAttestInfo(attestUrl, referralUrl, ignoreAttest)

      if (site && account)
      {
        let attested = await db.AttestedSite.findOne({ where: {ethAddress, site, account}})
        if (!attested) {
          attested = await db.AttestedSite.create({ethAddress, site, account, accountUrl, verified:true})
        }
        //update the stats
        const info = await extractAccountStat(attested.accountUrl)
        if (info)
        {
          attested.update({info})
        }
        await db.InboundAttest.upsert({attestedSiteId:attested.id, ethAddress, url:referralUrl, verified:true, sanitizedUrl})
        return { site, account, accountUrl, links:[sanitizedUrl] }
      }
    } else if (inbound && inbound.verified) {
      const attested = await db.AttestedSite.findByPk(inbound.attestedSiteId)
      if (attested) {
        //update the stats
        const info = await extractAccountStat(attested.accountUrl)
        if (info)
        {
          attested.update({info})
        }
        const {site, account, accountUrl, verified} = attested
        return { site, account, accountUrl, links:[inbound.sanitizedUrl] }
      } else {
        throw new AttestationError('Can not find Attestation Site')
      }
    }
    throw new AtttestationError("Invalid attestation")
  }

  async verifyAcceptOffer(ethAddress, ipfsHash, behalfFee, sig, listingID, offerID, args) {
    const offer = await this.getOffer(listingID, offerID)

    // it's an active offer to an url
    if (offer.active) {
      if (!offer.to) {
        //ok it's an emptry address
        //let's look at the terms
        const offerTerms = offer.initInfo.offerTerms
        if (offerTerms.useServerCode && args.code == offer.code) {
          if (this.hot.checkMinFee(behalfFee)) {
            console.log("Submitting to block chain :", [listingID, offerID, ipfsHash, behalfFee, ethAddress, sig])
            return this.hot._submitMarketplace("verifyAcceptOfferOnBehalf", 
              [listingID, offerID, ipfsHash, behalfFee, ethAddress, sig.v, sig.r, sig.s])
          }
        }
      } else if (offer.to.startsWith("http")) {
        //let's verify that it's from the right account
        const attested = await db.AttestedSite.findOne({ where: {ethAddress, accountUrl:offer.to} })
        if (attested && attested.verified) {
          if (this.hot.checkMinFee(behalfFee)) {
            return this.hot._submitMarketplace("verifyAcceptOfferOnBehalf", 
              [listingID, offerID, ipfsHash, behalfFee, ethAddress, sig.v, sig.r, sig.s])
          }
        }
      }     
    }
    return {}
  }

  async updateIncreasingVoucher(ethAddress, voucher) {
    //
    // TODO: move this to client side later
    //
    const {listingID, offerID, ipfsHash, fee, payout, signature} = voucher
    const offer = await this.getOffer(listingID, offerID)

    if(offer.active && this.isOfferAccepted(offer) && offer.to == ethAddress && fee =='0'){
      const BNpayout = web3.utils.toBN(payout)
      if (web3.utils.toBN(offer.contractOffer.totalValue).lt(BNpayout)) {
        //payout too large
        return
      }
      voucher.escrowedAmount = offer.contractOffer.totalValue
      if (offer.lastVoucher) {
        if (web3.utils.toBN(offer.lastVoucher.payout).gte(BNpayout))
        {
          return
        }
      }
      const recoveredAddress = await this.hot.recoverFinalize(toSignListingID(listingID), offerID, ipfsHash, payout, fee, signature)
      if (recoveredAddress == offer.contractOffer.verifier || recoveredAddress == offer.from )
      {
        await offer.update({lastVoucher:voucher})
        return true
      }

      if(recoveredAddress == this.hot.account.address && (recoveredAddress == offer.from || recoveredAddress == offer.initInfo.offerTerms.sideVerifier)) 
      {
        await offer.update({lastVoucher:voucher})
        return true
      }
    }
  }

  async verifyServerFinalize(listingID, offerID, ipfsBytes, verifyFee, payout, sig) {
    const offer = await this.getOffer(listingID, offerID)

    if(offer.active && offer.contractOffer.verifier == this.hot.account.address){
      const recoveredAddress = await this.hot.recoverFinalize(toSignListingID(listingID), offerID, ipfsBytes, payout, verifyFee, sig)
      return recoveredAddress == offer.from || recoveredAddress == offer.initInfo.offerTerms.sideVerifier
    }
  }

  async verifySubmitFinalize(listingID, offerID, ipfsHash, behalfFee, fee, payout, sellerSig, sig) {
    if (await this.verifyServerFinalize(listingID, offerID, ipfsHash, fee, payout, sig)) {
      //rewrite the sig to use the server verifier
      sig = await this.hot.signFinalize(listingID, offerID, ipfsHash, payout, fee)
    }
    return this.hot.submitMarketplace('verifiedOnBehalfFinalize',
        [listingID, offerID, ipfsHash, behalfFee, fee, payout, sellerSig.v, sellerSig.r, sellerSig.s, sig.v, sig.r, sig.s]
    )
  }

  async getDbOffer(listingID, offerID) {
    const fullId = getFullId(listingID, offerID)
    return await db.WebrtcOffer.findOne({ where: {fullId}})
  }

  async getDBOfferByCode(code) {
    return await db.WebrtcOffer.findOne({ where: {code}})
  }

  async getOffer(listingID, offerID, transactionHash, blockNumber, _dbOffer) {
    const fullId = getFullId(listingID, offerID)
    const dbOffer = _dbOffer || await db.WebrtcOffer.findOne({ where: {fullId}})

    if (isCentralized(listingID)) {
      return dbOffer
    }

    const contractOffer = filterObject(await this.contract.methods.offers(listingID, offerID).call())

    if (!contractOffer || (contractOffer.status == '0' && contractOffer.buyer == emptyAddress)){
      if (!dbOffer){
        return null
      }

      if (!dbOffer.active)
      {
        return dbOffer
      }

      dbOffer.active = false
      await dbOffer.save()
      return dbOffer
    }

    contractOffer.totalValue = web3.utils.toBN(contractOffer.value).sub(web3.utils.toBN(contractOffer.refund)).toString()

    if (dbOffer && _.isEqual(contractOffer, dbOffer.contractOffer) && !(transactionHash && blockNumber))
    {
      return dbOffer
    }

    const intStatus = Number(contractOffer.status)

    let to = contractOffer.seller
    if (to == emptyAddress) {
      to = undefined
    }

    const from = contractOffer.buyer
    let code

    // grab info if available...
    let initInfo
    if (transactionHash && blockNumber) {
      logger.info("grabbing event from:", transactionHash, blockNumber, contractOffer.buyer, listingID, offerID)
      await new Promise((resolve, reject) => {
        this.contract.getPastEvents('OfferCreated', {
          filter: {party:contractOffer.buyer, listingID, offerID},
          fromBlock:blockNumber,
          toBlock:blockNumber
        }, (error, events) => {
          if (events.length > 0 )
          {
            const event = events[0]
            logger.info("event retreived:", event, error)
            if (event && event.transactionHash == transactionHash) {
              const offerCreated = filterObject(event.returnValues)
              initInfo = {offerCreated, transactionHash, blockNumber}
              logger.info("initInfo:", initInfo)
            }
          }
          resolve(true);
        })
      })
      if (initInfo && initInfo.offerCreated.ipfsHash)
      {
        const offerTerms =  await origin.ipfsService.loadObjFromFile(
          origin.contractService.getIpfsHashFromBytes32(initInfo.offerCreated.ipfsHash)
        )
        // if there's no to address then we this is an open offer and we want to check if there's a 
        // different term for it
        if (!to && offerTerms.toVerifiedUrl && contractOffer.verifier == this.hot.account.address) {
          to = offerTerms.toVerifiedUrl
        }
        if (!to && offerTerms.useServerCode) {
          code = shortid.generate()
          console.log("Generating code as:", code)
        }
        initInfo.offerTerms = offerTerms
      }
    }


    const offer = {
      from,
      to,
      fullId,
      amount : web3.utils.fromWei( contractOffer.totalValue ),
      amountType: 'eth',
      contractOffer,
      initInfo,
      active: intStatus == 1 || intStatus == 2
    }

    if (code) {
      offer.code = code
    }
    await db.WebrtcOffer.upsert(offer)
    return db.WebrtcOffer.findOne({ where: {fullId}})
  }

  async sendNotificationMessage(ethAddress, msg, data, collapseId, silent) {
    const notifees = await db.WebrtcNotificationEndpoint.findAll({ where: { ethAddress, active:true } })
    for (const notify of notifees) {
      try {
        this.linker.sendNotify(notify, msg, data, collapseId, silent)
      } catch (error) {
        logger.info("Error sending notification:", notify, error)
      }
    }
  }

  async getEthToUsdRate() {
    const KEY = "ethcam.ETHtoUSD"
    let rate = await new Promise((resolve, reject) => {
      this.redis.get(KEY, (err, res)=> {
        if (err) {
          resolve(null)
        }
        resolve(res)
      })
    })

    if (rate) {
      return Number(rate)
    }

    rate = await getEthToUSDRate()

    this.redis.set(KEY, rate.toString(), 'EX', 30);
    return rate
  }

  isOfferAccepted(offer) {
    return Number(offer.contractOffer.status) == 2
  }

  async getDisplayOffer(listingID, offerID) {
    const offer = await this.getOffer(listingID, offerID)
    const o = offer.get({plain:true})
    delete o.ccInfo
    return o
  }

  async getOffers(ethAddress, options) {
    const {ignoreBlockchain} = options

    const offers = await db.WebrtcOffer.findAll({where: {
      active:true,
      [db.Sequelize.Op.or]: [ {to:ethAddress}, {from:ethAddress} ] }})

    if (ignoreBlockchain) {
      return offers.map(o => { 
        const offer = o.get({plain:true})
        delete offer.ccInfo
        return offer
      })
    } else {
      const updatedOffers = await Promise.all(offers.map(o => {
        const {listingID, offerID} = splitFullId(o.fullId)
        return this.getOffer(listingID, offerID, undefined, undefined, o)
      }))

      return updatedOffers.map(o=> { 
        const offer = o.get({plain:true})
        delete offer.ccInfo
        return offer
      })
    }
  }

  getIpfsUrl(hash) {
    return `${this.linker.getIpfsGateway()}/ipfs/${hash}`
  }

  async getUsdAmount(amount, amountType) {
    if (amountType == 'chai') {
      return amount
    } else if (amountType == 'eth') {
      const rate = await this.getEthToUsdRate()
      return amount * rate
    }
  }

  async getPage(accountAddress, offerCode) {
    const BUNDLE_PATH = process.env.BUNDLE_PATH || "/"
    const keywords = "video, chat, ethereum, facetoface"
    if (accountAddress && accountAddress.startsWith("0x"))
    {
      const rate = await this.getEthToUsdRate()
      const result = await this.getUserInfo(accountAddress)
      const account = result.info

      const minCost = Number(account.minCost || 0.05)
      const minUsdCost = (minCost * rate).toFixed(2)
      const minChaiUsdCost = (await this.getUsdAmount(minCost * USD_MIN_COST_RATE, 'chai')).toFixed(2)
      const name = account.name || accountAddress
      const title = `Talk with me on Chai -- ${name}`
      const description = (account.description || '')
      const url = this.linker.getDappUrl() + "profile/" + accountAddress
      const imageUrl = account.icon && this.getIpfsUrl(account.icon)
      const ogType = "profile"
      const twitterType = "summary_large_image"

      // map in the iconSource
      if( imageUrl ) {
        account.iconSource = {uri:imageUrl}
      }
      account.minUsdCost = minUsdCost
      account.minChaiUsdCost = minChaiUsdCost
      return createHtml({title, description, url, imageUrl, ogType, twitterType}, {account}, BUNDLE_PATH)
    } else if (offerCode) { 
      const rate = await this.getEthToUsdRate()
      const offer = (await this.getDBOfferByCode(offerCode)).get({plain:true})
      delete offer.ccInfo
      const accountAddress = offer.from
      const result = await this.getUserInfo(accountAddress)
      const account = result.info

      const amountUsd = (offer.amountType == 'chai' ?  Number(offer.amount) : Number(offer.amount) * rate).toFixed(2)
      const name = account.name || accountAddress
      const title = `Talk with me on Chai -- ${name}`
      const description = (account.description || '')
      const url = this.linker.getDappUrl() + "profile/" + accountAddress
      const imageUrl = account.icon && this.getIpfsUrl(account.icon)
      const ogType = "profile"
      const twitterType = "summary_large_image"

      // map in the iconSource
      if( imageUrl ) {
        account.iconSource = {uri:imageUrl}
      }
      offer.amountUsd = amountUsd
      return createHtml({title, description, url, imageUrl, ogType, twitterType}, {account, offer}, BUNDLE_PATH)
    } else {
      const ogType = "website"
      const twitterType = "summary"
      const title = "Chai: Exclusive Video Access"
      const description = "Support and get exclusive video access to all your favorite experts, influencers, thought leaders, streamers."
      const url = this.linker.getDappUrl() 
      const imageUrl = "https://chai.video/images/chai-logo.jpg"
      return createHtml({title, description, url, imageUrl, ogType, twitterType}, {index:true}, BUNDLE_PATH)
    }
  }
  
  async flagAddress(ethAddress, flagger, reason, timestamp, signature) {
    const userInfo = await db.UserInfo.findOne({ where: {ethAddress} })

    this.redis.lpush(`flag.${ethAddress}`, JSON.stringify({flagger, reason, timestamp, signature}))
    if (!userInfo) {
      await db.UserInfo.upsert({ethAddress:ethAddress, flags:1})
    } else {
      await userInfo.update({flags:userInfo.flags + 1})
    }
  }

  async getRedis(key) {
    return new Promise((resolve, reject) => {
      this.redis.get(key, (err, reply) => {
        if (err) {
          reject(err)
        } else {
          resolve(reply)
        }
      })
    })
  }

  async processLinkedinAuth(query) {
    const {code, state} = query
    if (code && state && state.startsWith('0x')) {
      const ethAddress = state
      const redirectUrl = this.linker.getDappUrl() + 'api/wallet-linker/linkedin-authed'
      const clientId = process.env.LINKEDIN_CLIENT_ID
      const secret = process.env.LINKEDIN_SECRET
      const {site, account, accountUrl, sanitizedUrl, info} = await extractLinkedin(code, clientId, redirectUrl, secret)

      let attested = await db.AttestedSite.findOne({ where: {ethAddress, site, account}})
      if (!attested) {
        attested = await db.AttestedSite.create({ethAddress, site, account, accountUrl, verified:true})
      }
      if (info)
      {
        attested.update({info})
      }
      await db.InboundAttest.upsert({attestedSiteId:attested.id, ethAddress, url:accountUrl, verified:true, sanitizedUrl})
      return {site, account, accountUrl, sanitizedUrl}
    }
    return {error:query.error}
  }

  async givePromoteCoins(ethAddress, amount) {
    const coins = web3.utils.toWei(amount)

    await db.sequelize.transaction(async (transaction) => {
      const user= await db.UserInfo.findOne({ where: {ethAddress} }, {transaction})
      if (!user) {
        await db.UserInfo.create({ethAddress, promoteBalance: coins.toString()}, {transaction})
      } else {
        await user.update({promoteBalance: addBNs(user.promoteBalance, coins)}, {transaction})
      }
    })
    return true
  }

  async emailWithdraw(ethAddress, amount, amountType, amountUsd, transactionHash, recipientInfo) {
    const network = await web3.eth.net.getNetworkType()
    const subject = `[${network}] ${ethAddress} have requested a withdraw of ${amountUsd}`
    const text = `[${network}] ${ethAddress} have sent over ${amount} ${amountType} in order to withdraw $${amountUsd}. The transaction hashis ${transactionHash}. He would like to be paid via ${JSON.stringify(recipientInfo)}`
    emailSupport('withdrawRequest@chai.video', subject, text)
  }

  async submitWithdraw(ethAddress, amount, amountType, amountUsd, transactionHash, recipientInfo, signature) {
    const msgData = {amount, amountType, amountUsd, transactionHash, recipientInfo}
    const recovered = web3.eth.accounts.recover(JSON.stringify(msgData), signature)
    if(ethAddress == recovered) {
      if (amountType == 'eth') {
        await db.Withdrawal.upsert({ethAddress, amount, amountType, amountUsd, transactionHash, recipientInfo, signature})
        this.emailWithdraw(ethAddress, amount, amountType, amountUsd, transactionHash, recipientInfo)
        return true
      } else if (amountType == 'chai') {
        await db.sequelize.transaction(async (transaction) => {
          const user = await db.UserInfo.findOne({ where: {ethAddress} }, {transaction})
          const BNValue = web3.utils.toBN(web3.utils.toWei(amount))
          const BNBalance = web3.utils.toBN(user.balance)
          if (BNBalance.lt(BNValue)) {
            throw new Error("You do not have enough chai to withdraw.")
          }
          const NewBalance = BNBalance.sub(BNValue)
          await user.update({balance:NewBalance.toString()}, {transaction})
          await db.Withdrawal.create({ethAddress, amount, amountType, amountUsd, transactionHash, recipientInfo, signature}, {transaction})
        })
        this.emailWithdraw(ethAddress, amount, amountType, amountUsd, transactionHash, recipientInfo)
        this.broadcastUpdated(ethAddress)
        return true
      }
    }
  }

}
