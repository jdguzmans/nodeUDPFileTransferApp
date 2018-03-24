const config = require('../config')
const fs = require('fs')
const dgram = require('dgram')
const server = dgram.createSocket('udp4')
const maxBufferSize = config.maxBufferSize
const doWhilst = require('async/doWhilst')
const objectDelay = config.objectDelay
const fileDelay = config.fileDelay
const crypto = require('crypto')
let hash = null
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
  let msgString = msg.toString()
  let msgParts = msgString.split(' ')
  let command = msgParts[0]
  console.log('server got: ' + msgString[0] + ' from ' + rinfo.address + ':' + rinfo.port)

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
    let filename = msgParts[1]
    // if the client has ot
    let stateIndex = getStateIndex('o', rinfo.address, rinfo.port)
    if (stateIndex !== 0) {
      deleteStateByIndex(stateIndex)
    }
    fs.readFile('./files/' + filename, (err, file) => {
      if (err) throw err
      // msg file size buffer size and begin time
      hash = crypto.createHash('sha256')
      hash.update(file)
      let hashFile = hash.digest('hex')
      console.log('creating hash ... ' + hashFile)
      hash = null
      let beginTime = new Date().getTime()
      let ans = Buffer.from('f ' + file.length + ' ' + maxBufferSize + ' ' + beginTime.toString() + ' ' + hashFile)
      console.log('size message ' + ans.length)
      server.send(ans, 0, ans.length, rinfo.port, rinfo.address, (err, bytes) => {
        if (err) throw err
        let dataTransfered = 0
        let dataSize = file.length
        let segments = []
        console.log('preparing segmentation ... ')
        let index = 100001
        while (dataTransfered !== dataSize) {
          let max = (dataTransfered + maxBufferSize - 6) < dataSize ? dataTransfered + maxBufferSize - 6 : dataSize
          let buf1 = Buffer.from(Number(index).toString())
          let buf2 = file.slice(dataTransfered, max)
          let bufA = Buffer.concat([buf1, buf2], buf1.length + buf2.length)
          segments.push(bufA)
          dataTransfered = max
          index++
        }
        let i = 0
        doWhilst((cb) => {
          // console.log('size !! ' + segments[i].length)
          server.send(segments[i], 0, segments[i].length, rinfo.port, rinfo.address, (err, bytes) => {
            if (err) throw err
            // console.log('file segments sent ' + (i + 1) + ' of ' + segments.length)
            i++
            cb()
          })
        },
        () => {
          return i !== segments.length
        },
        (err) => {
          if (err) throw err
          // Setting TimeOut to eventualy remove the client
          let timer = setTimeout(() => {
            let stateIndex = getStateIndex('g', rinfo.address, rinfo.port)
            if (stateIndex !== 0) {
              deleteStateByIndex(stateIndex)
              console.log('client ' + rinfo.address + ':' + rinfo.port + ' removed')
            }
          }, 15000)
          // console.log('file to send size ' + file.length + 'B buffer size: ' + maxBufferSize + 'B segments ' + segments.length)
          // seve the state of the client
          states.push({
            type: 'g',
            host: rinfo.address,
            port: rinfo.port,
            timeout: timer,
            segments: segments
          })
          console.log('file sent to ' + rinfo.address + ':' + rinfo.port)
        })
      })
    })
  } else if (command === 'gi') {
    // client asking for lost segments
    let segmentsIndex = msgParts[1]
    // console.log('enter gi ' + segmentsIndex)
    let nSegments = JSON.parse('[' + segmentsIndex + ']')
    // console.log('enter gi ' + nSegments)
    let state = states[getStateIndex('g', rinfo.port, rinfo.address)]
    clearTimeout(state.timeout)
    // Setting TimeOut to eventualy remove the client
    let file = state.segments
    let i = 0
    doWhilst((cb) => {
      server.send(file[nSegments[i]], 0, file[nSegments[i]].length, rinfo.port, rinfo.address, (err, bytes) => {
        if (err) throw err
        //  console.log('file segments resent ' + nSegments[i])
        i++
        cb()
      })
    },
    () => {
      return i !== nSegments.length
    },
    (err) => {
      if (err) throw err
      // console.log('file sent to ' + rinfo.address + ':' + rinfo.port)
      let timer = setTimeout(() => {
        let stateIndex = getStateIndex('g', rinfo.address, rinfo.port)
        if (stateIndex !== 0) {
          deleteStateByIndex(stateIndex)
          console.log('client ' + rinfo.address + ':' + rinfo.port + ' removed')
        }
      }, 2000)
      state.timeout = timer
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
      let stateIndex = getStateIndex('o', rinfo.address, rinfo.port)
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

    state.received++
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
