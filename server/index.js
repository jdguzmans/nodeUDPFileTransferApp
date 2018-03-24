const config = require('../config')
const fs = require('fs')
const dgram = require('dgram')
const server = dgram.createSocket('udp4')
const maxBufferSize = config.maxBufferSize
const doWhilst = require('async/doWhilst')
const objectDelay = config.objectDelay
let states = []

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
    // LIST FILES
    // ESTA SE PUEDE DEJAR COMO ESTSA PORQUE NO ES NECESARIO MANEJAR ESTADP
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
      })
    })
  } else if (command === 'g') {
    // GET A FILE ---- NOT DONE YET
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
  } else if (command === 'o') {
    // OBJECT START
    let number = msgParts[1]

    let filename = rinfo.address.replace('.', '_') + '_' + rinfo.port
    let wStream = fs.createWriteStream('./results/' + filename)

    states.push({
      type: 'o',
      host: rinfo.address,
      port: rinfo.port,
      filename: filename,
      wStream: wStream,
      received: 0,
      delaySum: 0
    })

    setTimeout(() => {
      let stateIndex = getStateIndex('o', rinfo.port, rinfo.address)
      let state = states[stateIndex]

      state.wStream.write('\naverage delay ' + state.delaySum / state.received + 'ms\n')
      state.wStream.write('lost ' + (number - state.received) + ' datagrams')
      state.wStream.end()

      let ans = {
        averageDelay: state.delaySum / state.received,
        lost: (number - state.received)
      }

      deleteStateByIndex(stateIndex)

      // REPLY
      let ansS = 'oa ' + JSON.stringify(ans)
      let ansB = Buffer.from(ansS)

      server.send(ansB, 0, ansB.length, rinfo.port, rinfo.address, (err, bytes) => {
        if (err) throw err
      })
    }, number * objectDelay)
  } else if (command === 'oi') {
    // OBJECT ITERATION
    let state = states[getStateIndex('o', rinfo.port, rinfo.address)]
    let wStream = state.wStream

    let objS = msgParts[1].toString()
    let obj = JSON.parse(objS)
    let delay = (new Date().getTime() - obj.ts)
    wStream.write(obj.n + ' ' + delay + ' ms\n')

    state.received ++
    state.delaySum += delay
    saveState(state)
  }
})

function getStateIndex (type, port, host) {
  let ans = 0
  states.forEach((state, i) => {
    if (state.type === type && state.port === port && state.host === host) ans = i
  })
  return ans
}

function saveState (toSave) {
  states.forEach((state, i) => {
    if (state.type === toSave.type && state.port === toSave.port && state.host === toSave.host) {
      states[i] = toSave
    }
  })
}

function deleteStateByIndex (index) {
  states.splice(index, 1)
}
