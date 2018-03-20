const config = require('../config')
const fs = require('fs')
const dgram = require('dgram')
const server = dgram.createSocket('udp4')

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
    fs.readFile('./files/' + filename, (err, data) => {
      if (err) throw err
      server.send(data, 0, data.length, rinfo.port, rinfo.address, (err, bytes) => {
        if (err) throw err
        console.log('file sent to ' + rinfo.address + ':' + rinfo.port)
      })
    })
  }
})

server.on('listening', () => {
  const address = server.address()
  console.log('UDP server listening on ' + address.address + ':' + address.port)
})

server.bind(config.server.port, config.server.host)
