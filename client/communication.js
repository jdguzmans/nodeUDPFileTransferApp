const config = require('../config')
const fs = require('fs')
const dgram = require('dgram')
const maxBufferSize = config.maxBufferSize
const doWhilst = require('async/doWhilst')
let client = dgram.createSocket('udp4')

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
        let buffersize = null
        let filesize = null
        let filebuffers = []
        let totalFragments = null
        client.on('message', (msg, rinfo) => {
          if (buffersize === null) {
            let msgString = msg.toString()
            let msgParts = msgString.split(' ')
            if (msgParts.length === 3 && msgParts[0] === 'f') {
              buffersize = Number(msgParts[2])
              filesize = Number(msgParts[1])
              totalFragments = (filesize % buffersize) !== 0 ? parseInt(filesize / buffersize) + 1 : parseInt(filesize / buffersize)
              console.log('file parameters recieved: buffer size : ' + buffersize + 'B , file size ' + filesize + 'B fragments ' + totalFragments)
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
              resolve()
            }
          }
        })
      }
    })
  })
}

exports.sendFile = (filename) => {
  return new Promise((resolve, reject) => {
    fs.readFile('./files/' + filename, (err, file) => {
      if (err) throw err

      // FRAGMENTATION
      let dataTransfered = 0
      let dataSize = file.length
      let fragments = []

      while (dataTransfered !== dataSize) {
        let max = (dataTransfered + maxBufferSize) < dataSize ? dataTransfered + maxBufferSize : dataSize
        fragments.push(file.slice(dataTransfered, max))
        dataTransfered = max
      }
      let init = Buffer.from('f ' + filename + ' ' + file.length + ' ' + fragments.length)

      client.send(init, 0, init.length, config.server.port, config.server.host, (err, bytes) => {
        if (err) throw err
        if (file.length > maxBufferSize) {
          let i = 0
          doWhilst((cb) => {
            let toSend = {
              // Sequence number
              n: i,
              // TimeStamp
              ts: new Date(),
              // File Fragment
              ff: fragments[i]
              // MAYBE FILE FRAGMENT SIZE ??
            }
            let toSendS = JSON.stringify(toSend)
            client.send(toSendS, 0, toSendS.length, config.server.port, config.server.host, (err, bytes) => {
              if (err) throw err
              i++
              cb()
            })
          },
          () => {
            return i !== fragments.length
          },
          (err) => {
            if (err) throw err
            console.log('file sent')
            resolve()
          })
        }
      })
    })
  })
}

exports.sendObjects = (number) => {
  return new Promise((resolve, reject) => {
    let init = Buffer.from('o ' + number)

    client.send(init, 0, init.length, config.server.port, config.server.host, (err, bytes) => {
      if (err) throw err
      let i = 0
      doWhilst((cb) => {
        let toSend = {
          n: i,
          ts: new Date().getTime()
        }
        let toSendS = JSON.stringify(toSend)
        client.send(toSendS, 0, toSendS.length, config.server.port, config.server.host, (err, bytes) => {
          if (err) throw err
          client.on('message', (msg, rinfo) => {
            let ack = JSON.parse(msg.toString())
            if (ack.n === i) {
              i++
              cb()
            }
          })
        })
      },
      () => {
        return i !== number
      },
      (err) => {
        if (err) throw err
        console.log('objects sent')
        resolve()
      })
    })
  })
}

sendObject = function (i, n, cb) {

}

// client.send(message, 0, message.length, config.server.port, config.server.host, (err, bytes) => {
//   if (err) throw err
//   console.log('UDP message sent to ' + config.server.host + ':' + config.server.port)
//   client.close()
// })
