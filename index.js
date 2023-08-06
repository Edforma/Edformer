import { Handlers, Integrations, init } from '@sentry/node'
import "@sentry/tracing";
import {ProfilingIntegration} from "@sentry/profiling-node";
import { handleAuth } from './components/utils.js' // Utilitys/API functions

import express from 'express' // expressJS
import './components/logger.js' // Set up default logger
import winston from 'winston'
import tx2 from 'tx2'

const app = express() // Initialize express app

// Initialize sentry
init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
        // HTTP calls tracing
        new Integrations.Http({ tracing: true }),
        // express.js middleware tracing
        new Integrations.Express({ app }),
        // profiling integration
        new ProfilingIntegration()
    ],
    tracesSampleRate: process.env.SENTRY_TRACESAMPLERATE,
    profilesSampleRate: process.env.SENTRY_TRACEPROFILERATE,
})
// Add some sentry middleware
app.use(Handlers.requestHandler());
app.use(Handlers.tracingHandler());
app.use(express.json())
// Initialize tickers for PM2
let loginsPerSecondMeter = tx2.meter({
    name: 'logins/sec',
    samples: 1,
    timeframe: 60
})

// API endpoints
app
    .post('/handleAuth', (req, res) => {
        console.log(req.body)
        loginsPerSecondMeter.mark();
        handleAuth(req.body.SAMLResponse, res);
    })
    .get('/server/ping', (req, res) => {
        res.send({
            status: 'success',
            server: {
                version: process.env.npm_package_version,
                announcement: process.env.SERVER_ANNOUNCEMENT
            }
        });
    })

// Sentry middleware
app.use(Handlers.errorHandler());
app.use(function onError(err, req, res, next) {
    winston.error(err.stack)
    res.status(500).send({
        status: 'failed',
        error: err.message
    });
});

// Listen on whatever port is selected
app.listen(process.env.PORT, async () => {
    winston.info(`Edformer has started.`)
})