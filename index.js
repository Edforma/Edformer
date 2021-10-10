const express = require('express') // Recieving requests
// const axios = require('axios') // Sending requests (NOT NEEDED YET)
const utils = require('./utils-async')
const app = express()
const port = 3000 // Set port

app.post('/login', (req, res) => {

    // Check to make sure a username and password is present. If either one is missing, return with an error.
    if (!req.headers.username) {
        res.send({ status: "failed", error: "Username missing."})
        return;
    } else if (!req.headers.password) {
        res.send({ status: "failed", error: "Password missing."})
        return;
    }

    utils.loginSSO(req.headers.username, req.headers.password, res)

})

app.listen(port, () => {
  console.log(`listening at http://localhost:${port}`)
})