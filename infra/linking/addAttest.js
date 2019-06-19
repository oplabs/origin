import Webrtc from './src/logic/webrtc'
import db from './src/models/'
import Linker from './src/logic/linker'
const linker = new Linker()
const webrtc = new Webrtc(linker)

if (process.argv.length < 4) {
  console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <ethAddress> <referralUrl>`)
  process.exit()
} else {
  webrtc.forceAttest(process.argv[2], process.argv[3]).then(result => {
    console.log(`done:`, result)
    process.exit()
  })
}
