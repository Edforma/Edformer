const express = require('express') // expressJS
const app = express() // Initialize express app
const utils = require('./utils-async') // Utilitys/API functions
const config = require('./config.json') // Load configuration data
const logger = require('./logger') // Set up default logger
const winston = require('winston')
const Sentry = require('@sentry/node');
const Tracing = require("@sentry/tracing");
const { CLI } = require("cliffy")
const art = require("ascii-art")

let coolTitle = art.font("Some Text", 'doom', (err, rendered)=>{
    return rendered;
});
console.log(coolTitle)
// Initialize sentry
winston.info('Initializing Sentry...')
Sentry.init({
    dsn: config.sentryDsn,
    integrations: [
      // enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // enable Express.js middleware tracing
      new Tracing.Integrations.Express({ app }),
    ],
    tracesSampleRate: config.sentryTraceSamplingRate,
})
// Add some sentry middleware
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());


// API endpoints
winston.info('Declaring API routes...')
app.post('/auth/login', (req, res) => {

    // Check to make sure a username and password is present. If either one is missing, return with an error.
    if (!req.headers.username) {
        res.status(400).send({
            status: "failed",
            error: "Username missing."
        });
        return;
    } else if (!req.headers.password) {
        res.status(400).send({
            status: "failed",
            error: "Password missing."
        });
        return;
    }
    utils.loginSSO(req.headers.username, req.headers.password, res);

})
app.get('/student/getDetails', (req, res) => {

    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else utils.getStudentData(req.headers.accesstoken, res);
})
app.get('/student/getGrades', (req, res) => {

    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else utils.getGrades(req.headers.accesstoken, res);
})
app.get('/student/getSchedule', (req, res) => {

    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else utils.getSchedule(req.headers.accesstoken, res);
})
app.post('/student/logout', (req, res) => {

    // Check for a session ID. If we don't have one, stop.
    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "No accessToken cookie given to destroy."
        });
        return;
    } else utils.destroySACSession(req.headers.accesstoken, res);

})
app.get('/server/ping', (req, res) => {
    res.send({
        status: 'success',
        server: {
            version: null,
            announcement: config.announcement
        }
    });
})

// Sentry middleware
winston.info('Finishing up...')
app.use(Sentry.Handlers.errorHandler());
app.use(function onError(err, req, res, next) {
    logger.error(err.stack)
    res.status(500).send({
        status: 'failed',
        error: err.message
    });
});

// Listen on whatever port is selected
app.listen(config.port, async () => {
    winston.info(`Welcome to Edformer - Entering console`)
    // Begin CLI initilization
    const cli = new CLI()
        .setDelimiter('edformer> ')
        .addCommand("exit", {
            description: "Exits Edformer.",
            action: () => {
                winston.info('Closing sessions, please wait...')
                process.exit();
            },
        })
        .show();
})