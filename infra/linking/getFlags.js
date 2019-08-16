import Webrtc from './src/logic/webrtc'

const webrtc = new Webrtc()
async function getFlags(ethAddress) {
  return new Promise((resolve, reject) => webrtc.redis.lrange(`flag.${ethAddress}`, 0, -1, (err, items) => {
    if (err) {
      reject('empty list')
    } else {
      resolve(items)
    }
  }))
}

getFlags(process.argv[2]).then(result => {
  console.log(`flags[${process.argv[2]}]:`, result)
  process.exit(1)
})
