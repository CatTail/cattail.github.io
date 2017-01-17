'use strict'
const fs = require('fs')
const https = require('https')

const options = {
  key: fs.readFileSync('data/server.key.pem'),
  cert: fs.readFileSync('data/server.cert.pem')
}
const httpsServer = https.createServer(options, (req, res) => {
  res.writeHead(200)
  res.end(`You've Been Hacked\n`)
}).listen(8080)
