const config = require('../config')

const dgram = require('dgram')
const client = dgram.createSocket('udp4')

exports.listFiles = () => {
  return new Promise((resolve, reject) => {
    let message = Buffer.from('li')
    client.send(message, 0, message.length, config.server.port, config.server.host, (err, bytes) => {
      if (err) reject(err)
      else {
        client.on('message', (msg, rinfo) => {
          let msgString = msg.toString()
          let msgParts = msgString.split(' ')
          let files = []
          msgParts.forEach(file => {
            files.push(file)
          })
          resolve(files)
          client.close()
        })
      }
    })
  })
}

// client.send(message, 0, message.length, config.server.port, config.server.host, (err, bytes) => {
//   if (err) throw err
//   console.log('UDP message sent to ' + config.server.host + ':' + config.server.port)
//   client.close()
// })
