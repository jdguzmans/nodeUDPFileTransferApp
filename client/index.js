const communication = require('./communication')

const inquirer = require('inquirer')

const questions = [{
  type: 'rawlist',
  name: 'option',
  message: 'What do you want to do?',
  choices: ['List files', 'Get a file', 'Send a file', 'Exit']
}]

inquirer.prompt(questions)
.then(answers => {
  if (answers.option === 'List files') {
    return communication.listFiles()
    .then(files => {
      files.forEach(file => {
        console.log('- ' + file)
      })
    })
    .catch(e => {
      console.log(e)
    })
  }
})
