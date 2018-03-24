
const logic = require('./logic')
const inquirer = require('inquirer')

function home () {
  let question = [{
    type: 'rawlist',
    name: 'option',
    message: 'What do you want to do?',
    choices: ['List remote files', 'List local files', 'Get a file', 'Send a file', 'Send objects', 'Exit']
  }]

  inquirer.prompt(question)
    .then(answer => {
      if (answer.option === 'List remote files') {
        logic.listRemoteFiles()
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
        logic.listLocalFiles()
        .then(files => {
          files.forEach(file => {
            console.log('- ' + file)
          })
          home()
        })
      } else if (answer.option === 'Get a file') {
        let qs = [{
          type: 'Input',
          name: 'filename',
          message: 'Type the filename in the remote directory'
        }]
      
        inquirer.prompt(qs)
          .then(answer => {
            logic.getFile(answer.filename)
              .then(() => {
                home()
              })
          })
      } else if (answer.option === 'Send a file') {
        logic.sendFile('dummy.pdf')
          .then(() => {
            home()
          })
      } else if (answer.option === 'Send objects') {
        let qs = [{
          type: 'input',
          name: 'number',
          message: 'How many objects?',
          validate: (value) => {
            var valid = !isNaN(parseFloat(value))
            return valid || 'Please enter a number'
          },
          filter: Number
        }]
        inquirer.prompt(qs).then(ans => {
          let number = ans.number
          logic.sendObjects(number)
            .then(() => {
              home()
            })
        })
      }
    })
}

home()
