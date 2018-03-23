const config = require('../config')
const fs = require('fs')
const dgram = require('dgram')
const server = dgram.createSocket('udp4')
const maxBufferSize = config.maxBufferSize
const doWhilst = require('async/doWhilst')

server.on('listening', () => {
  server.setSendBufferSize(maxBufferSize)
  const address = server.address()
  console.log('UDP server listening on ' + address.address + ':' + address.port + ' buffersize: ' + maxBufferSize + 'B')
})

server.bind(config.server.port, config.server.host)

server.on('error', (err) => {
  console.log('server error: \n' + err.stack)
  server.close()
})

server.on('message', (msg, rinfo) => {
  console.log('server got: ' + msg + ' from ' + rinfo.address + ':' + rinfo.port)
  let msgString = msg.toString()
  let msgParts = msgString.split(' ')
  let command = msgParts[0]

  if (command === 'l') {
    fs.readdir('./files', (err, files) => {
      if (err) throw err
      let ansString = ''
      files.forEach((file, i) => {
        if (i === (files.length - 1)) {
          ansString += file
        } else {
          ansString += file + ' '
        }
      })
      let ans = Buffer.from(ansString)
      server.send(ans, 0, ans.length, rinfo.port, rinfo.address, (err, bytes) => {
        if (err) throw err
        // else server.close()
      })
    })
  } else if (command === 'g') {
    let filename = msgParts[1]
    fs.readFile('./files/' + filename, (err, file) => {
      if (err) throw err
      let ans = Buffer.from('f ' + file.length + ' ' + maxBufferSize)
      server.send(ans, 0, ans.length, rinfo.port, rinfo.address, (err, bytes) => {
        if (err) throw err
        if (file.length > maxBufferSize) {
          let dataTransfered = 0
          let dataSize = file.length
          let fragments = []
          console.log('preparing fragmentation ... ')

          while (dataTransfered !== dataSize) {
            let max = (dataTransfered + maxBufferSize) < dataSize ? dataTransfered + maxBufferSize : dataSize
            fragments.push(file.slice(dataTransfered, max))
            dataTransfered = max
          }
          console.log('file to send size ' + file.length + 'B buffer size: ' + maxBufferSize + 'B fragments ' + fragments.length)

          let i = 0
          doWhilst((cb) => {
            server.send(fragments[i], 0, fragments[i].length, rinfo.port, rinfo.address, (err, bytes) => {
              if (err) throw err
              console.log('file fragments sent ' + (i + 1) + ' of ' + fragments.length)
              i++
              cb()
            })
          },
          () => {
            return i !== fragments.length
          },
          (err) => {
            if (err) throw err
            console.log('file sent to ' + rinfo.address + ':' + rinfo.port)
          })
        } else {
          server.send(file, 0, file.length, rinfo.port, rinfo.address, (err, bytes) => {
            if (err) throw err
            console.log('file sent to ' + rinfo.address + ':' + rinfo.port)
          })
        }
      })
    })
  } else if (command === 'f') {
    let filename = msgParts[1]
    let filesize = msgParts[2]
    let fragments = msgParts[3]

    let received = 0

    let filebuffers = new Array(fragments)

    server.on('message', (msg, rinfo) => {
      let obj = JSON.parse(msg.toString())

      let number = obj.n
      let timeStamp = obj.ts
      let fragment = Buffer.from(obj.ff.data)

      filebuffers.push(fragment)
      received++

      if (received === (fragments - 1)) {
        let wStream = fs.createWriteStream('./files/' + filename)
        let buffersTotal = Buffer.concat(filebuffers, filesize)
        wStream.write(buffersTotal)
        wStream.end()
        console.log('done')
      }
    })
  } else if (command === 'o') {
    let number = msgParts[1]
    let i = 0
    let filename = rinfo.address.replace('.', '_') + '_' + rinfo.port
    let wStream = fs.createWriteStream('./results/' + filename)
    server.on('message', (msg, rinfo) => {
      let obj = JSON.parse(msg.toString())
      wStream.write(obj.n + ' ' + (new Date().getTime() - obj.ts) + ' ms\n')
      let ack = {
        n: obj.n
      }
      let ackS = JSON.stringify(ack)
      server.send(ackS, 0, ackS.length, rinfo.port, rinfo.address, (err, bytes) => {
        if (err) throw err
      })
      i++
      if (i === number) {
        wStream.end()
      }
    })
  }
})
