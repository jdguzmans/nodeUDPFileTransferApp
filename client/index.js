const fs = require('fs')
const communication = require('./communication')
const inquirer = require('inquirer')

function home () {
  let question = [{
    type: 'rawlist',
    name: 'option',
    message: 'What do you want to do?',
    choices: ['List remote files', 'List local files', 'Get a file', 'Send a file', 'Exit']
  }]

  inquirer.prompt(question)
  .then(answer => {
    if (answer.option === 'List remote files') {
      communication.listRemoteFiles()
      .then(files => {
        files.forEach(file => {
          console.log('- ' + file)
        })
        home()
      })
      .catch(e => {
        console.log(e)
      })
    } else if (answer.option === 'List local files') {
      fs.readdir('./files', (err, files) => {
        if (err) throw err
        files.forEach((file, i) => {
          console.log('- ' + file)
        })
      })
    } else if (answer.option === 'Get a file') {
      getAFile()
    }
  })
}

function getAFile () {
  let question = [{
    type: 'Input',
    name: 'filename',
    message: 'Type the filename in the remote directory'
  }]

  inquirer.prompt(question)
  .then(answer => {
    communication.getFile(answer.filename)
    .then(() => {
      home()
    })
  })
}

home()
