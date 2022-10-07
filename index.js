import { Handlers, Integrations, init } from '@sentry/node'
import config from './config.json' assert {type: 'json'}; // Load configuration data
import {getGrades, getStudentData, getSched, login, logout} from './utils-async.js' // Utilitys/API functions

import { CLI } from "cliffy"
import { Integrations as _Integrations } from "@sentry/tracing"
import express from 'express' // expressJS
import './logger.js' // Set up default logger
import winston from 'winston'

const app = express() // Initialize express app

// Initialize sentry
winston.info('Initializing Sentry...')
init({
    dsn: config.debugging.sentryDsn,
    integrations: [
      // enable HTTP calls tracing
      new Integrations.Http({ tracing: true }),
      // enable Express.js middleware tracing
      new _Integrations.Express({ app }),
    ],
    tracesSampleRate: config.debugging.sentryTraceSamplingRate,
})
// Add some sentry middleware
app.use(Handlers.requestHandler());
app.use(Handlers.tracingHandler());

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
    login(req.headers.username, req.headers.password, res);

})
app.get('/student/getDetails', (req, res) => {

    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else getStudentData(req.headers.accesstoken, res);
})
app.get('/student/getGrades', (req, res) => {

    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else getGrades(req.headers.accesstoken, res);
})
app.get('/student/getSched', (req, res) => {

    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else getSched(req.headers.accesstoken, res);
})
app.post('/auth/logout', (req, res) => {

    // Check for a session ID. If we don't have one, stop.
    if (!req.headers.accesstoken) {
        res.status(400).send({
            status: "failed",
            error: "accessToken missing."
        });
        return;
    } else logout(req.headers.accesstoken, res);

})
app.get('/server/ping', (req, res) => {
    res.send({
        status: 'success',
        server: {
            version: process.env.npm_package_version,
            announcement: config.announcement
        }
    });
})

// Sentry middleware
winston.info('Finishing up...')
app.use(Handlers.errorHandler());
app.use(function onError(err, req, res, next) {
    winston.error(err.stack)
    res.status(500).send({
        status: 'failed',
        error: err.message
    });
});

// Listen on whatever port is selected
app.listen(config.port, async () => {
    winston.info(`Edformer has started. Entering console...`)
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