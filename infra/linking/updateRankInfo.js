import Webrtc from './src/logic/webrtc'
import db from './src/models/'
import {extractAccountStat} from './src/utils/extract-attest'

const webrtc = new Webrtc()
async function updateRankInfo(ethAddress) {
  let count = 0
  const attestedSites = await db.AttestedSite.findAll({where:{ethAddress, verified:true}})

  for (const attested of attestedSites) {
    const info = await extractAccountStat(attested.accountUrl)
    await attested.update({info})
    count += 1
  }

  const user = await db.UserInfo.findOne({ where: {ethAddress: ethAddress} })
  const rank = await webrtc.getRank(user.ethAddress, user.info)
  await user.update({rank})
  console.log(`setting rank:${rank} for ethAddress: ${user.ethAddress}`)
  return count
}


if (process.argv.length < 3) {
  console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <ethAddress>`)
  process.exit()
} else {
  updateRankInfo(process.argv[2], process.argv[3]).then(count => {
    console.log(`updated ${count}`)
    process.exit()
  })
}
