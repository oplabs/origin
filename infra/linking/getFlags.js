import Webrtc from './src/logic/webrtc'

const webrtc = new Webrtc()
async function getFlags(ethAddress) {
  return await webrtc.getRedis(`flag.${ethAddress}`)
}

getFlags(process.argv[1]).then(result => {
  console.log(`flags ${result}`)
  process.exit(1)
})
