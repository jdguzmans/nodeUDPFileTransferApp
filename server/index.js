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
  let param = msgParts[1]

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
    let filename = param
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
  }
})