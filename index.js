import { Handlers, Integrations, init } from '@sentry/node'
import "@sentry/tracing";
import {ProfilingIntegration} from "@sentry/profiling-node";
import { getGrades, getStudentData, login, logout } from './components/utils.js' // Utilitys/API functions

import express from 'express' // expressJS
import './components/logger.js' // Set up default logger
import winston from 'winston'
import PouchDB from 'pouchdb';
import { CLI } from 'cliffy'

const app = express() // Initialize express app
const db = new PouchDB('data')

console.log(process.env)
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

// API endpoints
app
    .post('/auth/login', (req, res) => {

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
    .get('/student/getDetails', (req, res) => {

        if (!req.headers.accesstoken) {
            res.status(400).send({
                status: "failed",
                error: "accessToken missing."
            });
            return;
        } else getStudentData(req.headers.accesstoken, res);
    })
    .get('/student/getGrades', (req, res) => {

        if (!req.headers.accesstoken) {
            res.status(400).send({
                status: "failed",
                error: "accessToken missing."
            });
            return;
        } else getGrades(req.headers.accesstoken, res);
    })
    .get('/student/getSched', (req, res) => {

        if (!req.headers.accesstoken) {
            res.status(400).send({
                status: "failed",
                error: "accessToken missing."
            });
            return;
        } else getSched(req.headers.accesstoken, res);
    })
    .post('/auth/logout', (req, res) => {

        // Check for a session ID. If we don't have one, stop.
        if (!req.headers.accesstoken) {
            res.status(400).send({
                status: "failed",
                error: "accessToken missing."
            });
            return;
        } else logout(req.headers.accesstoken, res);

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
    // Begin CLI initilization
    // I want to eventually move the commands to another place, but this works for now.
    const cli = new CLI()
        .setDelimiter('e: ')
        .addCommand("database", {
            description: "Run operations with the token database",
            subcommands: {
                info: {
                    description: "Get information on the database",
                    action: async () => {
                        await db.info().then((info) => {
                            winston.info(`Database name: ${info.db_name}`)
                            winston.info(`Database adapter: ${info.adapter}`)
                            winston.info(`Number of stored tokens: ${info.doc_count}`);
                        })
                    }
                },
                cookie: {
                    description: "Get the raw ASP Session cookie of a token",
                    parameters: ['token'],
                    action: async (params) => {
                        let authDoc = await db.get("session-" + params.token);
                        return winston.info(authDoc.cookieData.name + '=' + authDoc.cookieData.token)
                    }
                },
                wipeall: {
                    description: "Delete all tokens stored in PouchDB",
                    options: [{ label: "seriously", description: "You seriously want to do this" }],
                    action: async (params, options) => {
                        if (!options.seriously) {
                            winston.error('This command wipes all tokens from PouchDB, invalidating all sessions linked to this instance of Edformer.')
                            winston.error('If you really want to do this, pass the @seriously option.')
                        } else {
                            winston.error('If you say so. Wiping all documents in PouchDB...')
                            db.destroy()
                            winston.error('Finished.')
                        }
                    }
                }
            }
        })
        .addCommand("exit", {
            description: "Exits Edformer.",
            action: () => {
                winston.info('Closing sessions, please wait...')
                process.exit();
            },
        })
        .show();
        
})