const express = require('express') // Recieving requests
const utils = require('./utils-async')
const app = express()
const port = 3000 // Set port

app.post('/session/login', (req, res) => {

    // Check to make sure a username and password is present. If either one is missing, return with an error.
    if (!req.headers.username) {
        res.status(400).send({ status: "failed", error: "Username missing."});
        return;
    } else if (!req.headers.password) {
        res.status(400).send({ status: "failed", error: "Password missing."});
        return;
    }

    utils.loginSSO(req.headers.username, req.headers.password, res);

})

app.post('/session/destroySession', (req, res) => {

    // Check for a session ID. If we don't have one, stop.
    if (!req.headers.sessionid) {
        res.status(400).send({ status: "failed", error: "No session id name given to destroy."});
        return;
    }

    utils.destroySACSession(req.headers.sessionid, res);

})

app.listen(port, () => {
  console.log(`listening at http://localhost:${port}`)
})