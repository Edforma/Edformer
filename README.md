# Edformer

The API for Edforma.

**Disclaimer:** This program is not affiliated with CISD.

## How does it work?
When a student requests to use the SAC from ClassLink, CL will send a `POST` request the SAC webserver using an endpoint named `sso.asp`, sending alongside the student's username and password (it also sends some SSO related parameters that are unimportant). The SAC webserver returns a valid SAC session token located in `set-cookie.`

Edformer replicates this flow in a server environment and grabs the authenticated token cookie, creates a new entry for it in a local database with a UUID reference, and sends that to the client. That UUID can then be used until the session expires.


## How do I use it?

- Clone this repo: `git clone https://github.com/Edforma/Edformer.git`.
- Run `yarn install` to download all of the required dependencies.
- Modify `config.json` to your needs (here is an example configuration)
```
{
    "port": 3000,
    "announcement": "",
    "network": {
        "ngrokEnabled": false,
        "openWebUI": false
    },
    "debugging": {
        "sentryDsn": "https://5289a117dcb6445d98f31a916c14c4fa@o1069103.ingest.sentry.io/6065463",
        "sentryTraceSamplingRate": 0.5
    }
}
```
- Finally, run `node index.js`. If you are running Edformer in this directory for the first time, two directorys will be made: `data` for database storage, and `logs` for log files.
## Troubleshooting/Questions

### How do I make Edformer accessible from outside networks?
Try [ngrok.](https://ngrok.com/)

## Credits

- Winston
- Express
- Cheerio
- XPath
- Axios
- Sentry
