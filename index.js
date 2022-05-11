const express = require('express') // expressJS
const app = express() // Initialize express app

const utils = require('./utils-async') // Utilitys/API functions
const config = require('./config.json') // Load configuration data
const logger = require('./logger') // Set up default logger
const winston = require('winston')
const ngrok = require('ngrok');
const open = require('open');

const Sentry = require('@sentry/node');
const Tracing = require("@sentry/tracing");

// Initialize sentry
Sentry.init({
    dsn: "https://5289a117dcb6445d98f31a916c14c4fa@o1069103.ingest.sentry.io/6065463",
    integrations: [
      // enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // enable Express.js middleware tracing
      new Tracing.Integrations.Express({ app }),
    ],
  
    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
});

// Add sentry middleware
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());


// Temporary
app.get('/', (req, res) => {
    res.status(410).send({
        status: "arbitrary_impositon",
        error: `Cleverly done, ${req.ip} but you're not supposed to be here. As a matter of fact, you're not. Get back where you belong, and forget about all this, until we meet again.`
    })
})

// API endpoints
app.post('/session/login', (req, res) => {

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

app.get('/user/getDetails', (req, res) => {

    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else utils.getStudentData(req.headers.accesstoken, res);
})

app.get('/user/getGrades', (req, res) => {

    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else utils.getGrades(req.headers.accesstoken, res);
})

app.get('/user/getSchedule', (req, res) => {

    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else utils.getSchedule(req.headers.accesstoken, res);
})

app.post('/session/destroySession', (req, res) => {

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

// Add error handling middleware
app.use(Sentry.Handlers.errorHandler());

// onError middleware
app.use(function onError(err, req, res, next) {
    logger.error(err.stack)
    res.status(500).send({
        status: 'failed',
        error: err.message
    });
});

// Listen on whatever port is selected
app.listen(config.port, async () => {
    winston.info(`Edformer now listening on port ${config.port}.`)
    if (config.announcement) {
        winston.info(`Announcement found: "${config.announcement}"`)
    }
    if (config.network.ngrokEnabled === true) {
        logger.info('Ngrok is enabled in config, opening...')
        let grktunnel = await ngrok.connect(addrconfig.port)
        logger.info(`Ngrok tunnel opened at ${grktunnel}`)
        if (config.network.openWebUI === true) {
            open('http://localhost:4040')
        }
    }
})

process.on('SIGINT', async function() {
    logger.info(`Shutting down Edformer.`)
    if (config.network.ngrokEnabled === true) {
        logger.info('Closing NGROK tunnel.')
        await ngrok.disconnect().then((a) => {
            logger.info(`Closed ngrok tunnel: ${a}`)
        }).catch((e) => {
            logger.error(`Failed to gracefully close NGROK tunnel!`)
        })
    }
    process.exit();
});