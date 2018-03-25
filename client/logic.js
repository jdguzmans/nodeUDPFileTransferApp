const config = require('../config')
const fs = require('fs')
const dgram = require('dgram')
const maxBufferSize = config.maxBufferSize
const doWhilst = require('async/doWhilst')

const objectDelay = config.objectDelay
const objectConstantDelay = config.objectConstantDelay

const timeOut = config.timeOutToWaitForServer
const fileDelay = config.fileDelay
var Dequeue = require('dequeue')
const crypto = require('crypto')
let hash = null
let client = null
let timery = null

exports.listLocalFiles = () => {
  return new Promise((resolve, reject) => {
    fs.readdir('./files', (err, files) => {
      if (err) reject(err)
      resolve(files)
    })
  })
}

exports.listRemoteFiles = () => {
  client = dgram.createSocket('udp4')
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
          client.close()
          resolve(files)
        })
      }
    })
  })
}

exports.getFile = (filename, sizeMessage) => {
  client = dgram.createSocket('udp4')
  return new Promise((resolve, reject) => {
    let message = Buffer.from('g ' + filename + ' ' + sizeMessage)
    client.send(message, 0, message.length, config.server.port, config.server.host, (err, bytes) => {
      if (err) reject(err)
      else {
        let buffersize = Number(sizeMessage)
        let fileSize = null
        let filebuffers = null
        let totalsegments = null
        let beginTime = null
        let fileHash = null
        let got = 0
        timery = setTimeout(() => {
          console.log('Time out server did not answer')
          console.log('Plase re-try')
          client.close()
          resolve()
        }, timeOut * 3)
        let timer2 = null
        let FIFO = new Dequeue()
        // msg with initial info
        client.on('message', (msg, rinfo) => {
          if (beginTime === null) {
            let msgString = msg.toString()
            let msgParts = msgString.split(' ')
            if (msgParts.length === 5 && msgParts[0] === 'f') {
              buffersize = Number(msgParts[2])
              fileSize = Number(msgParts[1])
              beginTime = Number(msgParts[3])
              fileHash = msgParts[4]
              totalsegments = (fileSize % (buffersize - 6)) !== 0 ? parseInt(fileSize / (buffersize - 6)) + 1 : parseInt(fileSize / (buffersize - 6))
              filebuffers = new Array(totalsegments)
              clearTimeout(timery)
              timery = setTimeout(() => {
                console.log('Wating for jjj server time out')
                console.log('Plase re-try')
                //  client.close()
                // resolve()
              }, 600000 + fileDelay * fileSize)
              console.log('file parameters recieved: buffer size : ' + buffersize + 'B , file size ' + fileSize + 'B segments ' + totalsegments + ' begin time transmition ' + new Date(beginTime))
            }
          } else {
            FIFO.push(msg)
            clearTimeout(timery)
            if (timer2 !== null) clearTimeout(timer2)
            timer2 = setTimeout(() => {
              console.log('Procesing ...')
              process(resolve, FIFO, filebuffers, filename, fileSize, reject, buffersize, fileHash, beginTime)
            }, (buffersize < 3000) ? buffersize + 6000 : 60000)
            got++
            console.log('Receiving data ...' + got)
          }
        })
      }
    })
  })
}

function process (resolve, FIFO, filebuffers, filename, fileSize, reject, buffersize, fileHash, beginTime) {
  // reciving segments re start timeout
  // putting segments in their position msg.slice(0, 1) has the position
  clearTimeout(timery)
  while (FIFO.length > 0) {
    var msg = FIFO.shift()
    let index = Number(msg.slice(0, 6)) - 100001
    if (filebuffers[index] === undefined) {
      filebuffers[index] = (msg.slice(6, msg.length))
    }
  }
  if (FIFO.length === 0) {
    console.log(' 2 processing segments received ...')
    let total = 0
    let missing = []
    doWhilst((cb) => {
      let i = total
      let max = (filebuffers.length - i > 1000) ? i + 1000 : filebuffers.length
      doWhilst((b) => {
        if (filebuffers[i] === undefined) {
          missing.push(i)
        }
        i++
        total++
        b()
      },
      () => {
        return i !== max
      },
      (err) => {
        if (err) throw err
      })
      cb()
    },
    () => {
      return total !== filebuffers.length
    },
    (err) => {
      if (err) throw err
      if (missing.length !== 0) {
        let buf1 = Buffer.from('gi ')
        let elemts = 1
        let encontro = false
        while (!encontro) {
          if (5 + (elemts) * 6 > buffersize - 3) {
            encontro = true
            elemts--
          }
          elemts++
        }

        let elemtTransfered = 0
        let msgSegments = []
        while (elemtTransfered !== missing.length) {
          let max = ((elemtTransfered + elemts) < missing.length) ? elemtTransfered + elemts : missing.length
          let buf3 = Buffer.from(missing.slice(elemtTransfered, max).toString())
          let bufA = Buffer.concat([buf1, buf3], buf1.length + buf3.length)
          elemtTransfered = max
          msgSegments.push(bufA)
        }
        let i = 0
        // let max = (filebuffers.length - i > 1000) ? i + 1000 : filebuffers.length
        doWhilst((b) => {
          client.send(msgSegments[i], 0, msgSegments[i].length, config.server.port, config.server.host, (err, bytes) => {
            if (err) throw err
            i++
            b()
          })
        },
        () => {
          return i !== msgSegments.length
        },
        (err) => {
          if (err) throw err
          timery = setTimeout(() => {
            console.log('Wating for s3rver time out')
            console.log('Plase re-try')
            client.close()
            resolve()
          }, (buffersize < 3000) ? buffersize + 6000 : 17000)
        })
      } else {
        clearTimeout(timery)
        console.log('Transfer ended')
        let totalTime = new Date((new Date().getTime() - beginTime))
        let seconds = totalTime.getTime() / 1000
        let minutes = seconds / 60
        hash = crypto.createHash('sha256')
        let wStream = fs.createWriteStream('./files/' + filename)
        var buffersTotal = Buffer.concat(filebuffers, fileSize)
        hash.update(buffersTotal)
        let hashFileR = hash.digest('hex')
        console.log('calculating hash ...')
        hash = null
        wStream.write(buffersTotal)
        wStream.end()
        console.log('File saved')
        console.log('Total transfer time ' + seconds + ' seconds')
        console.log('Total transfer time ' + minutes + ' minutes')
        console.log((hashFileR === fileHash) ? 'Hash file correct :)' : 'Hash file incorrect  :/')
        client.close()
        resolve()
      }
    })
  }
}

exports.sendFile = (filename) => {
  return new Promise((resolve, reject) => {
    fs.readFile('./files/' + filename, (err, file) => {
      if (err) throw err

      // segmentATION
      let dataTransfered = 0
      let dataSize = file.length
      let segments = []

      while (dataTransfered !== dataSize) {
        let max = (dataTransfered + maxBufferSize) < dataSize ? dataTransfered + maxBufferSize : dataSize
        segments.push(file.slice(dataTransfered, max))
        dataTransfered = max
      }
      let init = Buffer.from('f ' + filename + ' ' + file.length + ' ' + segments.length)

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
              // File segment
              ff: segments[i]
              // MAYBE FILE segment SIZE ??
            }
            let toSendS = JSON.stringify(toSend)
            client.send(toSendS, 0, toSendS.length, config.server.port, config.server.host, (err, bytes) => {
              if (err) throw err
              i++
              cb()
            })
          },
          () => {
            return i !== segments.length
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
  client = dgram.createSocket('udp4')
  return new Promise((resolve, reject) => {
    // Object
    let init = Buffer.from('o ' + number)

    client.send(init, 0, init.length, config.server.port, config.server.host, (err, bytes) => {
      if (err) throw err
      let i = 0
      doWhilst((cb) => {
        let toSendO = {
          n: i,
          ts: new Date().getTime()
        }
        // Object Iteration
        let toSendS = 'oi ' + JSON.stringify(toSendO)
        let toSendB = Buffer.from(toSendS)
        client.send(toSendB, 0, toSendB.length, config.server.port, config.server.host, (err, bytes) => {
          if (err) throw err
          i++
          cb()
        })
      },
      () => {
        return i !== number
      },
      (err) => {
        if (err) throw err
        console.log('Objects sent')
        let ans = false
        let alive = true

        setTimeout(() => {
          if (!ans) {
            console.log('Server reply lost')
          }
          alive = false
          resolve()
        }, (objectDelay * number + objectConstantDelay) * 2)

        client.on('message', (msg, rinfo) => {
          if (alive) {
            let msgString = msg.toString()
            let msgParts = msgString.split(' ')
            let command = msgParts[0]

            // Object answer
            if (command === 'oa') {
              ans = true
              let msgO = JSON.parse(msgParts[1])

              console.log('Average delay: ' + msgO.averageDelay + 'ms')
              console.log('Datagrams lost: ' + msgO.lost)
            }
          }
          client.close()
        })
      })
    })
  })
}
