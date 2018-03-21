const config = require('../config')
const fs = require('fs')
const dgram = require('dgram')
let client = null

exports.listRemoteFiles = () => {
  return new Promise((resolve, reject) => {
    client = dgram.createSocket('udp4')
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
          client.close()
          resolve(files)
        })
      }
    })
  })
}

exports.getFile = (filename) => {
  return new Promise((resolve, reject) => {
    client = dgram.createSocket('udp4')
    let message = Buffer.from('g ' + filename)
    client.send(message, 0, message.length, config.server.port, config.server.host, (err, bytes) => {
      if (err) reject(err)
      else {
        let buffersize = null
        let filesize = null
        let filebuffers = []
        let totalFragments = null
        client.on('message', (msg, rinfo) => {
          if (buffersize === null) {
            let msgString = msg.toString()
            let msgParts = msgString.split(' ')
            if (msgParts.length === 3 && msgParts[0] === 'datafile') {
              buffersize = Number(msgParts[2])
              filesize = Number(msgParts[1])
              totalFragments = (filesize % buffersize) !== 0 ? parseInt(filesize / buffersize) + 1 : parseInt(filesize / buffersize)
              console.log('File parameters recieved \nBuffer size : ' + buffersize + ' File size' + filesize + 'Number Fragments ' + totalFragments)
            }
          } else {
            filebuffers.push(msg)
            console.log('Number of fragments recieved ' + filebuffers.length + ' of ' + totalFragments)
            if (filebuffers.length === totalFragments) {
              let wStream = fs.createWriteStream('./files/' + filename)
              var buffersTotal = Buffer.concat(filebuffers, filesize)
              wStream.write(buffersTotal)
              wStream.end()
              console.log('Transfer complete file saved')
              client.close()
              resolve()
            }
          }
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
