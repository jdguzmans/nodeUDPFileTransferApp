const config = require('../config')
const fs = require('fs')
const dgram = require('dgram')
const client = dgram.createSocket('udp4')

exports.listRemoteFiles = () => {
  return new Promise((resolve, reject) => {
    let message = Buffer.from('l')
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
        })
      }
    })
  })
}

exports.getFile = (filename) => {
  return new Promise((resolve, reject) => {
    let message = Buffer.from('g ' + filename)
    client.send(message, 0, message.length, config.server.port, config.server.host, (err, bytes) => {
      if (err) reject(err)
      else {
        client.on('message', (msg, rinfo) => {
          let wStream = fs.createWriteStream('./files/' + filename)
          wStream.write(msg)
          wStream.end()
          console.log('Transfer complete')
          resolve()
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
